const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dateOnly = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;

const finiteNumber = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
};

const plainText = (...values) => {
  for (const value of values) {
    if ((typeof value === "string" || typeof value === "number") && String(value).trim())
      return String(value).trim();
  }
  return null;
};

export const rangesOverlap = (startDate, endDate, fromDate, toDate) =>
  Boolean(startDate && endDate && startDate <= toDate && endDate >= fromDate);

export const searchRangeIsWithinDays = (fromDate, toDate, maximumDays = 366) => {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Number.isFinite(from) && Number.isFinite(to) && to >= from &&
    Math.floor((to - from) / 86_400_000) + 1 <= maximumDays;
};

export const buildLeaveSearchRows = (
  records,
  { leaveType, employeeCode, fromDate, toDate },
) => (records || []).flatMap((record) => {
  if (!isRecord(record) || String(record.danhSo ?? "").trim().toUpperCase() !== employeeCode)
    return [];
  const requestId = record.donNghiPhepBu_id ?? record.donNghiPhep_id ?? null;
  const periods = Array.isArray(record.thongTinPhepCTs) ? record.thongTinPhepCTs : [];
  return periods.flatMap((period, index) => {
    if (!isRecord(period)) return [];
    const startDate = dateOnly(period.tuNgay);
    const endDate = dateOnly(period.denNgay) ?? startDate;
    if (!rangesOverlap(startDate, endDate, fromDate, toDate)) return [];
    const periodId = period.id ?? period.donNghiPhepChiTiet_id ?? index;
    return [{
      id: `${leaveType}:${String(requestId ?? "unknown")}:${String(periodId)}`,
      leaveType,
      requestId,
      employeeCode,
      employeeName: plainText(record.hoTen),
      statusId: record.trangThai_id ?? null,
      statusName: plainText(record.tenTrangThai, record.trangThai) ?? "Approved",
      startDate,
      endDate,
      leaveDays: finiteNumber(period.leaveDays, period.soNgay, period.soNgayNghi),
      hours: finiteNumber(period.compensatoryHours, period.soGio, period.soGioNghi),
      approvalDate: dateOnly(record.ngayKy ?? record.ngayPheDuyet ?? record.ngayChapNhan),
      location: typeof record.noiNghiPhep === "string" ? record.noiNghiPhep.trim() : "",
    }];
  });
});
