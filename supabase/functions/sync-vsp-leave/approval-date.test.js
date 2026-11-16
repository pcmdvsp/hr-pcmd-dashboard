import assert from "node:assert/strict";
import test from "node:test";
import { annualLeaveApprovalDate, vietnamDateOnly } from "./approval-date.js";

test("uses the last confirmed signature instead of the top-level signing date", () => {
  assert.equal(annualLeaveApprovalDate({
    ngayKy: "2026-11-07T08:00:00",
    nguoiKyDon: [
      { ngayKy: "2026-11-08T10:00:00", daDuyet: true },
      { ngayKy: "2026-11-09T15:16:00", daDuyet: true },
      { ngayKy: "2026-11-10T09:00:00", daDuyet: false },
    ],
  }), "2026-11-09");
});

test("converts explicitly zoned timestamps to the Vietnam calendar date", () => {
  assert.equal(vietnamDateOnly("2026-11-08T18:16:00Z"), "2026-11-09");
  assert.equal(vietnamDateOnly("2026-11-09T15:16:00+07:00"), "2026-11-09");
});

test("treats unzoned VSP timestamps as Vietnam wall-clock values", () => {
  assert.equal(vietnamDateOnly("2026-11-09T15:16:00"), "2026-11-09");
});

test("falls back to the top-level date when no confirmed signature exists", () => {
  assert.equal(annualLeaveApprovalDate({
    ngayKy: "2026-11-09T08:00:00",
    nguoiKyDon: [{ ngayKy: "2026-11-10T09:00:00", daDuyet: false }],
  }), "2026-11-09");
});
