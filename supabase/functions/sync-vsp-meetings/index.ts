import { createClient } from "npm:@supabase/supabase-js@2";
import { vietnamDateUtcRange } from "../test-vsp-meeting-info/date-range.js";
import { loginToEoffice } from "../test-vsp-meeting-info/eoffice-login.js";
import { extractMeetings, filterMeetings } from "../test-vsp-meeting-info/meeting-filter.js";
import { syncMeetings } from "../test-vsp-meeting-info/meeting-sync.js";
import { MODE_OFFSETS, overallSyncStatus, parseSyncModes, uniqueMeetingsByExternalId } from "./sync-batch.js";
import { syncLogStatus } from "./sync-log.js";

const EOFFICE_URL = "https://eoffice.vietsov.com.vn/api/EP/exec?_=bookingsbusiness_getlistbookingscheduleasync";
const EOFFICE_TIMEOUT_MS = 30_000;
const RESOURCE_IDS = [
  "9f114bce-477d-47af-a4d7-917efeb9068c", "e9d56db1-27c5-40f4-b57d-cd13f45ea0f9", "8e761951-f414-490b-b540-6434ab3ee879",
  "d0885bc7-ea56-423b-a611-f224e4b475e4", "1e0327d7-9744-462c-86c9-4e124395d40b", "799d8046-c82b-4807-8fed-4f7cd822e3cf",
  "eb19608c-00ad-40e0-98c3-28ec22ca109a", "056151dc-2e2e-400b-9a25-3244189c8db8", "830a99f9-0211-4de4-a0a9-7d9dd1ba14a8",
  "9f7aa0f7-07ed-49d3-8f12-2692be3b5fce", "f6dc8495-832f-4db0-ab59-aa0b3b1356e3", "4fbf6363-0015-45a4-9ec8-85d10f9f6648",
];

type Mode = keyof typeof MODE_OFFSETS;
type EofficeSession = { cookie: string; token: string };

const env = (name: string) => Deno.env.get(name) ?? "";
const key = (modern: string, legacy: string) => { try { return JSON.parse(env(modern)).default as string; } catch { return env(legacy); } };
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
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

const withTimeout = async <T>(operation: (signal: AbortSignal) => Promise<T>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EOFFICE_TIMEOUT_MS);
  try { return await operation(controller.signal); }
  finally { clearTimeout(timeout); }
};

const fetchEofficeMeetings = async (
  session: EofficeSession,
  dateRange: { start: string; end: string },
) => withTimeout(async (signal) => {
  const upstream = await fetch(EOFFICE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*", "Content-Type": "application/json", Cookie: session.cookie,
      Origin: "https://eoffice.vietsov.com.vn", Referer: "https://eoffice.vietsov.com.vn/default/ep/personalbookingrooms/EPT57",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      "X-HP": "", "X-Hd-Req": String(Date.now()), "X-Hd-Type": env("VSP_EOFFICE_X_HD_TYPE"), lvtk: session.token,
    },
    body: JSON.stringify(requestPayload(dateRange)), signal,
  });
  return upstream;
});

Deno.serve(async (request) => {
  const requestStartedAt = new Date();
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);
  const cronSecret = env("CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return response({ error: "Unauthorized." }, 401);

  let modes: Mode[];
  try { modes = parseSyncModes(await request.json()) as Mode[]; }
  catch { return response({ error: 'Body must contain mode or modes using "today", "tomorrow", "in2days", or "in3days".' }, 400); }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const username = env("VSP_EOFFICE_USERNAME"), password = env("VSP_EOFFICE_PASSWORD"), hdType = env("VSP_EOFFICE_X_HD_TYPE");
  const deviceJson = env("VSP_EOFFICE_DEVICE_JSON");
  if (!supabaseUrl || !serviceKey) return response({ error: "Supabase service credentials are not configured." }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const writeLog = async (mode: Mode, startedAt: Date, values: Record<string, unknown>) => {
    const finishedAt = new Date();
    const { error } = await admin.from("vsp_meeting_sync_logs").insert({
      run_type: "scheduled", mode, target_date: vietnamDate(MODE_OFFSETS[mode]),
      started_at: startedAt.toISOString(), finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      ...values,
    });
    if (error) console.error("Unable to save VSP meeting sync log:", error.message);
    return !error;
  };
  const failAllModes = async (stage: string, message: string, status = 502) => {
    const error = { stage, error: message };
    await Promise.all(modes.map((mode) => writeLog(mode, requestStartedAt, { status: "failed", errors: [error], failed_count: 1 })));
    return response({ error: message, stage }, status);
  };

  if (!username || !password || !hdType) {
    return failAllModes("configuration", "Automatic VSP meeting sync secrets are not configured.", 500);
  }
  const { data: profiles, error: profileError } = await admin.from("profiles")
    .select("id,email,full_name,employee_code,department_id,department:departments(name)").order("id").limit(5000);
  if (profileError || !profiles?.length) {
    return failAllModes("load_profiles", profileError?.message || "No dashboard profiles exist.", 500);
  }

  let loginCount = 0;
  const createEofficeSession = () => {
    loginCount += 1;
    return withTimeout((signal) => loginToEoffice({ username, password, hdType, deviceJson, signal }));
  };
  let session: EofficeSession;
  try {
    session = await createEofficeSession();
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return failAllModes("eoffice_login", loginErrorMessage(timedOut, error));
  }

  const completedByExternalId = new Map<string, Array<Record<string, unknown>>>();
  const results: Array<Record<string, unknown>> = [];
  for (const mode of modes) {
    const modeStartedAt = new Date();
    const targetDate = vietnamDate(MODE_OFFSETS[mode]);
    const dateRange = vietnamDateUtcRange(targetDate);
    try {
      let upstream = await fetchEofficeMeetings(session, dateRange);
      if (upstream.status === 401 || upstream.status === 403) {
        session = await createEofficeSession();
        upstream = await fetchEofficeMeetings(session, dateRange);
      }
      if (!upstream.ok) throw new Error(`VSP eOffice returned HTTP ${upstream.status}.`);
      const meetings = extractMeetings(await upstream.json());
      const filtered = uniqueMeetingsByExternalId(filterMeetings(meetings, profiles));
      const duplicatedRecords: Array<Record<string, unknown>> = [];
      const pending = filtered.filter((meeting: { recID: string }) => {
        const completed = completedByExternalId.get(meeting.recID.trim());
        if (!completed) return true;
        duplicatedRecords.push(...completed.map((record) => ({ ...record, action: "unchanged", attendeeCount: null })));
        return false;
      });
      const sync = await syncMeetings(admin, pending);
      const errorsByExternalId = new Set(sync.errors.map((item: { externalId?: string }) => item.externalId).filter(Boolean));
      for (const meeting of pending) {
        const externalId = meeting.recID.trim();
        if (errorsByExternalId.has(externalId)) continue;
        const meetingRecords = sync.records.filter((record: { externalId: string }) => record.externalId === externalId);
        if (meetingRecords.length) completedByExternalId.set(externalId, meetingRecords);
      }
      const records = [...duplicatedRecords, ...sync.records];
      const createdCount = records.filter((item: { action?: unknown }) => item.action === "created").length;
      const unchangedCount = records.filter((item: { action?: unknown }) => item.action === "unchanged").length;
      const failedCount = sync.errors.length;
      const status = syncLogStatus({ matchedCount: filtered.length, successfulCount: records.length, failedCount });
      const generatedOccurrenceCount = sync.generatedOccurrenceCount + duplicatedRecords.length;
      const logSaved = await writeLog(mode, modeStartedAt, {
        status, upstream_meeting_count: meetings.length, matched_meeting_count: filtered.length,
        generated_occurrence_count: generatedOccurrenceCount,
        created_count: createdCount, unchanged_count: unchangedCount, failed_count: failedCount,
        skipped_attendees: sync.skippedAttendees, errors: sync.errors,
      });
      results.push({
        mode, targetDate, status, logSaved, upstreamMeetingCount: meetings.length, matchedMeetingCount: filtered.length,
        sync: { generatedOccurrenceCount, createdCount, unchangedCount, failedCount, skippedAttendees: sync.skippedAttendees, records, errors: sync.errors },
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      const message = timedOut ? "VSP eOffice request timed out." : errorMessage(error, "VSP meeting sync failed.");
      const syncError = { stage: "eoffice_schedule", error: message };
      const logSaved = await writeLog(mode, modeStartedAt, { status: "failed", failed_count: 1, errors: [syncError] });
      results.push({ mode, targetDate, status: "failed", logSaved, sync: { generatedOccurrenceCount: 0, createdCount: 0, unchangedCount: 0, failedCount: 1, skippedAttendees: [], records: [], errors: [syncError] } });
    }
  }

  if (results.length === 1) return response(results[0]);
  return response({ status: overallSyncStatus(results), loginCount, results });
});

function loginErrorMessage(timedOut: boolean, error: unknown) {
  return timedOut ? "VSP eOffice login timed out." : errorMessage(error, "VSP eOffice login failed.");
}
