// run-search: query USAJOBS for saved searches and record new matches.
//
// Called two ways:
//   - by a signed-in user from the app ("Search now"): runs only that user's active searches
//   - by the morning scheduler with the service-role key and {"all": true}: runs every active search
//
// Secrets: USAJOBS_API_KEY, USAJOBS_EMAIL (plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, provided automatically)
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Search = {
  id: string;
  user_id: string;
  series: string[];
  grade_low: number;
  grade_high: number;
  agency: string | null;
  locations: string[];
  radius_miles: number;
  include_remote: boolean;
};

const asText = (v: unknown) =>
  Array.isArray(v) ? v.filter(Boolean).map((x) => `- ${x}`).join("\n") : String(v ?? "").trim();

async function usajobs(params: Record<string, string>) {
  const url = "https://data.usajobs.gov/api/search?" + new URLSearchParams({ ResultsPerPage: "500", ...params });
  const r = await fetch(url, {
    headers: {
      "Host": "data.usajobs.gov",
      "User-Agent": Deno.env.get("USAJOBS_EMAIL") ?? "",
      "Authorization-Key": Deno.env.get("USAJOBS_API_KEY") ?? "",
    },
  });
  if (!r.ok) throw new Error(`USAJOBS returned ${r.status}`);
  const data = await r.json();
  return (data?.SearchResult?.SearchResultItems ?? []) as any[];
}

function toJobRow(item: any) {
  const d = item.MatchedObjectDescriptor ?? {};
  const det = d.UserArea?.Details ?? {};
  const pay = d.PositionRemuneration?.[0] ?? {};
  const low = det.LowGrade, high = det.HighGrade;
  const money = (n: unknown) => `$${Math.round(Number(n || 0)).toLocaleString("en-US")}`;
  return {
    id: String(item.MatchedObjectId),
    title: d.PositionTitle ?? null,
    org: d.SubOrganizationName || d.OrganizationName || null,
    grade: low ? `GS-${low}${high && high !== low ? ` to ${high}` : ""}` : null,
    location: d.PositionLocationDisplay ?? null,
    remote: det.RemoteIndicator === true || det.RemoteIndicator === "True",
    pay: pay.MinimumRange ? `${money(pay.MinimumRange)} - ${money(pay.MaximumRange)}` : null,
    closes: d.ApplicationCloseDate ? String(d.ApplicationCloseDate).slice(0, 10) : null,
    url: d.PositionURI ?? null,
    details: {
      summary: asText(det.JobSummary),
      duties: asText(det.MajorDuties),
      qualifications: asText(d.QualificationSummary),
      requirements: asText(det.Requirements),
      evaluations: asText(det.Evaluations),
      education: asText(det.Education),
    },
    fetched_at: new Date().toISOString(),
  };
}

async function runSearch(s: Search) {
  const base: Record<string, string> = {
    PayGradeLow: String(s.grade_low),
    PayGradeHigh: String(s.grade_high),
  };
  if (s.series?.length) base.JobCategoryCode = s.series.join(";");
  if (s.agency) base.Organization = s.agency;

  const found = new Map<string, any>();
  for (const loc of s.locations ?? []) {
    for (const it of await usajobs({ ...base, LocationName: loc, Radius: String(s.radius_miles || 25) })) {
      found.set(String(it.MatchedObjectId), it);
    }
  }
  if (s.include_remote) {
    for (const it of await usajobs({ ...base, RemoteIndicator: "True" })) found.set(String(it.MatchedObjectId), it);
  }
  // A search with no locations and no remote flag searches everywhere
  if (!(s.locations?.length) && !s.include_remote) {
    for (const it of await usajobs(base)) found.set(String(it.MatchedObjectId), it);
  }

  const rows = [...found.values()].map(toJobRow);
  if (rows.length) {
    const { error } = await admin.from("jobs").upsert(rows);
    if (error) throw error;
  }
  // Record matches; existing ones are left alone so first_seen_at keeps its date
  let newCount = 0;
  if (rows.length) {
    const { data, error } = await admin
      .from("search_matches")
      .upsert(rows.map((r) => ({ search_id: s.id, job_id: r.id })), { onConflict: "search_id,job_id", ignoreDuplicates: true })
      .select("job_id");
    if (error) throw error;
    newCount = data?.length ?? 0;
  }
  return { search_id: s.id, user_id: s.user_id, found: rows.length, new: newCount };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({}));

    let query = admin.from("searches").select("*").eq("active", true);
    let isScheduler = false;
    if (token && token === SERVICE_KEY && body?.all === true) {
      isScheduler = true;
    } else {
      const { data: u, error } = await admin.auth.getUser(token);
      if (error || !u?.user) return json({ error: "Not signed in" }, 401);
      query = query.eq("user_id", u.user.id);
      if (body?.search_id) query = query.eq("id", body.search_id);
    }

    const { data: searches, error } = await query;
    if (error) throw error;

    const results = [];
    for (const s of (searches ?? []) as Search[]) results.push(await runSearch(s));

    const totals = {
      searches: results.length,
      jobs_found: results.reduce((a, r) => a + r.found, 0),
      new_matches: results.reduce((a, r) => a + r.new, 0),
    };
    if (isScheduler) {
      await admin.from("run_log").insert({ jobs_found: totals.jobs_found, new_matches: totals.new_matches });
    }
    return json({ ok: true, ...totals, results: isScheduler ? results : results.map(({ user_id, ...r }) => r) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await admin.from("run_log").insert({ error: msg }); } catch (_) { /* ignore */ }
    return json({ ok: false, error: msg }, 500);
  }
});
