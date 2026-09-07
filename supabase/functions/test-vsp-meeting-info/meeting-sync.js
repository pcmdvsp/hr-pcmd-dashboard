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

export const meetingSyncArguments = (meeting) => {
  if (typeof meeting?.recID !== 'string' || !meeting.recID.trim()) {
    throw new Error('A VSP meeting is missing recID.');
  }
  const start = vietnamParts(meeting.startDate);
  const end = vietnamParts(meeting.endDate);
  if (start.date !== end.date || end.time < start.time) {
    throw new Error(`VSP meeting ${meeting.recID} crosses a Vietnam calendar day and cannot be stored by the current schema.`);
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
  // If the eOffice creator is outside the Ban roster, use a matched attendee as
  // the required local organizer. RLS separately lets every imported attendee edit.
  const organizerId = organizerIds[0] ?? attendeeIds[0];
  return {
    p_external_source: 'vsp_eoffice',
    p_external_id: meeting.recID.trim(),
    p_organizer_id: organizerId,
    p_date: start.date,
    p_content: String(meeting.title || 'Meeting').trim() || 'Meeting',
    p_location: String(meeting.resourceName || 'Not specified').trim() || 'Not specified',
    p_start_time: start.time,
    p_end_time: end.time,
    p_attendee_ids: attendeeIds,
  };
};

export const syncMeetings = async (client, meetings) => {
  const records = [];
  const errors = [];
  const skippedAttendees = [];
  const candidates = [];
  for (const meeting of meetings) {
    if (typeof meeting?.recID !== 'string' || !meeting.recID.trim()) {
      errors.push({ externalId: null, error: 'A VSP meeting is missing recID.' });
    } else {
      candidates.push(meeting);
    }
  }
  if (!candidates.length) return { records, errors, skippedAttendees };

  const externalIds = [...new Set(candidates.map((meeting) => meeting.recID.trim()))];
  const existingResult = await client
    .from('employee_meetings')
    .select('id,external_id')
    .eq('external_source', 'vsp_eoffice')
    .in('external_id', externalIds);
  if (existingResult.error) {
    const message = `Unable to check existing VSP meetings: ${existingResult.error.message}`;
    errors.push(...candidates.map((meeting) => ({ externalId: meeting.recID, error: message })));
    return { records, errors, skippedAttendees };
  }
  const existingByExternalId = new Map(
    (existingResult.data ?? []).map((meeting) => [meeting.external_id, meeting.id]),
  );

  const prepared = [];
  for (const meeting of candidates) {
    const existingId = existingByExternalId.get(meeting.recID.trim());
    if (existingId) {
      records.push({
        externalId: meeting.recID,
        meetingId: existingId,
        action: 'unchanged',
        attendeeCount: null,
      });
      continue;
    }
    try {
      const args = meetingSyncArguments(meeting);
      prepared.push({ meeting, args });
    } catch (error) {
      errors.push({
        externalId: typeof meeting?.recID === 'string' ? meeting.recID : null,
        error: error instanceof Error ? error.message : 'Unable to prepare meeting.',
      });
    }
  }

  if (!prepared.length) return { records, errors, skippedAttendees };

  const dates = [...new Set(prepared.map(({ args }) => args.p_date))];
  const employeeIds = [...new Set(prepared.flatMap(({ args }) => args.p_attendee_ids))];
  const availability = await client
    .from('daily_status')
    .select('employee_id,date,status')
    .in('date', dates)
    .in('employee_id', employeeIds)
    .in('status', ['leave', 'sick', 'business_trip']);
  if (availability.error) {
    const message = `Unable to check attendee availability: ${availability.error.message}`;
    errors.push(...prepared.map(({ meeting }) => ({ externalId: meeting.recID, error: message })));
    return { records, errors, skippedAttendees };
  }

  const unavailable = new Map(
    (availability.data ?? []).map((status) => [`${status.date}|${status.employee_id}`, status.status]),
  );
  for (const { meeting, args } of prepared) {
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
        externalId: meeting.recID,
        employeeCode: attendee?.employeeCode ?? null,
        name: attendee?.name ?? null,
        reason,
      });
    }
    if (!availableIds.length) {
      errors.push({
        externalId: meeting.recID,
        error: `VSP meeting ${meeting.recID} has no available dashboard attendees after checking daily_status.`,
      });
      continue;
    }

    try {
      args.p_attendee_ids = availableIds;
      const { data, error } = await client.rpc('sync_external_employee_meeting', args);
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.meeting_id) throw new Error('Meeting sync RPC returned no meeting ID.');
      records.push({
        externalId: meeting.recID,
        meetingId: result.meeting_id,
        action: result.was_created ? 'created' : 'updated',
        attendeeCount: args.p_attendee_ids.length,
      });
    } catch (error) {
      errors.push({
        externalId: typeof meeting?.recID === 'string' ? meeting.recID : null,
        error: error instanceof Error ? error.message : 'Unable to sync meeting.',
      });
    }
  }
  return { records, errors, skippedAttendees };
};
