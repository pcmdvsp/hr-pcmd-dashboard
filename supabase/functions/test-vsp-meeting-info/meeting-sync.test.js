import test from 'node:test';
import assert from 'node:assert/strict';
import { meetingSyncArguments, meetingSyncOccurrences, syncMeetings } from './meeting-sync.js';

const sample = {
  recID: 'external-1', resourceName: 'Room 408', title: 'TCM meeting',
  startDate: '2026-08-17T02:30:00+00:00', endDate: '2026-08-17T04:30:00+00:00',
  listAttendees: [
    { employeeId: 'profile-1', employeeCode: '18351', name: 'Nguyễn Văn A', roleType: '2' },
    { employeeId: 'profile-1', employeeCode: '18351', name: 'Nguyễn Văn A', roleType: '2' },
    { employeeId: 'profile-2', employeeCode: '18352', name: 'Trần Văn B' },
  ],
};

const resultQuery = (result) => ({
  select() { return this; }, eq() { return this; }, in() { return this; },
  then(resolve) { resolve(result); },
});

test('maps VSP UTC timestamps to Vietnam meeting columns', () => {
  assert.deepEqual(meetingSyncArguments(sample), {
    p_external_source: 'vsp_eoffice', p_external_id: 'external-1',
    p_external_occurrence_date: '2026-08-17', p_organizer_id: 'profile-1',
    p_date: '2026-08-17', p_content: 'TCM meeting', p_location: 'Room 408',
    p_start_time: '09:30:00', p_end_time: '11:30:00',
    p_attendee_ids: ['profile-1', 'profile-2'],
  });
});

test('expands an eOffice multi-day booking into one daily occurrence with repeated hours', () => {
  const occurrences = meetingSyncOccurrences({
    ...sample,
    startDate: '2026-09-15T07:30:00+07:00',
    endDate: '2026-09-17T17:00:00+07:00',
  });
  assert.deepEqual(occurrences.map((item) => ({
    date: item.p_date,
    occurrenceDate: item.p_external_occurrence_date,
    startTime: item.p_start_time,
    endTime: item.p_end_time,
  })), [
    { date: '2026-09-15', occurrenceDate: '2026-09-15', startTime: '07:30:00', endTime: '17:00:00' },
    { date: '2026-09-16', occurrenceDate: '2026-09-16', startTime: '07:30:00', endTime: '17:00:00' },
    { date: '2026-09-17', occurrenceDate: '2026-09-17', startTime: '07:30:00', endTime: '17:00:00' },
  ]);
});

test('syncs only missing days and checks attendee availability per occurrence', async () => {
  const multiDay = {
    ...sample,
    startDate: '2026-09-15T07:30:00+07:00',
    endDate: '2026-09-17T17:00:00+07:00',
  };
  const rpcArgs = [];
  const client = {
    from: (table) => resultQuery(table === 'employee_meetings'
      ? { data: [{ id: 'meeting-15', external_id: 'external-1', external_occurrence_date: '2026-09-15', date: '2026-09-15' }], error: null }
      : { data: [{ employee_id: 'profile-1', date: '2026-09-16', status: 'leave' }], error: null }),
    rpc: async (_name, args) => {
      rpcArgs.push(args);
      return { data: [{ meeting_id: `meeting-${args.p_date.slice(-2)}`, was_created: true }], error: null };
    },
  };
  const result = await syncMeetings(client, [multiDay]);
  assert.equal(result.generatedOccurrenceCount, 3);
  assert.deepEqual(rpcArgs.map((args) => ({ date: args.p_date, attendees: args.p_attendee_ids })), [
    { date: '2026-09-16', attendees: ['profile-2'] },
    { date: '2026-09-17', attendees: ['profile-1', 'profile-2'] },
  ]);
  assert.deepEqual(result.records.map((item) => ({ date: item.occurrenceDate, action: item.action })), [
    { date: '2026-09-15', action: 'unchanged' },
    { date: '2026-09-16', action: 'created' },
    { date: '2026-09-17', action: 'created' },
  ]);
  assert.deepEqual(result.skippedAttendees, [{
    externalId: 'external-1', occurrenceDate: '2026-09-16', employeeCode: '18351', name: 'Nguyễn Văn A', reason: 'leave',
  }]);
});

test('rejects invalid meetings safely', () => {
  assert.throws(() => meetingSyncArguments({ ...sample, recID: '' }), /missing recID/);
  assert.throws(() => meetingSyncArguments({ ...sample, listAttendees: [] }), /no matched/);
  assert.throws(() => meetingSyncArguments({ ...sample, endDate: '2026-08-17T01:00:00Z' }), /invalid daily/);
  const fallback = meetingSyncArguments({ ...sample, listAttendees: sample.listAttendees.map((item) => ({ ...item, roleType: '1' })) });
  assert.equal(fallback.p_organizer_id, 'profile-1');
  assert.throws(() => meetingSyncArguments({
    ...sample,
    listAttendees: [sample.listAttendees[0], { ...sample.listAttendees[2], roleType: '2' }],
  }), /multiple roleType 2/);
});

test('reports created and failed occurrences without leaking session data', async () => {
  let call = 0;
  const client = {
    from: () => resultQuery({ data: [], error: null }),
    rpc: async () => {
      call += 1;
      if (call === 1) return { data: [{ meeting_id: 'meeting-1', was_created: true }], error: null };
      return { data: null, error: { message: 'Database rejected meeting.' } };
    },
  };
  const result = await syncMeetings(client, [sample, { ...sample, recID: 'external-2' }]);
  assert.deepEqual(result.records, [{ externalId: 'external-1', occurrenceDate: '2026-08-17', meetingId: 'meeting-1', action: 'created', attendeeCount: 2 }]);
  assert.deepEqual(result.errors, [{ externalId: 'external-2', occurrenceDate: '2026-08-17', error: 'Database rejected meeting.' }]);
  assert.deepEqual(result.skippedAttendees, []);
});

test('removes unavailable attendees before RPC and reports them separately', async () => {
  let rpcArgs;
  const client = {
    from: (table) => resultQuery(table === 'employee_meetings'
      ? { data: [], error: null }
      : { data: [{ employee_id: 'profile-1', date: '2026-08-17', status: 'leave' }], error: null }),
    rpc: async (_name, args) => {
      rpcArgs = args;
      return { data: [{ meeting_id: 'meeting-1', was_created: true }], error: null };
    },
  };
  const result = await syncMeetings(client, [sample]);
  assert.deepEqual(rpcArgs.p_attendee_ids, ['profile-2']);
  assert.deepEqual(result.skippedAttendees, [{
    externalId: 'external-1', occurrenceDate: '2026-08-17', employeeCode: '18351', name: 'Nguyễn Văn A', reason: 'leave',
  }]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records[0].attendeeCount, 1);
});

test('does not call RPC when no attendee remains available', async () => {
  let rpcCalled = false;
  const statusResult = { data: [
        { employee_id: 'profile-1', date: '2026-08-17', status: 'leave' },
        { employee_id: 'profile-2', date: '2026-08-17', status: 'business_trip' },
      ], error: null };
  const result = await syncMeetings({
    from: (table) => resultQuery(table === 'employee_meetings' ? { data: [], error: null } : statusResult),
    rpc: async () => { rpcCalled = true; },
  }, [sample]);
  assert.equal(rpcCalled, false);
  assert.equal(result.records.length, 0);
  assert.match(result.errors[0].error, /no available dashboard attendees/);
  assert.equal(result.skippedAttendees.length, 2);
});

test('leaves an existing external meeting and its attendees unchanged', async () => {
  let dailyStatusRead = false;
  let rpcCalled = false;
  const result = await syncMeetings({
    from: (table) => {
      if (table === 'daily_status') dailyStatusRead = true;
      return resultQuery(table === 'employee_meetings'
        ? { data: [{ id: 'meeting-existing', external_id: 'external-1', external_occurrence_date: '2026-08-17', date: '2026-08-17' }], error: null }
        : { data: [], error: null });
    },
    rpc: async () => { rpcCalled = true; },
  }, [sample]);
  assert.equal(dailyStatusRead, false);
  assert.equal(rpcCalled, false);
  assert.deepEqual(result.records, [{
    externalId: 'external-1', occurrenceDate: '2026-08-17', meetingId: 'meeting-existing', action: 'unchanged', attendeeCount: null,
  }]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.skippedAttendees, []);
});
