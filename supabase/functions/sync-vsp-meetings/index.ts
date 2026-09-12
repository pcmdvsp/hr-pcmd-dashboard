import { createClient } from "npm:@supabase/supabase-js@2";
import { vietnamDateUtcRange } from "../test-vsp-meeting-info/date-range.js";
import { loginToEoffice } from "../test-vsp-meeting-info/eoffice-login.js";
import { extractMeetings, filterMeetings } from "../test-vsp-meeting-info/meeting-filter.js";
import { syncMeetings } from "../test-vsp-meeting-info/meeting-sync.js";
import { syncLogStatus } from "./sync-log.js";

const EOFFICE_URL = "https://eoffice.vietsov.com.vn/api/EP/exec?_=bookingsbusiness_getlistbookingscheduleasync";
const TIMEOUT_MS = 30_000;
const RESOURCE_IDS = [
  "9f114bce-477d-47af-a4d7-917efeb9068c", "e9d56db1-27c5-40f4-b57d-cd13f45ea0f9", "8e761951-f414-490b-b540-6434ab3ee879",
  "d0885bc7-ea56-423b-a611-f224e4b475e4", "1e0327d7-9744-462c-86c9-4e124395d40b", "799d8046-c82b-4807-8fed-4f7cd822e3cf",
  "eb19608c-00ad-40e0-98c3-28ec22ca109a", "056151dc-2e2e-400b-9a25-3244189c8db8", "830a99f9-0211-4de4-a0a9-7d9dd1ba14a8",
  "9f7aa0f7-07ed-49d3-8f12-2692be3b5fce", "f6dc8495-832f-4db0-ab59-aa0b3b1356e3", "4fbf6363-0015-45a4-9ec8-85d10f9f6648",
];

const env = (name: string) => Deno.env.get(name) ?? "";
const key = (modern: string, legacy: string) => { try { return JSON.parse(env(modern)).default as string; } catch { return env(legacy); } };
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const vietnamDate = (offsetDays: number) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(Date.now() + offsetDays * 86_400_000));

const requestPayload = ({ start, end }: { start: string; end: string }) => ({
  isJson: true, service: "EP", assemblyName: "EP", className: "BookingsBusiness", methodName: "GetListBookingScheduleAsync",
  msgBodyData: [{
    pageLoading: false, page: 1, pageSize: 1000, formName: "PersonalBookingRooms", gridViewName: "grvPersonalBookingRooms",
    entityName: "EP_Bookings", funcID: "EPT57", entityPermission: "EP_PersonalBookingRooms", treeIDValue: "",
    favoriteID: "bb681487-0ebb-4f43-8665-a7190fa0e754",
    filter: { logic: "and", filters: [
      { logic: "and", field: "EndDate", operator: "gte", value: start },
      { logic: "and", field: "StartDate", operator: "lte", value: end },
      { logic: "or", filters: RESOURCE_IDS.map((value) => ({ logic: "or", field: "ResourceID", value, operator: "eq" })) },
    ] },
    entryMode: "", selector: "", isCount: false, isAdvancedSearch: false,
  }],
  saas: 0, tenant: "default", functionID: "EPT57", localTz: "Asia/Saigon", localRegion: "vi",
});

Deno.serve(async (request) => {
  const startedAt = new Date();
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);
  const cronSecret = env("CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return response({ error: "Unauthorized." }, 401);

  const modeOffsets = { today: 0, tomorrow: 1, in2days: 2, in3days: 3 } as const;
  let mode: keyof typeof modeOffsets;
  try {
    const body = await request.json();
    if (typeof body?.mode !== "string" || !(body.mode in modeOffsets)) throw new Error();
    mode = body.mode;
  } catch {
    return response({ error: 'Body mode must be "today", "tomorrow", "in2days", or "in3days".' }, 400);
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const username = env("VSP_EOFFICE_USERNAME"), password = env("VSP_EOFFICE_PASSWORD"), hdType = env("VSP_EOFFICE_X_HD_TYPE");
  const deviceJson = env("VSP_EOFFICE_DEVICE_JSON");
  if (!supabaseUrl || !serviceKey) return response({ error: "Supabase service credentials are not configured." }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const targetDate = vietnamDate(modeOffsets[mode]);
  const dateRange = vietnamDateUtcRange(targetDate);
  const writeLog = async (values: Record<string, unknown>) => {
    const finishedAt = new Date();
    const { error } = await admin.from("vsp_meeting_sync_logs").insert({
      run_type: "scheduled", mode, target_date: targetDate,
      started_at: startedAt.toISOString(), finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      ...values,
    });
    if (error) console.error("Unable to save VSP meeting sync log:", error.message);
    return !error;
  };
  if (!username || !password || !hdType) {
    const message = "Automatic VSP meeting sync secrets are not configured.";
    await writeLog({ status: "failed", errors: [{ error: message }], failed_count: 1 });
    return response({ error: message }, 500);
  }
  const { data: profiles, error: profileError } = await admin.from("profiles")
    .select("id,email,full_name,employee_code,department_id,department:departments(name)").order("id").limit(5000);
  if (profileError || !profiles?.length) {
    const message = profileError?.message || "No dashboard profiles exist.";
    await writeLog({ status: "failed", errors: [{ error: message }], failed_count: 1 });
    return response({ error: message }, 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const session = await loginToEoffice({ username, password, hdType, deviceJson, signal: controller.signal });
    const upstream = await fetch(EOFFICE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*", "Content-Type": "application/json", Cookie: session.cookie,
        Origin: "https://eoffice.vietsov.com.vn", Referer: "https://eoffice.vietsov.com.vn/default/ep/personalbookingrooms/EPT57",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        "X-HP": "", "X-Hd-Req": String(Date.now()), "X-Hd-Type": hdType, lvtk: session.token,
      },
      body: JSON.stringify(requestPayload(dateRange)), signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`VSP eOffice returned HTTP ${upstream.status}.`);
    const meetings = extractMeetings(await upstream.json());
    const filtered = filterMeetings(meetings, profiles);
    const sync = await syncMeetings(admin, filtered);
    const createdCount = sync.records.filter((item: { action: string }) => item.action === "created").length;
    const unchangedCount = sync.records.filter((item: { action: string }) => item.action === "unchanged").length;
    const failedCount = sync.errors.length;
    const logStatus = syncLogStatus({
      matchedCount: filtered.length,
      successfulCount: sync.records.length,
      failedCount,
    });
    const logSaved = await writeLog({
      status: logStatus,
      upstream_meeting_count: meetings.length, matched_meeting_count: filtered.length,
      generated_occurrence_count: sync.generatedOccurrenceCount,
      created_count: createdCount, unchanged_count: unchangedCount, failed_count: failedCount,
      skipped_attendees: sync.skippedAttendees, errors: sync.errors,
    });
    return response({
      mode, targetDate, status: logStatus, logSaved,
      upstreamMeetingCount: meetings.length, matchedMeetingCount: filtered.length,
      sync: {
        generatedOccurrenceCount: sync.generatedOccurrenceCount,
        createdCount, unchangedCount, failedCount,
        skippedAttendees: sync.skippedAttendees, records: sync.records, errors: sync.errors,
      },
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    const message = timedOut ? "VSP meeting sync timed out." : error instanceof Error ? error.message : "VSP meeting sync failed.";
    await writeLog({ status: "failed", failed_count: 1, errors: [{ error: message }] });
    return response({ error: message }, timedOut ? 504 : 502);
  } finally { clearTimeout(timeout); }
});
