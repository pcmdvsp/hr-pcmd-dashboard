export const MODE_OFFSETS = { today: 0, tomorrow: 1, in2days: 2, in3days: 3 };

export const parseSyncModes = (body) => {
  const requested = Array.isArray(body?.modes) ? body.modes : [body?.mode];
  if (!requested.length || requested.some((mode) => typeof mode !== 'string' || !(mode in MODE_OFFSETS))) {
    throw new Error('Body must contain a valid mode or non-empty modes array.');
  }
  return [...new Set(requested)];
};

export const uniqueMeetingsByExternalId = (meetings) => [
  ...new Map(meetings.map((meeting) => [meeting.recID.trim(), meeting])).values(),
];

export const overallSyncStatus = (results) => {
  if (results.every((result) => result.status === 'failed')) return 'failed';
  if (results.some((result) => result.status === 'failed' || result.status === 'partial')) return 'partial';
  if (results.every((result) => result.status === 'no_matches')) return 'no_matches';
  return 'success';
};
