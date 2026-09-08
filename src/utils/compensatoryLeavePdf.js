const normalize = (value = "") => value.replace(/\s+/g, " ").trim();

const fold = (value = "") => normalize(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/gi, "d")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

const joinCells = (cells) => normalize(cells.reduce((value, cell, index) => {
  if (!index) return cell.text;
  const previous = cells[index - 1];
  const previousEnd = previous.x + (previous.width || 0);
  return `${value}${cell.x - previousEnd > 1.5 ? " " : ""}${cell.text}`;
}, ""));

const buildRows = (items) => {
  const rows = new Map();
  items.forEach((item) => {
    const y = Math.round(item.transform?.[5] || 0);
    const row = rows.get(y) || [];
    row.push({ x: item.transform?.[4] || 0, width: item.width || 0, text: item.str });
    rows.set(y, row);
  });
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => joinCells(row.sort((a, b) => a.x - b.x)))
    .filter(Boolean);
};

const compactDigits = (value) => value.replace(/(?<=\d)\s+(?=\d)/g, "");
const toIsoDate = (day, month, year) => `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
const afterColon = (value) => normalize(value.includes(":") ? value.slice(value.indexOf(":") + 1) : "");

export async function parseCompensatoryLeavePdf(file) {
  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    const { default: pdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    GlobalWorkerOptions.workerSrc = pdfWorker;
  }
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    lines.push(...buildRows(content.items));
  }
  if (!lines.length) throw new Error("No readable text layer was found in this PDF.");

  const leaveFormDetected = lines.some((line) => fold(line).includes("donnghibu"));
  if (!leaveFormDetected) throw new Error("This PDF does not appear to be a compensatory leave form.");

  const nameLine = lines.find((line) => fold(line).includes("toitenla"));
  const codeLine = lines.find((line) => fold(line).includes("danhso"));
  const locationLine = lines.find((line) => fold(line).includes("noinghibu"));
  const hoursLine = lines.find((line) => fold(line).includes("tongsogionghibu"));
  const employeeName = afterColon(nameLine || "").replace(/^(?:ông|bà)\s+/iu, "") || null;
  const employeeCode = compactDigits(afterColon(codeLine || "")).match(/\d{5}/)?.[0] || null;
  const location = afterColon(locationLine || "") || null;
  const totalHours = fold(compactDigits(hoursLine || "")).match(/(\d+(?:[.,]\d+)?)gio/i)?.[1]?.replace(",", ".") || null;

  const ranges = [];
  const seenRanges = new Set();
  const rangePattern = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})[\s\S]{0,80}?(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/;
  lines.filter((line) => fold(line).includes("tungay") && fold(line).includes("den"))
    .forEach((line) => {
      const match = compactDigits(line).match(rangePattern);
      if (!match) return;
      const startDate = toIsoDate(match[1], match[2], match[3]);
      const endDate = toIsoDate(match[4], match[5], match[6]);
      const key = `${startDate}:${endDate}`;
      if (!seenRanges.has(key)) { seenRanges.add(key); ranges.push({ startDate, endDate }); }
    });

  return {
    fileName: file.name,
    pageCount: pdf.numPages,
    employeeName,
    employeeCode,
    ranges,
    location,
    totalHours: totalHours ? Number(totalHours) : null,
    warnings: [
      !employeeName && "Employee name was not detected.",
      !employeeCode && "Employee ID was not detected.",
      ranges.length === 0 && "No compensatory leave date range was detected.",
      !location && "Leave location was not detected.",
    ].filter(Boolean),
  };
}
