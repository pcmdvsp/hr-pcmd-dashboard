import { createClient } from "npm:@supabase/supabase-js@2";
import { vietnamDateUtcRange } from "./date-range.js";
import { extractMeetings, filterMeetings } from "./meeting-filter.js";
import { loginToEoffice } from "./eoffice-login.js";
import { syncMeetings } from "./meeting-sync.js";

const VSP_EOFFICE_URL =
  "https://eoffice.vietsov.com.vn/api/EP/exec?_=bookingsbusiness_getlistbookingscheduleasync";
const REQUEST_TIMEOUT_MS = 30_000;

const RESOURCE_IDS = [
  "9f114bce-477d-47af-a4d7-917efeb9068c",
  "e9d56db1-27c5-40f4-b57d-cd13f45ea0f9",
  "8e761951-f414-490b-b540-6434ab3ee879",
  "d0885bc7-ea56-423b-a611-f224e4b475e4",
  "1e0327d7-9744-462c-86c9-4e124395d40b",
  "799d8046-c82b-4807-8fed-4f7cd822e3cf",
  "eb19608c-00ad-40e0-98c3-28ec22ca109a",
  "056151dc-2e2e-400b-9a25-3244189c8db8",
  "830a99f9-0211-4de4-a0a9-7d9dd1ba14a8",
  "9f7aa0f7-07ed-49d3-8f12-2692be3b5fce",
  "f6dc8495-832f-4db0-ab59-aa0b3b1356e3",
  "4fbf6363-0015-45a4-9ec8-85d10f9f6648",
];

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

const requestPayload = ({ start, end }: { start: string; end: string }) => {
  return {
    isJson: true,
    service: "EP",
    assemblyName: "EP",
    className: "BookingsBusiness",
    methodName: "GetListBookingScheduleAsync",
    msgBodyData: [{
      pageLoading: false,
      page: 1,
      pageSize: 1000,
      formName: "PersonalBookingRooms",
      gridViewName: "grvPersonalBookingRooms",
      entityName: "EP_Bookings",
      funcID: "EPT57",
      entityPermission: "EP_PersonalBookingRooms",
      treeIDValue: "",
      favoriteID: "bb681487-0ebb-4f43-8665-a7190fa0e754",
      filter: {
        logic: "and",
        filters: [
          { logic: "and", field: "EndDate", operator: "gte", value: start },
          { logic: "and", field: "StartDate", operator: "lte", value: end },
          {
            logic: "or",
            filters: RESOURCE_IDS.map((value) => ({
              logic: "or",
              field: "ResourceID",
              value,
              operator: "eq",
            })),
          },
        ],
      },
      entryMode: "",
      selector: "",
      isCount: false,
      isAdvancedSearch: false,
    }],
    saas: 0,
    tenant: "default",
    functionID: "EPT57",
    localTz: "Asia/Saigon",
    localRegion: "vi",
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return response({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization)
    return response({ error: "Authentication is required." }, 401);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey)
    return response({ error: "Function authentication is not configured." }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller)
    return response({ error: "Your session is invalid or has expired." }, 401);

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role,active")
    .eq("id", caller.id)
    .maybeSingle();
  if (profileError || profile?.role !== "admin" || !profile.active)
    return response({ error: "Only active administrators can run this eOffice test." }, 403);

  let dateRange: { start: string; end: string };
  let dryRun = false;
  try {
    const text = await request.text();
    const body = text.trim() ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response({ error: "Request body must be a JSON object." }, 400);
    }
    dateRange = vietnamDateUtcRange(body.date);
    dryRun = body.dryRun === true;
  } catch {
    return response({ error: "Provide a JSON object with an optional valid date in YYYY-MM-DD format." }, 400);
  }

  const username = env("VSP_EOFFICE_USERNAME");
  const password = env("VSP_EOFFICE_PASSWORD");
  const hdType = env("VSP_EOFFICE_X_HD_TYPE");
  const deviceJson = env("VSP_EOFFICE_DEVICE_JSON");
  const missingSecrets = [
    !username && "VSP_EOFFICE_USERNAME",
    !password && "VSP_EOFFICE_PASSWORD",
    !hdType && "VSP_EOFFICE_X_HD_TYPE",
  ].filter(Boolean);
  if (missingSecrets.length)
    return response({
      error: `VSP eOffice test credentials are not configured. Missing: ${missingSecrets.join(", ")}.`,
      missingSecrets,
    }, 500);

  // Reuse the authenticated admin client and existing RLS; no service role is needed.
  // This dashboard's profiles are the Ban roster. Departments are subteams,
  // not a parent Ban row. A left join preserves leaders without a department.
  const banProfiles: {
    id: string; email: string; full_name: string; employee_code: string; department_id: string | null;
    department: { name: string } | { name: string }[] | null;
  }[] = [];
  // Include inactive profiles too: an administrator may test a historical day.
  // Page explicitly so the database API row limit cannot silently omit staff.
  let offset = 0;
  while (true) {
    const { data: staff, error: staffError, count } = await callerClient
      .from("profiles")
      .select("id,email,full_name,employee_code,department_id,department:departments(name)", { count: "exact" })
      .order("id")
      .range(offset, offset + 499);
    if (staffError || count === null) {
      return response({ error: "Unable to read dashboard employee profiles." }, 500);
    }
    banProfiles.push(...(staff ?? []));
    offset += staff?.length ?? 0;
    if (offset >= count) break;
    if (!staff?.length) {
      return response({ error: "Incomplete dashboard employee list. Please retry." }, 500);
    }
  }
  if (!banProfiles.length) {
    return response({ error: "No employee profiles exist in the dashboard." }, 409);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let upstream: Response;
  try {
    const session = await loginToEoffice({
      username,
      password,
      hdType,
      deviceJson,
      signal: controller.signal,
    });
    upstream = await fetch(VSP_EOFFICE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,ru;q=0.6",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        Cookie: session.cookie,
        Origin: "https://eoffice.vietsov.com.vn",
        Pragma: "no-cache",
        Referer: "https://eoffice.vietsov.com.vn/default/ep/personalbookingrooms/EPT57",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        "X-HP": "",
        "X-Hd-Req": String(Date.now()),
        "X-Hd-Type": hdType,
        lvtk: session.token,
      },
      body: JSON.stringify(requestPayload(dateRange)),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return response(
      {
        error: timedOut
          ? "VSP eOffice login or meeting request timed out."
          : error instanceof Error ? error.message : "Unable to reach VSP eOffice.",
      },
      timedOut ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    return response(
      { status: upstream.status, error: `VSP eOffice returned HTTP ${upstream.status}.` },
      502,
    );
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return response({ error: "VSP eOffice returned invalid JSON." }, 502);
  }
  try {
    const meetings = extractMeetings(payload);
    const filtered = filterMeetings(meetings, banProfiles);
    const publicMeetings = filtered.map((meeting: Record<string, unknown> & { listAttendees: Record<string, unknown>[] }) => ({
      ...meeting,
      listAttendees: meeting.listAttendees.map(({ employeeId: _employeeId, ...attendee }) => attendee),
    }));
    if (dryRun) {
      return response({
        scope: "dashboard_profiles",
        mode: "test",
        dateRange,
        upstreamMeetingCount: meetings.length,
        recordCount: filtered.length,
        sync: { performed: false },
        data: publicMeetings,
      });
    }
    const sync = await syncMeetings(callerClient, filtered);
    return response({
      scope: "dashboard_profiles",
      mode: "sync",
      dateRange,
      upstreamMeetingCount: meetings.length,
      recordCount: filtered.length,
      sync: {
        createdCount: sync.records.filter((item: { action: string }) => item.action === "created").length,
        updatedCount: sync.records.filter((item: { action: string }) => item.action === "updated").length,
        unchangedCount: sync.records.filter((item: { action: string }) => item.action === "unchanged").length,
        failedCount: sync.errors.length,
        skippedAttendees: sync.skippedAttendees,
        records: sync.records,
        errors: sync.errors,
      },
      data: publicMeetings,
    });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Unable to filter VSP meetings." }, 502);
  }
});
