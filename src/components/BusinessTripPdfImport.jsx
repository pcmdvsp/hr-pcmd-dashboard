import { useEffect, useRef, useState } from "react";
import { Check, FileText, Pencil, Upload, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { parseBusinessTripPdf } from "../utils/businessTripPdf";
import { normalizeEmployeeCode } from "../utils/employeeCode";
import "./BusinessTripPdfImport.css";

const formatPreviewDate = (value) => {
  if (!value) return "Not detected";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1].slice(-2)}` : value;
};

const detectedFieldWarnings = new Set([
  "Business trip content was not detected.",
  "Location was not detected.",
  "The complete travel date range was not detected.",
]);

const refreshDetectedFieldWarnings = (preview) => ({
  ...preview,
  warnings: [
    ...(preview.warnings || []).filter((warning) => !detectedFieldWarnings.has(warning)),
    !preview.content && "Business trip content was not detected.",
    !preview.location && "Location was not detected.",
    (!preview.departureDate || !preview.returnDate) && "The complete travel date range was not detected.",
  ].filter(Boolean),
});

function EditablePreviewField({ label, value, type = "text", multiline = false, displayValue, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const missing = !value;

  useEffect(() => setDraft(value || ""), [value]);

  const cancel = () => {
    setDraft(value || "");
    setEditing(false);
  };
  const save = () => {
    const nextValue = draft.trim();
    if (!nextValue) return;
    onSave(nextValue);
    setEditing(false);
  };

  return <div className={`business-trip-summary-field ${missing ? "is-missing" : ""} ${editing ? "is-editing" : ""}`}>
    <dt>{label}</dt>
    {!editing ? <dd>{displayValue ?? value ?? "Not detected"}</dd> : <div className="business-trip-manual-editor">
      {multiline
        ? <textarea rows="3" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") cancel(); if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save(); }} />
        : <input type={type} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") cancel(); if (event.key === "Enter") save(); }} />}
      <div className="business-trip-manual-actions">
        <button type="button" onClick={cancel} aria-label={`Cancel manual ${label.toLowerCase()}`} title="Cancel"><X size={15} aria-hidden="true" /></button>
        <button type="button" className="is-save" disabled={!draft.trim()} onClick={save} aria-label={`Save manual ${label.toLowerCase()}`} title="Save"><Check size={15} aria-hidden="true" /></button>
      </div>
    </div>}
    {!editing && <button type="button" className="business-trip-manual-edit-button" onClick={() => setEditing(true)} aria-label={`${missing ? "Enter" : "Edit"} ${label.toLowerCase()} manually`} title={missing ? "Enter manually" : "Edit manually"}><Pencil size={15} aria-hidden="true" /></button>}
  </div>;
}

export default function BusinessTripPdfImport({ onSaved }) {
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

  const scan = async () => {
    if (!file) return setError("Please select an approved VSP PDF first.");
    setScanning(true);
    setError("");
    setPreview(null);
    setSyncResult(null);
    try {
      const parsed = await parseBusinessTripPdf(file);
      const employeeCodes = [...new Set(parsed.participants.map((person) => normalizeEmployeeCode(person.employeeCode)))];
      const { data: profiles, error: profileError } = employeeCodes.length
        ? await supabase
            .from("profiles")
            .select("id,employee_code,full_name,department_id,departments(name)")
            .eq("active", true)
            .limit(5000)
        : { data: [], error: null };
      if (profileError) throw new Error(`Unable to verify PCMD employees: ${profileError.message}`);

      const profileByCode = new Map((profiles || []).map((profile) => [normalizeEmployeeCode(profile.employee_code), profile]));
      const participants = parsed.participants
        .filter((person) => profileByCode.has(normalizeEmployeeCode(person.employeeCode)))
        .map((person) => {
          const employeeCode = normalizeEmployeeCode(person.employeeCode);
          const profile = profileByCode.get(employeeCode);
          const department = Array.isArray(profile.departments) ? profile.departments[0] : profile.departments;
          return {
            ...person,
            employeeCode,
            profileId: profile.id,
            fullName: profile.full_name || person.fullName,
            departmentName: department?.name || "Management Board",
          };
        });
      const excludedParticipants = parsed.participants.filter((person) => !profileByCode.has(normalizeEmployeeCode(person.employeeCode)));
      setPreview({ ...parsed, participants, excludedParticipants, scannedParticipantCount: parsed.participants.length });
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unable to read this PDF.");
    } finally {
      setScanning(false);
    }
  };

  const updatePreviewField = (field, value) => {
    setPreview((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if (field === "departureDate") next.startDate = value;
      if (field === "returnDate") next.endDate = value;
      return refreshDetectedFieldWarnings(next);
    });
    setError("");
  };

  const confirmImport = async () => {
    if (!preview) return;
    const travelers = preview.participants.filter((person) => person.note !== "Back-up");
    if (!preview.departureDate || !preview.returnDate || !preview.content || !preview.location) {
      return setError("Departure date, return date, content and location are required before importing.");
    }
    if (preview.returnDate < preview.departureDate) {
      return setError("Return date must be on or after departure date.");
    }
    if (!travelers.length) return setError("No eligible PCMD travelers were found in this PDF.");

    setSyncing(true);
    setError("");
    setSyncResult(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const fileHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      const { data, error: syncError } = await supabase.rpc("import_business_trip_pdf", {
        p_employee_codes: travelers.map((person) => person.employeeCode),
        p_start_date: preview.departureDate,
        p_end_date: preview.returnDate,
        p_content: preview.content,
        p_location: preview.location,
        p_file_name: file.name,
        p_file_hash: fileHash,
      });
      if (syncError) throw syncError;
      setSyncResult(data);
      onSaved?.();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to import this business trip.");
    } finally {
      setSyncing(false);
    }
  };

  const close = () => {
    setOpen(false);
    setFile(null);
    setPreview(null);
    setSyncResult(null);
    setError("");
  };

  return <>
    <div className="business-trip-import-card">
      <FileText size={22} aria-hidden="true" />
      <div><strong>Import an approved business trip PDF</strong><p className="subtle">Read the PDF and review the detected trip. Nothing will be saved yet.</p></div>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>Select PDF</button>
    </div>
    {open && <div className="modal-backdrop business-trip-pdf-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal business-trip-pdf-modal" role="dialog" aria-modal="true" aria-labelledby="business-trip-pdf-title">
        <div className="form-title"><div><p className="eyebrow">APPROVED VSP DOCUMENT</p><h2 id="business-trip-pdf-title">Preview business trip PDF</h2></div><button type="button" className="close" onClick={close} aria-label="Close">×</button></div>
        <button type="button" className="business-trip-file-picker" onClick={() => inputRef.current?.click()}>
          <Upload size={24} aria-hidden="true" />
          <span><strong>{file?.name || "Choose a PDF file"}</strong><small>{file ? `${(file.size / 1024).toFixed(1)} KB` : "PDF with a readable text layer"}</small></span>
        </button>
        <input ref={inputRef} className="business-trip-file-input" type="file" accept="application/pdf,.pdf" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); setPreview(null); setSyncResult(null); setError(""); }} />
        <div className="business-trip-pdf-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="button" className="primary-button" disabled={!file || scanning} onClick={scan}>{scanning ? "Reading PDF..." : "Read and preview"}</button></div>
        {error && <p className="form-error">{error}</p>}
        {preview && <div className="business-trip-preview">
          <div className="business-trip-preview-heading"><div><p className="eyebrow">SCAN RESULT</p><h3>{preview.documentNumber ? `Document ${preview.documentNumber}` : preview.fileName}</h3></div><span>{preview.pageCount} page{preview.pageCount === 1 ? "" : "s"}</span></div>
          {preview.warnings.length > 0 && <div className="business-trip-warnings"><strong>Please verify:</strong><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          <dl className="business-trip-summary">
            <EditablePreviewField label="Departure date" type="date" value={preview.departureDate} displayValue={formatPreviewDate(preview.departureDate)} onSave={(value) => updatePreviewField("departureDate", value)} />
            <EditablePreviewField label="Return date" type="date" value={preview.returnDate} displayValue={formatPreviewDate(preview.returnDate)} onSave={(value) => updatePreviewField("returnDate", value)} />
            <EditablePreviewField label="Location" value={preview.location} onSave={(value) => updatePreviewField("location", value)} />
            <EditablePreviewField label="Content" value={preview.content} multiline onSave={(value) => updatePreviewField("content", value)} />
          </dl>
          <div className="business-trip-participant-heading"><h4>PCMD participants ({preview.participants.length})</h4>{preview.excludedParticipants.length > 0 && <span>{preview.excludedParticipants.length} outside PCMD excluded</span>}</div>
          <div className="business-trip-preview-table-wrap"><table className="business-trip-preview-table"><thead><tr><th>Employee ID</th><th>Full name</th><th>Department</th><th>Role</th><th>Note</th></tr></thead><tbody>{preview.participants.map((person) => <tr key={person.employeeCode}><td>{person.employeeCode}</td><td>{person.fullName}</td><td>{person.departmentName}</td><td>{person.isLeader ? "Trip leader" : "Member"}</td><td>{person.note || ""}</td></tr>)}{preview.participants.length === 0 && <tr><td colSpan="5" className="empty">No active PCMD profiles matched the PDF</td></tr>}</tbody></table></div>
          <p className="business-trip-preview-note">Employees marked Back-up remain in the preview but are not imported as Business trip.</p>
          {syncResult && <div className={`business-trip-import-success ${syncResult.alreadyImported ? "is-duplicate" : ""}`}><strong>{syncResult.alreadyImported ? "This PDF was already imported." : "Business trip imported successfully."}</strong><span>{syncResult.employeeCount || 0} employee{syncResult.employeeCount === 1 ? "" : "s"}, {syncResult.statusRowCount || 0} daily status row{syncResult.statusRowCount === 1 ? "" : "s"}.</span></div>}
          <div className="business-trip-confirm-actions"><button type="button" className="primary-button" disabled={syncing || Boolean(syncResult)} onClick={confirmImport}>{syncing ? "Importing..." : syncResult ? "Imported" : "Confirm and import"}</button></div>
        </div>}
      </section>
    </div>}
  </>;
}
