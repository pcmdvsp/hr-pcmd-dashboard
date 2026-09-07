import { createClient } from "npm:@supabase/supabase-js@2";

const VSP_BASE_URL = "https://phep.vietsov.com.vn";
const APPROVED_STATUS_IDS = [142];
const TARGET_UNIT = "Ban Quản lý các Hợp đồng Dầu khí";
const REQUEST_TIMEOUT_MS = 30_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";

const defaultKey = (modernName: string, legacyName: string) => {
  const modernValue = env(modernName);
  if (modernValue) {
    try {
      return JSON.parse(modernValue).default as string;
    } catch {
      // Fall through to the legacy key.
    }
  }
  return env(legacyName);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const findApiToken = (value: unknown, depth = 0): string | null => {
  if (depth > 4 || !isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (
      (normalizedKey === "apitoken" || normalizedKey === "accesstoken") &&
      typeof child === "string" && child.trim()
    ) return child;
  }
  for (const child of Object.values(value)) {
    const token = findApiToken(child, depth + 1);
    if (token) return token;
  }
  return null;
};

const loginDiagnostics = (value: unknown) => {
  if (!isRecord(value)) return { responseType: typeof value };
  const safeText = (key: string) => {
    const item = value[key];
    return typeof item === "string" || typeof item === "number" || typeof item === "boolean"
      ? item
      : undefined;
  };
  return {
    responseKeys: Object.keys(value),
    stausCode: safeText("stausCode"),
    statusCode: safeText("statusCode"),
    errorMessage: safeText("errorMessage"),
    message: safeText("message"),
  };
};

const belongsToTargetUnit = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && value.donVi === TARGET_UNIT;

const approvedOnDate = (value: unknown, selectedDate: string) =>
  belongsToTargetUnit(value) && typeof value.ngayKy === "string" &&
  value.ngayKy.slice(0, 10) === selectedDate;

const vietnamToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const vietnamDateOffset = (offsetDays: number) => {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
};

const extractLeavePage = (value: unknown) => {
  if (Array.isArray(value)) return { records: value, total: value.length };
  if (!isRecord(value))
    throw new Error("VSP leave response has an unsupported pagination structure.");
  if (Array.isArray(value.paginatedList)) {
    return {
      records: value.paginatedList,
      total: typeof value.total === "number" ? value.total : value.paginatedList.length,
    };
  }
  if (isRecord(value.data) && Array.isArray(value.data.paginatedList)) {
    return {
      records: value.data.paginatedList,
      total: typeof value.data.total === "number"
        ? value.data.total
        : value.data.paginatedList.length,
    };
  }
  throw new Error("VSP leave response has an unsupported pagination structure.");
};

const dateOnly = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;

const datesInRange = (start: string, end: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const syncApprovedLeaves = async (
  client: ReturnType<typeof createClient>,
  records: unknown[],
) => {
  const employeeCodes = [...new Set(records
    .filter(isRecord)
    .map((record) => String(record.danhSo ?? "").trim())
    .filter(Boolean))];
  const { data: profiles, error: profilesError } = employeeCodes.length
    ? await client
      .from("profiles")
      .select("id,employee_code,full_name,active")
      .in("employee_code", employeeCodes)
    : { data: [], error: null };
  if (profilesError) throw new Error(`Unable to match VSP employees: ${profilesError.message}`);

  const profileByCode = new Map(
    (profiles ?? []).map((profile) => [String(profile.employee_code), profile]),
  );
  const result = {
    createdDayCount: 0,
    updatedDayCount: 0,
    unchangedDayCount: 0,
    notificationCount: 0,
    syncedPeriodCount: 0,
    skipped: [] as Record<string, unknown>[],
    errors: [] as Record<string, unknown>[],
  };

  for (const value of records) {
    if (!isRecord(value)) continue;
    const employeeCode = String(value.danhSo ?? "").trim();
    const profile = profileByCode.get(employeeCode);
    if (!profile || !profile.active) {
      result.skipped.push({
        donNghiPhepId: value.donNghiPhep_id ?? null,
        employeeCode,
        name: value.hoTen ?? null,
        reason: profile ? "inactive_profile" : "profile_not_found",
      });
      continue;
    }
    const location = typeof value.noiNghiPhep === "string"
      ? value.noiNghiPhep.trim()
      : "";
    const periods = Array.isArray(value.thongTinPhepCTs)
      ? value.thongTinPhepCTs
      : [];
    if (!periods.length) {
      result.errors.push({
        donNghiPhepId: value.donNghiPhep_id ?? null,
        employeeCode,
        error: "No leave periods were returned in thongTinPhepCTs.",
      });
      continue;
    }

    for (const period of periods) {
      const startDate = isRecord(period) ? dateOnly(period.tuNgay) : null;
      const endDate = isRecord(period) ? dateOnly(period.denNgay) : null;
      if (!startDate || !endDate || endDate < startDate) {
        result.errors.push({
          donNghiPhepId: value.donNghiPhep_id ?? null,
          periodId: isRecord(period) ? period.id ?? null : null,
          employeeCode,
          error: "Invalid leave period.",
        });
        continue;
      }
      const dates = datesInRange(startDate, endDate);
      const { data: existing, error: existingError } = await client
        .from("daily_status")
        .select("date,status,note,source")
        .eq("employee_id", profile.id)
        .in("date", dates);
      if (existingError) {
        result.errors.push({ employeeCode, startDate, endDate, error: existingError.message });
        continue;
      }
      const existingByDate = new Map(
        (existing ?? []).map((item) => [item.date, item]),
      );
      const changedDates = dates.filter((date) => {
        const current = existingByDate.get(date);
        return !current || current.status !== "leave" ||
          (current.note ?? "") !== location || current.source !== "vsp";
      });
      result.unchangedDayCount += dates.length - changedDates.length;
      if (!changedDates.length) continue;

      const { data: meetings, error: meetingsError } = await client
        .from("employee_meetings")
        .select("id,organizer_id")
        .in("date", changedDates);
      if (meetingsError) {
        result.errors.push({ employeeCode, startDate, endDate, error: meetingsError.message });
        continue;
      }
      const meetingIds = (meetings ?? []).map((meeting) => meeting.id);
      const ownMeetingIds = (meetings ?? [])
        .filter((meeting) => meeting.organizer_id === profile.id)
        .map((meeting) => meeting.id);
      if (ownMeetingIds.length) {
        const { error } = await client.from("employee_meetings").delete().in("id", ownMeetingIds);
        if (error) {
          result.errors.push({ employeeCode, startDate, endDate, error: error.message });
          continue;
        }
      }
      if (meetingIds.length) {
        const { error } = await client
          .from("employee_meeting_attendees")
          .delete()
          .eq("employee_id", profile.id)
          .in("meeting_id", meetingIds);
        if (error) {
          result.errors.push({ employeeCode, startDate, endDate, error: error.message });
          continue;
        }
      }

      const rows = changedDates.map((date) => ({
        employee_id: profile.id,
        date,
        status: "leave",
        source: "vsp",
        is_overtime: false,
        note: location || null,
        content: null,
        location: null,
        start_time: null,
        end_time: null,
      }));
      const { error: statusError } = await client
        .from("daily_status")
        .upsert(rows, { onConflict: "employee_id,date" });
      if (statusError) {
        result.errors.push({ employeeCode, startDate, endDate, error: statusError.message });
        continue;
      }
      result.createdDayCount += changedDates.filter((date) => !existingByDate.has(date)).length;
      result.updatedDayCount += changedDates.filter((date) => existingByDate.has(date)).length;

      const { error: notificationError } = await client
        .from("status_update_notifications")
        .insert({
          employee_id: profile.id,
          status: "leave",
          start_date: startDate,
          end_date: endDate,
          content: "Synced from VSP",
          location: location || null,
        });
      if (notificationError) {
        result.errors.push({
          employeeCode,
          startDate,
          endDate,
          error: `Status saved but notification failed: ${notificationError.message}`,
        });
      } else {
        result.notificationCount += 1;
      }
      result.syncedPeriodCount += 1;
    }
  }
  return result;
};

const fetchWithTimeout = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const readUpstreamJson = async (upstream: Response, operation: string) => {
  const text = await upstream.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${operation} returned invalid JSON.`);
  }
  if (!upstream.ok) {
    const error = new Error(`${operation} returned HTTP ${upstream.status}.`);
    Object.assign(error, { upstreamStatus: upstream.status, upstreamBody: data });
    throw error;
  }
  return data;
};

const loginToVspLeave = async (username: string, password: string) => {
  const email = username;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("VSP_PHEP_USERNAME must contain the full login email address.");
  }
  const endpoint = "/api/Account/email-login";
  const payload = { email, password, captcha: null };

  const upstream = await fetchWithTimeout(`${VSP_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readUpstreamJson(upstream, "VSP leave login");
  const token = findApiToken(data);
  if (!token) {
    const error = new Error("VSP leave login did not return an API token.");
    Object.assign(error, { loginDiagnostics: loginDiagnostics(data) });
    throw error;
  }
  const loginProfile = isRecord(data) && isRecord(data.response)
    ? data.response
    : isRecord(data) && isRecord(data.data) && isRecord(data.data.response)
    ? data.data.response
    : null;
  return { token, loginProfile, email };
};

const getVspDepartmentScope = async (token: string, email: string) => {
  const url = new URL(`${VSP_BASE_URL}/api/NhanVien/AdminDonVi`);
  url.searchParams.set("username", email);
  const upstream = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const result = await readUpstreamJson(upstream, "VSP department lookup");
  return isRecord(result) && "data" in result ? result.data : result;
};

Deno.serve(async (request) => {
  const startedAt = new Date();
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const serviceKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey)
    return jsonResponse({ success: false, error: "Function authentication is not configured." }, 500);
  const cronRequest = request.headers.get("x-cron-secret") !== null;
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let dataClient = adminClient;
  if (cronRequest) {
    const cronSecret = env("CRON_SECRET");
    if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret)
      return jsonResponse({ success: false, error: "Unauthorized scheduler request." }, 401);
  } else {
    const authorization = request.headers.get("Authorization");
    if (!authorization)
      return jsonResponse({ success: false, error: "Authentication is required." }, 401);
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user)
      return jsonResponse({ success: false, error: "Your session is invalid or has expired." }, 401);
    const { data: profile, error: profileError } = await callerClient.from("profiles")
      .select("role,active").eq("id", user.id).maybeSingle();
    if (profileError || profile?.role !== "admin" || !profile.active)
      return jsonResponse({ success: false, error: "Only active administrators can run this VSP leave test." }, 403);
    dataClient = callerClient;
  }

  const username = env("VSP_PHEP_USERNAME");
  const password = env("VSP_PHEP_PASSWORD");

  let requestedFilters: Record<string, unknown> = {};
  let selectedDate = vietnamToday();
  let dryRun = false;
  let scheduleMode: "today" | "yesterday" = "today";
  try {
    const text = await request.text();
    const body = text.trim() ? JSON.parse(text) : {};
    if (!isRecord(body))
      return jsonResponse({ success: false, error: "Request body must be a JSON object." }, 400);
    if (body.date !== undefined && body.date !== null && body.date !== "") {
      if (!validDate(body.date))
        return jsonResponse({ success: false, error: "Date must use YYYY-MM-DD format." }, 400);
      selectedDate = body.date;
    }
    dryRun = body.dryRun === true;
    if (cronRequest) {
      if (body.mode !== "today" && body.mode !== "yesterday")
        return jsonResponse({ success: false, error: 'Scheduled body mode must be "today" or "yesterday".' }, 400);
      scheduleMode = body.mode;
      selectedDate = vietnamDateOffset(body.mode === "yesterday" ? -1 : 0);
      dryRun = false;
    }
    requestedFilters = isRecord(body.filters) ? body.filters : {};
  } catch {
    return jsonResponse({ success: false, error: "Request body must contain valid JSON." }, 400);
  }

  const writeScheduledLog = async (values: Record<string, unknown>) => {
    if (!cronRequest) return;
    const finishedAt = new Date();
    const { error } = await adminClient.from("vsp_leave_sync_logs").insert({
      run_type: "scheduled",
      mode: scheduleMode,
      target_date: selectedDate,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      ...values,
    });
    if (error) console.error("Unable to save VSP leave sync log:", error.message);
  };

  const missingSecrets = [
    !username && "VSP_PHEP_USERNAME",
    !password && "VSP_PHEP_PASSWORD",
  ].filter(Boolean);
  if (missingSecrets.length) {
    const message = `VSP leave credentials are not configured. Missing: ${missingSecrets.join(", ")}.`;
    await writeScheduledLog({ status: "failed", failed_count: 1, errors: [{ error: message }] });
    return jsonResponse({ success: false, error: message, missingSecrets }, 500);
  }

  // The VSP date fields filter leave periods, not approval time. Leave them
  // empty, fetch every approved record in the scoped unit, then filter ngayKy.
  const filters = {
    ...requestedFilters,
    pageNumber: 1,
    pageSize: 1000,
    fromLeaveDateFilter: null,
    toLeaveDateFilter: null,
    trangThai_ids: APPROVED_STATUS_IDS,
    languageId: "VI",
  };

  try {
    const { token, email } = await loginToVspLeave(username, password);
    const departmentId = await getVspDepartmentScope(token, email);
    if (
      departmentId === null || departmentId === undefined ||
      (typeof departmentId !== "number" &&
        !(typeof departmentId === "string" && departmentId.trim()))
    ) {
      throw new Error("VSP department lookup did not return a valid department scope.");
    }
    const scopedFilters = {
      ...filters,
      currentDepartmentFilter: departmentId,
    };
    const allRecords: unknown[] = [];
    let pageNumber = 1;
    let upstreamTotal = 0;
    const maxPages = 100;
    while (pageNumber <= maxPages) {
      const upstream = await fetchWithTimeout(
        `${VSP_BASE_URL}/api/Phep/DanhSachGNPFilter`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...scopedFilters, pageNumber }),
        },
      );
      const upstreamResponse = await readUpstreamJson(
        upstream,
        `VSP approved leave request page ${pageNumber}`,
      );
      const page = extractLeavePage(upstreamResponse);
      allRecords.push(...page.records);
      upstreamTotal = page.total;
      if (page.records.length < scopedFilters.pageSize || allRecords.length >= upstreamTotal) break;
      pageNumber += 1;
    }
    if (pageNumber > maxPages)
      throw new Error("VSP approved leave pagination exceeded the safety limit.");

    const paginatedList = allRecords.filter((record) => approvedOnDate(record, selectedDate));
    const sync = dryRun
      ? { mode: "test", performed: false }
      : {
          mode: "sync",
          performed: true,
          ...await syncApprovedLeaves(dataClient, paginatedList),
        };
    if (cronRequest) {
      const failedCount = "errors" in sync && Array.isArray(sync.errors) ? sync.errors.length : 0;
      const changedCount = ("createdDayCount" in sync ? Number(sync.createdDayCount) : 0) +
        ("updatedDayCount" in sync ? Number(sync.updatedDayCount) : 0);
      const status = failedCount
        ? changedCount || paginatedList.length ? "partial" : "failed"
        : paginatedList.length ? "success" : "no_matches";
      await writeScheduledLog({
        status,
        upstream_record_count: allRecords.length,
        matched_record_count: paginatedList.length,
        created_day_count: "createdDayCount" in sync ? sync.createdDayCount : 0,
        updated_day_count: "updatedDayCount" in sync ? sync.updatedDayCount : 0,
        unchanged_day_count: "unchangedDayCount" in sync ? sync.unchangedDayCount : 0,
        notification_count: "notificationCount" in sync ? sync.notificationCount : 0,
        synced_period_count: "syncedPeriodCount" in sync ? sync.syncedPeriodCount : 0,
        failed_count: failedCount,
        skipped: "skipped" in sync ? sync.skipped : [],
        errors: "errors" in sync ? sync.errors : [],
      });
    }
    const rawResponse = { pageIndex: 1, total: paginatedList.length, paginatedList };
    return jsonResponse({
      success: true,
      endpoint: "/api/Phep/DanhSachGNPFilter",
      mode: dryRun ? "test" : "sync",
      runType: cronRequest ? "scheduled" : "manual",
      selectedDate,
      unit: TARGET_UNIT,
      filters: scopedFilters,
      approvalDateField: "ngayKy",
      upstreamRecordCount: allRecords.length,
      upstreamTotal,
      upstreamPageCount: pageNumber,
      sync,
      rawResponse,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    const upstreamStatus = isRecord(error) && typeof error.upstreamStatus === "number"
      ? error.upstreamStatus
      : undefined;
    const upstreamBody = isRecord(error) ? error.upstreamBody : undefined;
    const diagnostics = isRecord(error) ? error.loginDiagnostics : undefined;
    const message = timedOut
      ? "The VSP leave request timed out."
      : error instanceof Error ? error.message : "Unable to call the VSP leave service.";
    await writeScheduledLog({
      status: "failed",
      failed_count: 1,
      errors: [{ error: message, ...(upstreamStatus ? { upstreamStatus } : {}) }],
    });
    return jsonResponse({
      success: false,
      error: message,
      ...(upstreamStatus ? { upstreamStatus } : {}),
      // Include upstream errors for this Admin-only diagnostic, but never the
      // credentials or API token.
      ...(upstreamBody !== undefined ? { upstreamBody } : {}),
      ...(diagnostics !== undefined ? { loginDiagnostics: diagnostics } : {}),
    }, timedOut ? 504 : 502);
  }
});
