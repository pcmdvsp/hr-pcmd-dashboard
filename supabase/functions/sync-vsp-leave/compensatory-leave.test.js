import assert from "node:assert/strict";
import test from "node:test";
import {
  compensatoryApprovalDate,
  normalizeCompensatoryRecord,
} from "./compensatory-leave.js";

test("uses the final approval signature date for compensatory leave", () => {
  assert.equal(compensatoryApprovalDate({
    trangThai_id: 187,
    nguoiKys: [
      { trangThai_id: 185, ngayKy: "2026-09-14T08:00:00", daDuyet: true },
      { trangThai_id: 186, ngayKy: "2026-09-15T09:30:00", daDuyet: true },
    ],
  }), "2026-09-15");
});

test("uses VSP soNgay and the supplied date range without deriving days from hours", () => {
  const normalized = normalizeCompensatoryRecord({
    donNghiPhepBu_id: 42,
    trangThai_id: 187,
    danhSo: "18351",
    noiNghiBu: "Vung Tau",
    donNghiBuCTs: [{
      tuNgay: "2026-09-21T00:00:00",
      denNgay: "2026-09-22T00:00:00",
      soGioNghiTrongNgay: 7.5,
      soNgay: 2,
    }],
  });
  assert.equal(normalized.compensatoryHours, 15);
  assert.equal(normalized.leaveDayCount, 2);
  assert.deepEqual(normalized.thongTinPhepCTs.map(({ tuNgay, denNgay }) => ({ tuNgay, denNgay })), [
    { tuNgay: "2026-09-21", denNgay: "2026-09-22" },
  ]);
});

test("does not turn a one-day VSP period into extra days when its hours exceed eight", () => {
  const normalized = normalizeCompensatoryRecord({
    donNghiPhepBu_id: 43,
    trangThai_id: 187,
    danhSo: "18351",
    donNghiBuCTs: [{
      tuNgay: "2026-09-23T00:00:00",
      denNgay: "2026-09-23T00:00:00",
      soGioNghiTrongNgay: 15,
      soNgay: 1,
    }],
  });
  assert.equal(normalized.leaveDayCount, 1);
  assert.deepEqual(normalized.thongTinPhepCTs.map(({ tuNgay, denNgay }) => ({ tuNgay, denNgay })), [
    { tuNgay: "2026-09-23", denNgay: "2026-09-23" },
  ]);
});

test("ignores compensatory leave that is not in approved status 187", () => {
  assert.equal(normalizeCompensatoryRecord({ trangThai_id: 186 }), null);
});
