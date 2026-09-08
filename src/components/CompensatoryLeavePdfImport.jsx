import { useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { parseCompensatoryLeavePdf } from "../utils/compensatoryLeavePdf";
import "./BusinessTripPdfImport.css";

const formatDate = (value) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1].slice(-2)}` : "Not detected";
};

export default function CompensatoryLeavePdfImport({ employee, onSaved }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const close = () => {
    setOpen(false); setFile(null); setPreview(null); setSyncResult(null); setError("");
  };

  const scan = async () => {
    if (!file) return setError("Please select an approved compensatory leave PDF first.");
    setScanning(true); setError(""); setPreview(null); setSyncResult(null);
    try {
      const parsed = await parseCompensatoryLeavePdf(file);
      const matchesCurrentUser = parsed.employeeCode === String(employee.employee_code || "").trim();
      setPreview({ ...parsed, matchesCurrentUser });
      if (!matchesCurrentUser) setError(`This PDF belongs to employee ${parsed.employeeCode || "unknown"}. You can import only your own approved compensatory leave.`);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unable to read this PDF.");
    } finally { setScanning(false); }
  };

  const confirmImport = async () => {
    if (!preview?.matchesCurrentUser || !preview.ranges.length || !preview.location) return;
    setSyncing(true); setError(""); setSyncResult(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const fileHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      const { data, error: importError } = await supabase.rpc("import_own_compensatory_leave_pdf", {
        p_employee_code: preview.employeeCode,
        p_start_dates: preview.ranges.map((range) => range.startDate),
        p_end_dates: preview.ranges.map((range) => range.endDate),
        p_location: preview.location,
        p_file_name: file.name,
        p_file_hash: fileHash,
      });
      if (importError) throw importError;
      setSyncResult(data); onSaved?.();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import compensatory leave.");
    } finally { setSyncing(false); }
  };

  return <>
    <div className="business-trip-import-card">
      <FileText size={22} aria-hidden="true" />
      <div><strong>Import your approved compensatory leave PDF</strong><p className="subtle">The employee ID in the PDF must match your signed-in profile.</p></div>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>Select PDF</button>
    </div>
    {open && <div className="modal-backdrop business-trip-pdf-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal business-trip-pdf-modal" role="dialog" aria-modal="true" aria-labelledby="compensatory-leave-pdf-title">
        <div className="form-title"><div><p className="eyebrow">APPROVED VSP DOCUMENT</p><h2 id="compensatory-leave-pdf-title">Preview compensatory leave PDF</h2></div><button type="button" className="close" onClick={close} aria-label="Close">×</button></div>
        <button type="button" className="business-trip-file-picker" onClick={() => inputRef.current?.click()}><Upload size={24} aria-hidden="true"/><span><strong>{file?.name || "Choose a PDF file"}</strong><small>{file ? `${(file.size / 1024).toFixed(1)} KB` : "PDF with a readable text layer"}</small></span></button>
        <input ref={inputRef} className="business-trip-file-input" type="file" accept="application/pdf,.pdf" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setSyncResult(null); setError(""); }}/>
        <div className="business-trip-pdf-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="primary-button" disabled={!file || scanning} onClick={scan}>{scanning ? "Reading PDF..." : "Read and preview"}</button></div>
        {error && <p className="form-error">{error}</p>}
        {preview && <div className="business-trip-preview">
          <div className="business-trip-preview-heading"><div><p className="eyebrow">SCAN RESULT</p><h3>{preview.fileName}</h3></div><span>{preview.pageCount} page{preview.pageCount === 1 ? "" : "s"}</span></div>
          {preview.warnings.length > 0 && <div className="business-trip-warnings"><strong>Please verify:</strong><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          <dl className="business-trip-summary"><div><dt>Employee</dt><dd>{preview.employeeName || "Not detected"}</dd></div><div><dt>Employee ID</dt><dd>{preview.employeeCode || "Not detected"}</dd></div><div><dt>Location</dt><dd>{preview.location || "Not detected"}</dd></div><div><dt>Total hours</dt><dd>{preview.totalHours ?? "Not detected"}</dd></div></dl>
          <div className="business-trip-participant-heading"><h4>Compensatory leave periods ({preview.ranges.length})</h4></div>
          <div className="business-trip-preview-table-wrap"><table className="business-trip-preview-table"><thead><tr><th>From date</th><th>To date</th></tr></thead><tbody>{preview.ranges.map((range) => <tr key={`${range.startDate}-${range.endDate}`}><td>{formatDate(range.startDate)}</td><td>{formatDate(range.endDate)}</td></tr>)}{preview.ranges.length === 0 && <tr><td colSpan="2" className="empty">No date range detected</td></tr>}</tbody></table></div>
          {syncResult && <div className={`business-trip-import-success ${syncResult.alreadyImported ? "is-duplicate" : ""}`}><strong>{syncResult.alreadyImported ? "This PDF was already imported." : "Compensatory leave imported successfully."}</strong><span>{syncResult.statusRowCount || 0} daily status row{syncResult.statusRowCount === 1 ? "" : "s"}.</span></div>}
          <div className="business-trip-confirm-actions"><button type="button" className="primary-button" disabled={syncing || Boolean(syncResult) || !preview.matchesCurrentUser || preview.warnings.length > 0} onClick={confirmImport}>{syncing ? "Importing..." : syncResult ? "Imported" : "Confirm and import"}</button></div>
        </div>}
      </section>
    </div>}
  </>;
}
