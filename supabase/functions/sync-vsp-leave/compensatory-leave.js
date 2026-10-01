export const APPROVED_COMPENSATORY_STATUS_ID = 187;
export const COMPENSATORY_FINAL_APPROVER_STATUS_ID = 186;

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dateOnly = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;

export const compensatoryApprovalDate = (value) => {
  if (!isRecord(value)) return null;
  for (const field of ["ngayKy", "ngayPheDuyet", "ngayChapNhan"]) {
    const date = dateOnly(value[field]);
    if (date) return date;
  }
  if (!Array.isArray(value.nguoiKys)) return null;
  const finalApprovals = value.nguoiKys
    .filter((signer) => isRecord(signer) &&
      Number(signer.trangThai_id) === COMPENSATORY_FINAL_APPROVER_STATUS_ID &&
      signer.daDuyet !== false)
    .map((signer) => dateOnly(signer.ngayKy))
    .filter(Boolean)
    .sort();
  return finalApprovals.at(-1) ?? null;
};

export const normalizeCompensatoryRecord = (value) => {
  if (!isRecord(value) || Number(value.trangThai_id) !== APPROVED_COMPENSATORY_STATUS_ID)
    return null;
  const details = Array.isArray(value.donNghiBuCTs) ? value.donNghiBuCTs : [];
  const periods = details.flatMap((detail) => {
    if (!isRecord(detail)) return [];
    const startDate = dateOnly(detail.tuNgay);
    const endDate = dateOnly(detail.denNgay) ?? startDate;
    const leaveDays = Number(detail.soNgay);
    const hoursPerDay = Number(detail.soGioNghiTrongNgay);
    if (!startDate || !endDate || endDate < startDate || !Number.isFinite(leaveDays) || leaveDays <= 0)
      return [];
    return [{
      id: detail.donNghiPhepBuChiTiet_id ?? detail.DonNghiPhepBuChiTiet_id ?? null,
      tuNgay: startDate,
      denNgay: endDate,
      leaveDays,
      compensatoryHours: Number.isFinite(hoursPerDay) && hoursPerDay > 0
        ? hoursPerDay * leaveDays
        : null,
    }];
  });
  return {
    donNghiPhep_id: `compensatory-${String(value.donNghiPhepBu_id ?? "unknown")}`,
    donNghiPhepBu_id: value.donNghiPhepBu_id ?? null,
    danhSo: value.danhSo ?? "",
    hoTen: value.hoTen ?? null,
    noiNghiPhep: value.noiNghiBu ?? value.noiNghiPhep ?? "",
    thongTinPhepCTs: periods,
    compensatoryHours: periods.reduce((sum, period) => sum + Number(period.compensatoryHours ?? 0), 0),
    leaveDayCount: periods.reduce((sum, period) => sum + period.leaveDays, 0),
  };
};
