import test from "node:test";
import assert from "node:assert/strict";
import {
  findEmployeeCode,
  findEmployeeCodeCell,
  isEmployeeCode,
  normalizeEmployeeCode,
} from "./employeeCode.js";

test("accepts numeric and mixed employee codes", () => {
  assert.equal(isEmployeeCode("18351"), true);
  assert.equal(isEmployeeCode("07HDDK"), true);
  assert.equal(isEmployeeCode("07hddk"), true);
  assert.equal(isEmployeeCode("HDDKK"), false);
  assert.equal(isEmployeeCode("2026"), false);
  assert.equal(findEmployeeCode("ABC07HDDKXYZ"), null);
});

test("normalizes employee codes before matching", () => {
  assert.equal(normalizeEmployeeCode(" 07 hddk "), "07HDDK");
  assert.equal(findEmployeeCode("2. Nguyễn Văn A 07hddk Trưởng đoàn"), "07HDDK");
});

test("reads an employee code split into PDF text cells", () => {
  const cell = findEmployeeCodeCell([
    { x: 180, text: "07" },
    { x: 194, text: "HDDK" },
  ], 175, 225);
  assert.equal(cell.employeeCode, "07HDDK");
});
