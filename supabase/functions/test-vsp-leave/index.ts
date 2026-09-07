import { createClient } from "npm:@supabase/supabase-js@2";

const EMPLOYEE_ID = 8406;
const EMPLOYEE_NUMBER = "18351";
const APPROVED_STATUS = "Đơn nghỉ phép đã được cấp phép";
const TEST_FROM_DATE = "2026-07-01";
const TEST_TO_DATE = "2026-08-31";
const VSP_API_URL = `https://phep.vietsov.com.vn/api/Phep/DanhSachGNP/${EMPLOYEE_ID}`;
const REQUEST_TIMEOUT_MS = 10_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const env = (name: string) => Deno.env.get(name) ?? "";

const defaultKey = (modernName: string, legacyName: string) => {
  const modernValue = env(modernName);
  if (modernValue) {
    try {
      return JSON.parse(modernValue).default as string;
    } catch {
      /* Fall back to the legacy secret below. */
    }
  }
  return env(legacyName);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asStringOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;
const asNumberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const timestamp = (record: Record<string, unknown>) => {
  for (const value of [record.ngayTao, record.ngayKy]) {
    if (typeof value !== "string") continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NEGATIVE_INFINITY;
};

const isTargetRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isObject(value)) return false;
  const employeeId =
    typeof value.nhanVien_id === "number"
      ? value.nhanVien_id
      : Number(value.nhanVien_id);
  return (
    employeeId === EMPLOYEE_ID && String(value.danhSo ?? "") === EMPLOYEE_NUMBER
  );
};

const datePart = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;

const isDayInTestRange = (value: unknown): value is Record<string, unknown> => {
  if (!isObject(value)) return false;
  const from = datePart(value.tuNgay);
  const to = datePart(value.denNgay);
  return Boolean(from && to && from <= TEST_TO_DATE && to >= TEST_FROM_DATE);
};

const limitRecordToTestRange = (record: Record<string, unknown>) => ({
  ...record,
  thongTinPhepCTs: Array.isArray(record.thongTinPhepCTs)
    ? record.thongTinPhepCTs.filter(isDayInTestRange)
    : [],
});

const summarizeRecord = (record: Record<string, unknown>) => ({
  externalId: asNumberOrNull(record.donNghiPhep_id),
  leaveType: asStringOrNull(record.loaiPhep),
  approvalStatus: asStringOrNull(record.trangThai),
  approvalStatusId: asNumberOrNull(record.trangThai_id),
  location: asStringOrNull(record.noiNghiPhep),
  createdAt: asStringOrNull(record.ngayTao),
  approvedAt: asStringOrNull(record.ngayKy),
  days: Array.isArray(record.thongTinPhepCTs)
    ? record.thongTinPhepCTs.filter(isDayInTestRange).map((day) => ({
        from: asStringOrNull(day.tuNgay),
        to: asStringOrNull(day.denNgay),
        leaveDays: asNumberOrNull(day.soNgayPhep),
      }))
    : [],
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return response({ success: false, error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization)
    return response(
      { success: false, error: "Authentication is required." },
      401,
    );

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return response(
      { success: false, error: "Function authentication is not configured." },
      500,
    );
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return response(
      { success: false, error: "Your session is invalid or has expired." },
      401,
    );
  }
  const { data: callerProfile, error: profileError } = await callerClient
    .from("profiles")
    .select("role,active")
    .eq("id", caller.id)
    .maybeSingle();
  if (
    profileError ||
    !callerProfile ||
    callerProfile.role !== "admin" ||
    !callerProfile.active
  ) {
    return response(
      {
        success: false,
        error:
          "Only active administrators can run this temporary VSP API test.",
      },
      403,
    );
  }

  const token = env("VSP_TEST_API_TOKEN");
  if (!token) {
    return response(
      { success: false, error: "VSP_TEST_API_TOKEN is not configured." },
      500,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(VSP_API_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "AbortError";
    return response(
      {
        success: false,
        error: timedOut
          ? "VSP API request timed out."
          : "Unable to reach the VSP API.",
      },
      timedOut ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    if (upstream.status === 401) {
      return response(
        {
          success: false,
          status: 401,
          error:
            "VSP API authentication failed. Test token may be expired or invalid.",
        },
        401,
      );
    }
    if (upstream.status === 403) {
      return response(
        {
          success: false,
          status: 403,
          error: "VSP API denied access to the test employee data.",
        },
        502,
      );
    }
    if (upstream.status === 404) {
      return response(
        {
          success: false,
          status: 404,
          error: "VSP API endpoint or test employee data was not found.",
        },
        502,
      );
    }
    if (upstream.status >= 500) {
      return response(
        {
          success: false,
          status: upstream.status,
          error: "VSP API is temporarily unavailable.",
        },
        502,
      );
    }
    return response(
      {
        success: false,
        status: upstream.status,
        error: "VSP API request failed.",
      },
      502,
    );
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return response(
      { success: false, error: "VSP API returned invalid JSON." },
      502,
    );
  }
  if (!Array.isArray(payload)) {
    return response(
      {
        success: false,
        error: "VSP API returned an unexpected JSON structure.",
      },
      502,
    );
  }

  const employeeRecords = payload.filter(isTargetRecord);
  const approvedRecords = employeeRecords.filter(
    (record) =>
      typeof record.trangThai === "string" &&
      record.trangThai.trim() === APPROVED_STATUS,
  );
  const recordsInRange = approvedRecords
    .map(limitRecordToTestRange)
    .filter((record) => record.thongTinPhepCTs.length > 0);
  const latest = recordsInRange.reduce<Record<string, unknown> | null>(
    (current, record) =>
      current === null || timestamp(record) > timestamp(current)
        ? record
        : current,
    null,
  );

  return response({
    success: true,
    employeeId: EMPLOYEE_ID,
    employeeNumber: EMPLOYEE_NUMBER,
    requiredApprovalStatus: APPROVED_STATUS,
    fromDate: TEST_FROM_DATE,
    toDate: TEST_TO_DATE,
    upstreamRecordCount: payload.length,
    employeeRecordCount: employeeRecords.length,
    approvedRecordCount: approvedRecords.length,
    recordCount: recordsInRange.length,
    latestRecord: latest ? summarizeRecord(latest) : null,
    // Temporary diagnostics for confirming the undocumented upstream shape.
    // Remove this field as soon as the VSP response contract is confirmed.
    rawResponse: recordsInRange,
  });
});
