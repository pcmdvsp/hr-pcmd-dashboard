const normalize = (value = "") => value.replace(/\s+/g, " ").trim();

const joinCells = (cells) => normalize(cells.reduce((value, cell, index) => {
  if (!index) return cell.text;
  const previous = cells[index - 1];
  const previousEnd = previous.x + (previous.width || 0);
  const separator = cell.x - previousEnd > 1.5 ? " " : "";
  return `${value}${separator}${cell.text}`;
}, ""));

const toIsoDate = (value) => {
  const match = value?.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
};

const valueAfterLabel = (text, labels, stopLabels) => {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const stopPattern = stopLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${labelPattern})\\s*:?\\s*(.+?)(?=\\s+(?:${stopPattern})\\s*:?|$)`, "i"));
  return normalize(match?.[1] || "") || null;
};

const findDateNear = (text, labels) => {
  for (const label of labels) {
    const index = text.toLocaleLowerCase("vi").indexOf(label.toLocaleLowerCase("vi"));
    if (index >= 0) {
      const candidate = text.slice(index, index + 180).match(/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}/)?.[0];
      if (candidate) return toIsoDate(candidate);
    }
  }
  return null;
};

const parseParticipants = (lines) => {
  const found = new Map();
  lines.forEach((line, index) => {
    const codeMatch = line.match(/(?:^|\s)(\d{5})(?:\s|$)/);
    if (!codeMatch) return;
    const employeeCode = codeMatch[1];
    const around = normalize([lines[index - 1], line, lines[index + 1]].filter(Boolean).join(" "));
    const afterCode = normalize(around.split(employeeCode).slice(1).join(employeeCode));
    const nameMatch = afterCode.match(/([A-ZÀ-ỸĐ][\p{L}Đđ]*(?:\s+[A-ZÀ-ỸĐ][\p{L}Đđ]*){1,6})/u);
    const fallback = normalize(line.replace(/^\s*\d+[.)]?\s*/, "").replace(employeeCode, " "));
    const name = normalize(nameMatch?.[1] || fallback.split(/\s{2,}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}/)[0]);
    if (name && !found.has(employeeCode)) found.set(employeeCode, { employeeCode, name });
  });
  return [...found.values()];
};

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
    .map(([y, row]) => {
      const cells = row.sort((a, b) => a.x - b.x);
      return { y, cells, text: joinCells(cells) };
    })
    .filter((row) => row.text);
};

const compact = (value) => value.toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]/gu, "");

const findRow = (rows, phrase) => rows.findIndex((row, index) => {
  if (compact(row.text).includes(compact(phrase))) return true;
  const next = rows[index + 1];
  return Boolean(
    next &&
    Math.abs(row.y - next.y) <= 2 &&
    compact(`${row.text} ${next.text}`).includes(compact(phrase)),
  );
});

const sectionValue = (rows, label, nextLabel, minimumX = 250) => {
  const start = findRow(rows, label);
  if (start < 0) return null;
  const end = nextLabel ? findRow(rows.slice(start + 1), nextLabel) : -1;
  const stop = end < 0 ? Math.min(rows.length, start + 5) : start + 1 + end;
  return normalize(rows.slice(start, stop).map((row, index) => {
    const colonCell = index === 0
      ? [...row.cells].reverse().find((cell) => cell.text.trim() === ":")
      : null;
    const valueStartX = colonCell ? colonCell.x + (colonCell.width || 0) : minimumX;
    return joinCells(row.cells.filter((cell) => index > 0 || cell.x >= valueStartX));
  }
  ).join(" ")).replace(/^[:\-–]\s*/, "") || null;
};

const parseLayoutFields = (rows) => {
  const departureText = sectionValue(rows, "Thời gian đi", "Thời gian làm việc", 165);
  const returnText = sectionValue(rows, "Thời gian trở về", "Địa điểm công tác", 180);
  const departureDate = toIsoDate(departureText);
  const returnDate = toIsoDate(returnText);
  return {
    content: sectionValue(rows, "Mục đích chuyến đi", "Danh sách CBCNV", 255),
    location: sectionValue(rows, "Địa điểm công tác", "Phương tiện", 260),
    departureDate,
    returnDate,
  };
};

const parseIndividualOrder = (rows) => {
  const recipientIndex = findRow(rows, "Cấp cho");
  const destinationIndex = findRow(rows, "Được cử");
  const durationIndex = findRow(rows, "Thời gian công tác");
  const assignmentIndex = findRow(rows, "Nhiệm vụ được giao");
  if (recipientIndex < 0 || destinationIndex < 0 || durationIndex < 0 || assignmentIndex < 0) return null;

  const recipientRow = rows[recipientIndex];
  const recipientText = joinCells(recipientRow.cells
    .filter((cell) => cell.x >= 185 && cell.x < 355))
    .replace(/^(?:Ông|Bà)\s+/iu, "");
  const employeeCode = recipientRow.cells
    .filter((cell) => cell.x >= 355)
    .map((cell) => cell.text)
    .join("")
    .match(/\d{5}/)?.[0] || null;
  const destination = sectionValue(rows, "Được cử", "Thời gian công tác", 220)
    ?.replace(/^đi\s*đến\s*/iu, "") || null;
  const duration = sectionValue(rows, "Thời gian công tác", "Nhiệm vụ được giao", 265);
  const dates = duration?.match(/(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}).*?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/);
  const content = sectionValue(rows, "Nhiệm vụ được giao", "Được sử dụng phương tiện", 290);

  return {
    documentType: "individual_order",
    content,
    location: destination,
    departureDate: dates ? toIsoDate(dates[1]) : null,
    returnDate: dates ? toIsoDate(dates[2]) : null,
    participants: employeeCode && recipientText
      ? [{ employeeCode, fullName: recipientText, isLeader: false, note: "" }]
      : [],
  };
};

const parseTableParticipants = (rows) => {
  const headerIndex = findRow(rows, "Danh số");
  if (headerIndex < 0) return [];
  const endOffset = rows.slice(headerIndex + 1).findIndex((row) =>
    compact(row.text).includes(compact("Thời gian đi công tác")) &&
    Math.min(...row.cells.map((cell) => cell.x)) < 100,
  );
  const endIndex = endOffset < 0 ? rows.length : headerIndex + 1 + endOffset;
  const tableRows = rows.slice(headerIndex + 1, endIndex > headerIndex ? endIndex : undefined);
  const employees = [];
  tableRows.forEach((row, index) => {
    const codeCell = row.cells.find((cell) => cell.x >= 175 && cell.x < 225 && /^\d{5}$/.test(cell.text.trim()));
    if (!codeCell) return;
    const nextEmployeeOffset = tableRows.slice(index + 1).findIndex((candidate) =>
      candidate.cells.some((cell) => cell.x >= 175 && cell.x < 225 && /^\d{5}$/.test(cell.text.trim())),
    );
    const employeeRows = tableRows.slice(index, nextEmployeeOffset < 0 ? tableRows.length : index + 1 + nextEmployeeOffset);
    const fullName = normalize(employeeRows.flatMap((candidate) =>
      compact(candidate.text).includes("vănbảnnàyđượcxácthực")
        ? []
        : candidate.cells.filter((cell) => cell.x >= 90 && cell.x < codeCell.x).map((cell) => cell.text),
    ).join(" ")).replace(/^\d+[.)]?\s*/, "");
    const isLeader = employeeRows.some((candidate) => candidate.cells.some((cell) => cell.x >= 525 && compact(cell.text).includes("trưởng")));
    const note = employeeRows.some((candidate) => compact(candidate.text).includes("dựphòng"))
      ? "Back-up"
      : "";
    if (fullName) employees.push({ employeeCode: codeCell.text.trim(), fullName, isLeader, note });
  });
  return employees;
};

const parseCoordinateParticipants = (rows) => {
  const found = new Map();
  rows.forEach((row) => {
    const codeCell = row.cells.find((cell) => cell.x >= 175 && cell.x < 250 && /^\d{5}$/.test(cell.text.trim()));
    if (!codeCell) return;
    const fullName = normalize(row.cells
      .filter((cell) => cell.x >= 80 && cell.x < codeCell.x)
      .map((cell) => cell.text)
      .join(" ")
      .replace(/^\s*\d+[.)]?\s*/, ""));
    if (fullName && /\p{L}/u.test(fullName)) {
      found.set(codeCell.text.trim(), {
        employeeCode: codeCell.text.trim(),
        fullName,
        isLeader: row.cells.some((cell) => cell.x > codeCell.x && compact(cell.text).includes("trưởngđoàn")),
        note: compact(row.text).includes("dựphòng") ? "Back-up" : "",
      });
    }
  });
  return [...found.values()];
};

const parseBackupEmployeeCodes = (text) => {
  const codes = new Set();
  const normalizedText = normalize(text);
  const pattern = /dự\s*phòng[\s\S]{0,160}?(?:ds|danh\s*số)\s*:?\s*(\d{5})/giu;
  for (const match of normalizedText.matchAll(pattern)) codes.add(match[1]);

  // Some PDFs split every accented label character into a separate text item.
  // The compact pass keeps the relationship between "Dự phòng" and "DS" intact.
  const compactText = compact(normalizedText);
  const compactPattern = /dựphòng.{0,120}?(?:ds|danhsố)(\d{5})/gu;
  for (const match of compactText.matchAll(compactPattern)) codes.add(match[1]);
  return codes;
};

export async function parseBusinessTripPdf(file) {
  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    const { default: pdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    GlobalWorkerOptions.workerSrc = pdfWorker;
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const pages = [];
  const rows = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageRows = buildRows(content.items);
    pages.push({ pageNumber, text: pageRows.map((row) => row.text).join("\n") });
    rows.push(...pageRows);
  }

  const lines = rows.map((row) => row.text);
  const text = normalize(lines.join(" "));
  if (!text) throw new Error("No readable text layer was found in this PDF.");

  const individualOrder = parseIndividualOrder(rows);
  const documentNumber = individualOrder
    ? null
    : text.match(/(?:^|\s)Số\s*(?:\/\s*№)?\s*:\s*([\w./-]+)/iu)?.[1] || null;
  const layout = individualOrder || parseLayoutFields(rows);
  const content = layout.content || valueAfterLabel(
    text,
    ["Nội dung công tác", "Mục đích công tác", "Nội dung"],
    ["Địa điểm", "Nơi công tác", "Ngày đi", "Thời gian", "Thành phần"],
  );
  const location = layout.location || valueAfterLabel(
    text,
    ["Địa điểm công tác", "Nơi công tác", "Địa điểm"],
    ["Ngày đi", "Ngày về", "Thời gian", "Phương tiện", "Thành phần"],
  );
  const departureDate = layout.departureDate || findDateNear(text, ["Ngày đi", "Thời gian đi", "Từ ngày"]);
  const returnDate = layout.returnDate || findDateNear(text, ["Ngày về", "Thời gian trở về", "Thời gian về", "Đến ngày"]);
  const tableParticipants = individualOrder ? [] : parseTableParticipants(rows);
  const coordinateParticipants = individualOrder ? [] : parseCoordinateParticipants(rows);
  const parsedParticipants = individualOrder?.participants?.length
    ? individualOrder.participants
    : tableParticipants.length
      ? tableParticipants
      : coordinateParticipants.length
        ? coordinateParticipants
        : parseParticipants(lines).map((person) => ({
          ...person,
          fullName: person.name,
          isLeader: false,
          note: "",
          }));
  const backupEmployeeCodes = parseBackupEmployeeCodes(lines.join(" "));
  const participants = parsedParticipants.map((person) => ({
    ...person,
    note: backupEmployeeCodes.has(person.employeeCode) ? "Back-up" : person.note,
  }));

  return {
    fileName: file.name,
    pageCount: pdf.numPages,
    documentType: layout.documentType || "business_trip_proposal",
    documentNumber,
    content,
    location,
    departureDate,
    returnDate,
    startDate: departureDate,
    endDate: returnDate,
    participants,
    backupEmployeeCodes: [...backupEmployeeCodes],
    warnings: [
      !content && "Business trip content was not detected.",
      !location && "Location was not detected.",
      (!departureDate || !returnDate) && "The complete travel date range was not detected.",
      participants.length === 0 && "No participant employee IDs were detected.",
    ].filter(Boolean),
    pages,
  };
}
