const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Only corporate emails can be compared to eOffice account IDs.
export const corporateAccount = (value, allowBare = false) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^([^\s@]+)@vietsov\.com\.vn$/);
  if (match) return match[1];
  return allowBare && /^[^\s@]+$/.test(normalized) ? normalized : null;
};

// Accept a single sample meeting, an array, or common JSON response wrappers.
// Never search permissions/resources/createdBy for participant identity.
export const extractMeetings = (payload) => {
  if (Array.isArray(payload)) return payload.flatMap(extractMeetings);
  if (isObject(payload)) {
    if (payload.haveBusinessError === true || payload.haveServerError === true) {
      throw new Error('VSP eOffice reported a business or server error.');
    }
    if (Object.hasOwn(payload, 'msgBodyData')) {
      // Observed eOffice envelope: { msgBodyData: [[meetings, 0, {}]], ... }.
      // The remaining tuple entries are metadata, not meeting records.
      const batches = payload.msgBodyData;
      const tuple = Array.isArray(batches) && batches.length === 1 ? batches[0] : null;
      if (!Array.isArray(tuple) || tuple.length !== 3 || !Array.isArray(tuple[0]) ||
          typeof tuple[1] !== 'number' || !isObject(tuple[2])) {
        throw new Error('Unsupported VSP msgBodyData envelope. Expected [[meetings, number, object]].');
      }
      return extractMeetings(tuple[0]);
    }
    if (typeof payload.recID === 'string' && typeof payload.startDate === 'string' &&
        typeof payload.endDate === 'string') {
      if (!Array.isArray(payload.listAttendees)) {
        throw new Error('A VSP meeting is missing a valid listAttendees array.');
      }
      return [payload];
    }
    const keys = ['data', 'items', 'result'];
    const present = keys.filter((key) => Object.hasOwn(payload, key));
    if (present.length === 1) return extractMeetings(payload[present[0]]);
  }
  throw new Error('Unsupported VSP meeting response structure. Please check the response envelope.');
};

export const filterMeetings = (meetings, profiles) => {
  const accounts = new Map();
  for (const profile of profiles) {
    const account = corporateAccount(profile.email);
    if (!account) continue;
    if (accounts.has(account)) throw new Error('Multiple profiles use the same eOffice account.');
    accounts.set(account, profile);
  }
  if (!accounts.size) throw new Error('No dashboard profiles have a valid @vietsov.com.vn email.');

  return meetings.flatMap((meeting) => {
    const attendeesByAccount = new Map();
    for (const attendee of meeting.listAttendees) {
      const account = corporateAccount(attendee?.id, true);
      const profile = accounts.get(account);
      if (!profile) continue;
      const department = Array.isArray(profile.department) ? profile.department[0] : profile.department;
      const existing = attendeesByAccount.get(account);
      const roleType = attendee?.roleType == null ? existing?.roleType ?? null : String(attendee.roleType);
      attendeesByAccount.set(account, {
        id: account,
        employeeId: profile.id,
        name: profile.full_name,
        email: profile.email,
        employeeCode: profile.employee_code,
        departmentId: profile.department_id ?? null,
        departmentName: department?.name ?? null,
        roleType: roleType === '2' || existing?.roleType === '2' ? '2' : roleType,
      });
    }
    const attendees = [...attendeesByAccount.values()];
    if (!attendees.length) return [];
    return [{
      recID: meeting.recID,
      resourceName: meeting.resourceName,
      title: meeting.title,
      startDate: meeting.startDate,
      endDate: meeting.endDate,
      // This list contains only matched dashboard staff, not all external guests.
      listAttendees: attendees,
    }];
  });
};
