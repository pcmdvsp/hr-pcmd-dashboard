import test from 'node:test';
import assert from 'node:assert/strict';
import { corporateAccount, extractMeetings, filterMeetings } from './meeting-filter.js';

const staff = [{ id: 'profile-1', email: 'Member.HQ@vietsov.com.vn', full_name: 'Test Member', employee_code: 'TEST01', department_id: 'ban' }];
const meeting = (attendees = []) => ({
  recID: 'meeting-1', resourceName: 'Room 408', title: 'Test meeting',
  startDate: '2026-08-17T02:30:00+00:00', endDate: '2026-08-17T04:30:00+00:00',
  listAttendees: attendees,
});

const envelope = (meetings) => ({
  msgBodyData: [[meetings, 0, {}]], haveBusinessError: false, haveServerError: false,
});

test('reads the observed eOffice tuple without treating metadata as meetings', () => {
  const records = [meeting([{ id: 'member.hq' }]), { ...meeting(), recID: 'meeting-2' }];
  assert.deepEqual(extractMeetings(envelope(records)), records);
  assert.equal(filterMeetings(extractMeetings(envelope(records)), staff).length, 1);
  assert.deepEqual(extractMeetings(envelope([])), []);
});

test('rejects upstream business/server errors even with an empty meeting list', () => {
  assert.throws(() => extractMeetings({ ...envelope([]), haveBusinessError: true }), /business or server error/);
  assert.throws(() => extractMeetings({ ...envelope([]), haveServerError: true }), /business or server error/);
});

test('does not silently ignore malformed tuples or malformed meeting entries', () => {
  for (const msgBodyData of [null, [], [[null, 0, {}]], [[[], 0]], [[[], 0, {}], [[], 0, {}]]]) {
    assert.throws(() => extractMeetings({ msgBodyData }));
  }
  assert.throws(() => extractMeetings(envelope([meeting(), {}])));
});

test('normalizes corporate emails and rejects other domains', () => {
  assert.equal(corporateAccount(' Member.HQ@vietsov.com.vn '), 'member.hq');
  assert.equal(corporateAccount('member.hq@other.example'), null);
  assert.equal(corporateAccount('member.hq'), null);
});

test('keeps matching meetings and only matched attendees with no raw permissions', () => {
  const input = { ...meeting([{ id: ' MEMBER.HQ ', name: 'Upstream Name', roleType: '1' }, { id: 'outsider' }, { id: 'member.hq', roleType: '2' }]), permissions: [{ secret: 'omit' }] };
  const result = filterMeetings([input], staff);
  assert.equal(result.length, 1);
  assert.equal(result[0].listAttendees.length, 1);
  assert.equal(result[0].listAttendees[0].name, 'Test Member');
  assert.equal(result[0].listAttendees[0].employeeId, 'profile-1');
  assert.equal(result[0].listAttendees[0].roleType, '2');
  assert.equal(result[0].resourceName, 'Room 408');
  assert.equal(result[0].startDate, input.startDate);
  assert.equal(Object.hasOwn(result[0], 'permissions'), false);
  assert.equal(input.listAttendees.length, 3);
});

test('does not match by name, substring, creator or permissions', () => {
  const input = { ...meeting([{ id: 'other', name: 'Test Member' }, { id: 'member.hq2' }, { id: 'member.hq@other.example' }]), createdBy: 'member.hq', permissions: [{ objectID: 'member.hq' }] };
  assert.deepEqual(filterMeetings([input, meeting()], staff), []);
});

test('accepts sample records and explicit envelopes; fails on malformed responses', () => {
  const input = meeting([{ id: 'member.hq' }]);
  assert.deepEqual(extractMeetings(input), [input]);
  assert.deepEqual(extractMeetings({ data: { items: [input] } }), [input]);
  assert.deepEqual(extractMeetings({ data: [] }), []);
  assert.throws(() => extractMeetings({ message: 'Login required' }));
  assert.throws(() => extractMeetings({ ...input, listAttendees: null }));
  assert.throws(() => extractMeetings({ data: [], result: [] }));
});

test('empty or ambiguous corporate identity lists fail rather than silently filtering everything', () => {
  assert.throws(() => filterMeetings([], []));
  assert.throws(() => filterMeetings([], [{ email: 'member.hq@other.example' }]));
  assert.throws(() => filterMeetings([], [...staff, ...staff]));
});

test('matches staff across subteams and leaders without a department', () => {
  const profiles = [
    { ...staff[0], department: { name: 'Block 09-2/09' } },
    { ...staff[0], id: 'profile-2', email: 'other.hq@vietsov.com.vn', department_id: 'team-2', department: [{ name: 'Block 09-3/12' }] },
    { ...staff[0], id: 'profile-3', email: 'leader.hq@vietsov.com.vn', department_id: null, department: null },
  ];
  const result = filterMeetings([meeting([{ id: 'member.hq' }, { id: 'other.hq' }, { id: 'leader.hq' }, { id: 'external.hq' }])], profiles);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].listAttendees.map(person => person.departmentName), ['Block 09-2/09', 'Block 09-3/12', null]);
  assert.equal(result[0].listAttendees[2].departmentId, null);
});
