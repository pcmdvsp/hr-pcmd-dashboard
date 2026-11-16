const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const VIETNAM_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const formatVietnamDate = (date) => {
  const parts = VIETNAM_DATE_FORMATTER.formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export const vietnamDateOnly = (value) => {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : formatVietnamDate(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;

  // VSP timestamps without an explicit offset are already local wall-clock
  // values. Keep their calendar date instead of interpreting them as UTC.
  const localDate = text.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (!localDate) return null;
  const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  if (!hasExplicitOffset) return `${localDate[1]}-${localDate[2]}-${localDate[3]}`;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : formatVietnamDate(parsed);
};

const latestConfirmedSignatureDate = (value, signerFilter = () => true) => {
  if (!isRecord(value)) return null;
  const signers = [value.nguoiKyDon, value.nguoiKys]
    .filter(Array.isArray)
    .flat();
  const dates = signers
    .filter((signer) => isRecord(signer) && signer.daDuyet !== false && signerFilter(signer))
    .map((signer) => vietnamDateOnly(signer.ngayKy))
    .filter(Boolean)
    .sort();
  return dates.at(-1) ?? null;
};

const fallbackApprovalDate = (value) => {
  for (const field of ["ngayKy", "ngayPheDuyet", "ngayChapNhan"]) {
    const date = vietnamDateOnly(value[field]);
    if (date) return date;
  }
  return null;
};

export const annualLeaveApprovalDate = (value) => {
  if (!isRecord(value)) return null;
  return latestConfirmedSignatureDate(value) ?? fallbackApprovalDate(value);
};

export const approvalDateWithSignerFilter = (value, signerFilter) => {
  if (!isRecord(value)) return null;
  return latestConfirmedSignatureDate(value, signerFilter) ?? fallbackApprovalDate(value);
};
