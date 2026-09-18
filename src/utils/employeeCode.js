const EMPLOYEE_CODE_PATTERN = /^(?:\d{5}|(?=[A-Z0-9]{5,10}$)(?=.*[A-Z])(?=.*\d)[A-Z0-9]+)$/;

export const normalizeEmployeeCode = (value = "") =>
  String(value).replace(/\s+/g, "").trim().toUpperCase();

export const isEmployeeCode = (value) =>
  EMPLOYEE_CODE_PATTERN.test(normalizeEmployeeCode(value));

export const findEmployeeCode = (value = "") => {
  const candidates = String(value).match(/[A-Z0-9]+/gi) || [];
  const candidate = candidates.find(isEmployeeCode);
  return candidate ? normalizeEmployeeCode(candidate) : null;
};

export const findEmployeeCodeCell = (cells, minimumX, maximumX) => {
  const candidates = cells.filter((cell) => cell.x >= minimumX && cell.x < maximumX);
  for (const cell of candidates) {
    const employeeCode = findEmployeeCode(cell.text);
    if (employeeCode) return { ...cell, employeeCode };
  }

  const combined = normalizeEmployeeCode(candidates.map((cell) => cell.text).join(""));
  return isEmployeeCode(combined) && candidates.length
    ? { ...candidates[0], text: combined, employeeCode: combined }
    : null;
};
