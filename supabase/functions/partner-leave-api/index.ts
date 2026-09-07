import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_DATE_RANGE_DAYS = 31;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";

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

const sha256 = async (value: string) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );

const tokensMatch = async (provided: string, expected: string) => {
  const [providedHash, expectedHash] = await Promise.all([
    sha256(provided),
    sha256(expected),
  ]);
  let difference = providedHash.length ^ expectedHash.length;
  for (let index = 0; index < providedHash.length; index += 1) {
    difference |= providedHash[index] ^ expectedHash[index];
  }
  return difference === 0;
};

const parseBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? "";
};

const parseDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  const expectedToken = env("PARTNER_TOKEN");
  if (!expectedToken) {
    console.error("PARTNER_TOKEN is not configured.");
    return jsonResponse(
      { success: false, error: "Partner API is not configured." },
      500,
    );
  }

  const providedToken = parseBearerToken(request);
  if (!providedToken || !(await tokensMatch(providedToken, expectedToken))) {
    return jsonResponse(
      { success: false, error: "Missing or invalid partner token." },
      401,
    );
  }

  const url = new URL(request.url);
  const fromDateText = url.searchParams.get("fromDate");
  const toDateText = url.searchParams.get("toDate");
  const fromDate = parseDate(fromDateText);
  const toDate = parseDate(toDateText);
  if (!fromDate || !toDate) {
    return jsonResponse(
      {
        success: false,
        error: "fromDate and toDate are required in YYYY-MM-DD format.",
      },
      400,
    );
  }

  const rangeDays =
    Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  if (rangeDays < 1 || rangeDays > MAX_DATE_RANGE_DAYS) {
    return jsonResponse(
      {
        success: false,
        error: `Date range must be between 1 and ${MAX_DATE_RANGE_DAYS} days.`,
      },
      400,
    );
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = defaultKey(
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase server credentials are not configured.");
    return jsonResponse(
      {
        success: false,
        error: "Partner API database access is not configured.",
      },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("daily_status")
    .select(
      `
      date,
      start_time,
      end_time,
      updated_at,
      employee:profiles!daily_status_employee_id_fkey!inner(
        employee_code,
        full_name,
        active,
        department:departments(name)
      )
    `,
    )
    .eq("status", "leave")
    .eq("employee.active", true)
    .gte("date", fromDateText!)
    .lte("date", toDateText!)
    .order("date", { ascending: true });

  if (error) {
    console.error("Partner leave query failed:", error.message);
    return jsonResponse(
      { success: false, error: "Unable to read leave data." },
      500,
    );
  }

  const records = (data ?? []).map((row) => {
    const employee = Array.isArray(row.employee)
      ? row.employee[0]
      : row.employee;
    const department = Array.isArray(employee?.department)
      ? employee.department[0]
      : employee?.department;
    return {
      employeeCode: employee?.employee_code ?? null,
      fullName: employee?.full_name ?? null,
      department: department?.name ?? null,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      updatedAt: row.updated_at,
    };
  });

  console.log(
    JSON.stringify({
      event: "partner_leave_api_request",
      fromDate: fromDateText,
      toDate: toDateText,
      recordCount: records.length,
    }),
  );

  return jsonResponse({
    success: true,
    fromDate: fromDateText,
    toDate: toDateText,
    recordCount: records.length,
    data: records,
  });
});
