// Date-only input is interpreted as a Vietnam calendar day, never server time.
export const vietnamDateUtcRange = (input, now = new Date()) => {
  if (input != null && typeof input !== 'string') {
    throw new Error('date must be a valid date in YYYY-MM-DD format.');
  }
  let date = input?.trim() ?? '';
  if (!date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = (type) => parts.find((part) => part.type === type)?.value;
    date = `${value('year')}-${value('month')}-${value('day')}`;
  }
  const midnight = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(midnight.getTime()) ||
      midnight.toISOString().slice(0, 10) !== date) {
    throw new Error('date must be a valid date in YYYY-MM-DD format.');
  }
  const startMs = midnight.getTime() - 7 * 60 * 60 * 1000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 24 * 60 * 60 * 1000 - 1).toISOString(),
  };
};
