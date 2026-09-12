const MAX_OCCURRENCE_DAYS = 366;

const vietnamParts = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A VSP meeting has an invalid date/time.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` };
};

const moveDate = (date, days) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const meetingIdentity = (meeting) => {
  if (typeof meeting?.recID !== 'string' || !meeting.recID.trim()) {
    throw new Error('A VSP meeting is missing recID.');
  }
  const attendeeIds = [...new Set(
    (meeting.listAttendees ?? []).map((attendee) => attendee.employeeId).filter(Boolean),
  )];
  if (!attendeeIds.length) throw new Error(`VSP meeting ${meeting.recID} has no matched dashboard attendees.`);
  const organizerIds = [...new Set(
    meeting.listAttendees
      .filter((attendee) => String(attendee.roleType) === '2')
      .map((attendee) => attendee.employeeId)
      .filter(Boolean),
  )];
  if (organizerIds.length > 1) {
    throw new Error(`VSP meeting ${meeting.recID} has multiple roleType 2 organizers matched to dashboard profiles.`);
  }
  return { externalId: meeting.recID.trim(), attendeeIds, organizerId: organizerIds[0] ?? attendeeIds[0] };
};

export const meetingOccurrenceDates = (meeting) => {
  const start = vietnamParts(meeting?.startDate);
  const end = vietnamParts(meeting?.endDate);
  if (end.date < start.date || end.time < start.time) {
    throw new Error(`VSP meeting ${meeting?.recID ?? ''} has an invalid daily date/time range.`);
  }
  const dates = [];
  for (let date = start.date; date <= end.date; date = moveDate(date, 1)) {
    dates.push(date);
    if (dates.length > MAX_OCCURRENCE_DAYS) {
      throw new Error(`VSP meeting ${meeting?.recID ?? ''} spans more than ${MAX_OCCURRENCE_DAYS} days.`);
    }
  }
  return { dates, startTime: start.time, endTime: end.time };
};

export const meetingSyncArguments = (meeting, occurrenceDate) => {
  const identity = meetingIdentity(meeting);
  const range = meetingOccurrenceDates(meeting);
  const date = occurrenceDate ?? range.dates[0];
  if (!range.dates.includes(date)) {
    throw new Error(`VSP meeting ${identity.externalId} occurrence date is outside its date range.`);
  }
  return {
    p_external_source: 'vsp_eoffice',
    p_external_id: identity.externalId,
    p_external_occurrence_date: date,
    p_organizer_id: identity.organizerId,
    p_date: date,
    p_content: String(meeting.title || 'Meeting').trim() || 'Meeting',
    p_location: String(meeting.resourceName || 'Not specified').trim() || 'Not specified',
    p_start_time: range.startTime,
    p_end_time: range.endTime,
    p_attendee_ids: identity.attendeeIds,
  };
};

export const meetingSyncOccurrences = (meeting) => {
  const range = meetingOccurrenceDates(meeting);
  return range.dates.map((date) => meetingSyncArguments(meeting, date));
};

const occurrenceKey = (externalId, date) => `${externalId}|${date}`;

export const syncMeetings = async (client, meetings) => {
  const records = [];
  const errors = [];
  const skippedAttendees = [];
  const prepared = [];
  let generatedOccurrenceCount = 0;

  for (const meeting of meetings) {
    try {
      const occurrences = meetingSyncOccurrences(meeting);
      generatedOccurrenceCount += occurrences.length;
      prepared.push(...occurrences.map((args) => ({ meeting, args })));
    } catch (error) {
      errors.push({
        externalId: typeof meeting?.recID === 'string' && meeting.recID.trim() ? meeting.recID : null,
        occurrenceDate: null,
        error: error instanceof Error ? error.message : 'Unable to prepare meeting.',
      });
    }
  }
  if (!prepared.length) return { records, errors, skippedAttendees, generatedOccurrenceCount };

  const externalIds = [...new Set(prepared.map(({ args }) => args.p_external_id))];
  const existingResult = await client
    .from('employee_meetings')
    .select('id,external_id,external_occurrence_date,date')
    .eq('external_source', 'vsp_eoffice')
    .in('external_id', externalIds);
  if (existingResult.error) {
    const message = `Unable to check existing VSP meetings: ${existingResult.error.message}`;
    errors.push(...prepared.map(({ args }) => ({ externalId: args.p_external_id, occurrenceDate: args.p_date, error: message })));
    return { records, errors, skippedAttendees, generatedOccurrenceCount };
  }
  const existingByOccurrence = new Map(
    (existingResult.data ?? []).map((meeting) => [
      occurrenceKey(meeting.external_id, meeting.external_occurrence_date ?? meeting.date), meeting.id,
    ]),
  );
  const pending = prepared.filter(({ args }) => {
    const existingId = existingByOccurrence.get(occurrenceKey(args.p_external_id, args.p_date));
    if (!existingId) return true;
    records.push({ externalId: args.p_external_id, occurrenceDate: args.p_date, meetingId: existingId, action: 'unchanged', attendeeCount: null });
    return false;
  });
  if (!pending.length) return { records, errors, skippedAttendees, generatedOccurrenceCount };

  const dates = [...new Set(pending.map(({ args }) => args.p_date))];
  const employeeIds = [...new Set(pending.flatMap(({ args }) => args.p_attendee_ids))];
  const availability = await client
    .from('daily_status')
    .select('employee_id,date,status')
    .in('date', dates)
    .in('employee_id', employeeIds)
    .in('status', ['leave', 'sick', 'business_trip']);
  if (availability.error) {
    const message = `Unable to check attendee availability: ${availability.error.message}`;
    errors.push(...pending.map(({ args }) => ({ externalId: args.p_external_id, occurrenceDate: args.p_date, error: message })));
    return { records, errors, skippedAttendees, generatedOccurrenceCount };
  }

  const unavailable = new Map(
    (availability.data ?? []).map((status) => [`${status.date}|${status.employee_id}`, status.status]),
  );
  for (const { meeting, args } of pending) {
    const attendeesById = new Map(meeting.listAttendees.map((attendee) => [attendee.employeeId, attendee]));
    const availableIds = [];
    for (const employeeId of args.p_attendee_ids) {
      const reason = unavailable.get(`${args.p_date}|${employeeId}`);
      if (!reason) {
        availableIds.push(employeeId);
        continue;
      }
      const attendee = attendeesById.get(employeeId);
      skippedAttendees.push({
        externalId: args.p_external_id, occurrenceDate: args.p_date,
        employeeCode: attendee?.employeeCode ?? null, name: attendee?.name ?? null, reason,
      });
    }
    if (!availableIds.length) {
      errors.push({
        externalId: args.p_external_id,
        occurrenceDate: args.p_date,
        error: `VSP meeting ${args.p_external_id} has no available dashboard attendees on ${args.p_date}.`,
      });
      continue;
    }

    try {
      const rpcArgs = { ...args, p_attendee_ids: availableIds };
      const { data, error } = await client.rpc('sync_external_employee_meeting', rpcArgs);
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.meeting_id) throw new Error('Meeting sync RPC returned no meeting ID.');
      records.push({
        externalId: args.p_external_id, occurrenceDate: args.p_date, meetingId: result.meeting_id,
        action: result.was_created ? 'created' : 'unchanged', attendeeCount: availableIds.length,
      });
    } catch (error) {
      errors.push({
        externalId: args.p_external_id,
        occurrenceDate: args.p_date,
        error: error instanceof Error ? error.message : 'Unable to sync meeting.',
      });
    }
  }
  return { records, errors, skippedAttendees, generatedOccurrenceCount };
};
