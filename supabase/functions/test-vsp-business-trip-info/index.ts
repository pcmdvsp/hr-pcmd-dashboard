import { createClient } from "npm:@supabase/supabase-js@2";
import * as cheerio from "npm:cheerio@1.0.0";

const EMPLOYEE_NUMBER = "18351";
const VSP_NHANSU_URL =
  `https://nhansu.vietsov.com.vn/EHRP/ASPX/Daotao/CT_CongLenh_ToTrinh_CongTacTrongNuoc.aspx?id6=2&UserName=${EMPLOYEE_NUMBER}`;
const REQUEST_TIMEOUT_MS = 45_000;
const EVENT_TARGET = "ctl00$ContentPlaceHolder1$LinkButtonExpand";
const TRIP_ID_FIELD = "ctl00$ContentPlaceHolder1$HiddenFieldCongTac_id";
const MAIN_ROW_ID = /^ctl00_ContentPlaceHolder1_RadGridToTrinhDiCT_ctl00__\d+$/;

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

const cleanText = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const sessionCookie = (secret: string) =>
  secret.includes("=") ? secret : `ASP.NET_SessionId=${secret}`;

const isLoginPage = (url: string, html: string) => {
  const normalizedUrl = url.toLowerCase();
  const normalizedHtml = html.toLowerCase();
  return normalizedUrl.includes("login") ||
    normalizedHtml.includes("asp.net_sessionid") && normalizedHtml.includes("đăng nhập") ||
    normalizedHtml.includes('type="password"') && !normalizedHtml.includes("radgridtotrinhdict");
};

const collectFormValues = ($: cheerio.CheerioAPI) => {
  const values = new URLSearchParams();
  $("form input[name], form select[name], form textarea[name]").each((_, element) => {
    const field = $(element);
    const name = field.attr("name");
    if (!name) return;
    const tag = String(field.prop("tagName") ?? "").toLowerCase();
    const type = (field.attr("type") ?? "").toLowerCase();
    if (["submit", "button", "image", "file", "reset"].includes(type)) return;
    if (["checkbox", "radio"].includes(type) && !field.is(":checked")) return;
    if (tag === "select") {
      field.find("option:selected").each((__, option) => values.append(name, $(option).attr("value") ?? cleanText($(option).text())));
      return;
    }
    values.append(name, field.attr("value") ?? field.text() ?? "");
  });
  return values;
};

const mainRows = ($: cheerio.CheerioAPI) => $("tr[id]").filter((_, row) =>
  MAIN_ROW_ID.test($(row).attr("id") ?? "")
);

const extractTripIds = ($: cheerio.CheerioAPI, html: string) => {
  const ids = new Set<string>();
  mainRows($).each((_, row) => {
    const value = cleanText($(row).children("td").eq(1).text());
    if (/^\d+$/.test(value)) ids.add(value);
  });
  for (const match of html.matchAll(/CongTac_id["'\\:=\s,&]+(?:&quot;)?(\d+)/gi)) ids.add(match[1]);
  return [...ids];
};

const findMainRow = ($: cheerio.CheerioAPI, tripId: string) => {
  return mainRows($).filter((_, row) =>
    cleanText($(row).children("td").eq(1).text()) === tripId
  ).first();
};

const parseTripDetail = (html: string, tripId: string) => {
  const $ = cheerio.load(html);
  const row = findMainRow($, tripId);
  if (!row.length) throw new Error(`Business trip ${tripId} was not found in the detail response.`);
  const cells = row.children("td");
  if (cells.length < 14) throw new Error(`Business trip ${tripId} has an unexpected row structure.`);

  const detailRow = row.next("tr");
  const employees: Array<{ employeeNumber: string; fullName: string }> = [];
  detailRow.find('span[id$="_Label_DS"]').each((_, employeeNumberElement) => {
    const employeeRow = $(employeeNumberElement).closest("tr");
    const employeeNumber = cleanText($(employeeNumberElement).text());
    const fullName = cleanText(employeeRow.find('span[id$="_Label_HoTen"]').first().text());
    if (employeeNumber || fullName) employees.push({ employeeNumber, fullName });
  });
  if (!employees.length) throw new Error(`Business trip ${tripId} detail did not contain an employee list.`);

  return {
    businessTripId: tripId,
    content: cleanText(cells.eq(5).text()),
    fromDate: cleanText(cells.eq(6).text()),
    toDate: cleanText(cells.eq(7).text()),
    location: cleanText(cells.eq(10).text()),
    status: cleanText(cells.eq(13).text()),
    employees,
  };
};

const fetchPage = async (
  cookie: string,
  signal: AbortSignal,
  body?: URLSearchParams,
) => {
  const upstream = await fetch(VSP_NHANSU_URL, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      Cookie: cookie,
      Referer: VSP_NHANSU_URL,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body?.toString(),
    redirect: "follow",
    signal,
  });
  if (!upstream.ok) throw new Error(`VSP HR returned HTTP ${upstream.status}.`);
  const html = await upstream.text();
  if (isLoginPage(upstream.url, html)) throw new Error("VSP HR session is invalid or has expired.");
  return html;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response({ error: "Authentication is required." }, 401);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey)
    return response({ error: "Function authentication is not configured." }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller)
    return response({ error: "Your session is invalid or has expired." }, 401);

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role,active")
    .eq("id", caller.id)
    .maybeSingle();
  if (profileError || profile?.role !== "admin" || !profile.active)
    return response({ error: "Only active administrators can run this VSP HR test." }, 403);

  const session = env("VSP_NHANSU_TEST_SESSION");
  if (!session)
    return response({ error: "VSP_NHANSU_TEST_SESSION is not configured." }, 500);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const cookie = sessionCookie(session);
    const listHtml = await fetchPage(cookie, controller.signal);
    const listPage = cheerio.load(listHtml);
    const tripIds = extractTripIds(listPage, listHtml);
    if (!tripIds.length)
      return response({ error: "VSP HR page did not contain any CongTac_id values." }, 502);

    const baseForm = collectFormValues(listPage);
    const records = [];
    for (const tripId of tripIds) {
      const form = new URLSearchParams(baseForm);
      form.set("__EVENTTARGET", EVENT_TARGET);
      form.set("__EVENTARGUMENT", "");
      form.set(TRIP_ID_FIELD, tripId);
      const detailHtml = await fetchPage(cookie, controller.signal, form);
      records.push(parseTripDetail(detailHtml, tripId));
    }

    return response({
      success: true,
      employeeNumber: EMPLOYEE_NUMBER,
      recordCount: records.length,
      records,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return response({
      error: timedOut
        ? "VSP HR request timed out."
        : error instanceof Error ? error.message : "Unable to read VSP HR business trips.",
    }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
});
