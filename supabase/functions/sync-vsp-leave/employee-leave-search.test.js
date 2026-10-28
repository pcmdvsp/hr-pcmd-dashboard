import test from "node:test";
import assert from "node:assert/strict";
import { buildLeaveSearchRows, rangesOverlap, searchRangeIsWithinDays } from "./employee-leave-search.js";

test("matches leave periods that overlap either edge of the requested range", () => {
  assert.equal(rangesOverlap("2026-10-01", "2026-10-05", "2026-10-05", "2026-10-10"), true);
  assert.equal(rangesOverlap("2026-10-10", "2026-10-12", "2026-10-05", "2026-10-10"), true);
  assert.equal(rangesOverlap("2026-10-01", "2026-10-04", "2026-10-05", "2026-10-10"), false);
});

test("returns only exact employee matches and overlapping periods", () => {
  const rows = buildLeaveSearchRows([
    {
      donNghiPhep_id: 10,
      danhSo: "07hddk",
      hoTen: "Employee A",
      trangThai_id: 142,
      ngayKy: "2026-10-02T08:00:00",
      noiNghiPhep: "Vung Tau",
      thongTinPhepCTs: [
        { id: 1, tuNgay: "2026-10-03T00:00:00", denNgay: "2026-10-07T00:00:00", soNgay: 5 },
        { id: 2, tuNgay: "2026-11-01T00:00:00", denNgay: "2026-11-02T00:00:00", soNgay: 2 },
      ],
    },
    { donNghiPhep_id: 11, danhSo: "07HDDK2", thongTinPhepCTs: [{ tuNgay: "2026-10-05", denNgay: "2026-10-05" }] },
  ], { leaveType: "annual_leave", employeeCode: "07HDDK", fromDate: "2026-10-05", toDate: "2026-10-20" });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestId, 10);
  assert.equal(rows[0].startDate, "2026-10-03");
  assert.equal(rows[0].leaveDays, 5);
});

test("finds a leave period that starts on the search end date and continues later", () => {
  const rows = buildLeaveSearchRows([{
    donNghiPhep_id: 21207,
    danhSo: "21207",
    hoTen: "Ngô Quang Hùng",
    trangThai_id: 142,
    thongTinPhepCTs: [{
      id: 1,
      tuNgay: "2026-10-26T00:00:00",
      denNgay: "2026-10-30T00:00:00",
      soNgay: 5,
    }],
  }], {
    leaveType: "annual_leave",
    employeeCode: "21207",
    fromDate: "2026-10-23",
    toDate: "2026-10-26",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].startDate, "2026-10-26");
  assert.equal(rows[0].endDate, "2026-10-30");
});

test("limits searches to at most 366 inclusive days", () => {
  assert.equal(searchRangeIsWithinDays("2026-01-01", "2027-01-01"), true);
  assert.equal(searchRangeIsWithinDays("2026-01-01", "2027-01-02"), false);
  assert.equal(searchRangeIsWithinDays("2026-02-01", "2026-01-01"), false);
});
