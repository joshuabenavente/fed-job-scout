// tailor: write a tailored two-page resume draft for one job, for the signed-in user.
// Enforces the monthly draft cap, calls Claude, saves the draft, returns it.
//
// Secrets: ANTHROPIC_API_KEY (plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, provided automatically)
import { createClient } from "jsr:@supabase/supabase-js@2";

const MONTHLY_CAP = 15;
const MODEL = "claude-sonnet-5-5";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `You tailor a federal job applicant's resume to one specific USAJOBS announcement, and give them an honest assessment.

Hard rules:
1. NEVER invent experience, titles, dates, numbers, certifications, or accomplishments. Only reorder, reword,
   condense, and emphasize what is in the base resume. Do not strengthen a claim beyond what the source supports
   (e.g. never turn "assisted with" into "led" or "managed"). The applicant certifies questionnaire answers that
   this resume must support.
2. The resume must fit on TWO pages (USAJOBS enforces a two-page limit). Use about 950-1,000 words, never more
   than 1,000. Fill the space with the most relevant real experience. Cut the least relevant material first.
3. Keep every job's title, employer, location, dates, grade, and hours per week exactly as given.
4. Mirror the announcement's wording for duties and specialized experience wherever the applicant's real
   experience genuinely matches it.
5. Plain text, no tables or graphics.

Resume text format: "# " for section headings, "## " for each job's title line, a plain line under it for
employer | dates | hours, "- " for bullets, plain lines for anything else. Put the name and contact lines first.

Assessment:
- checklist: go through the announcement's specialized experience / qualification requirements (and key duties)
  one by one. status "shown" = the resume clearly demonstrates it (cite where); "thin" = present but weak or
  without a concrete example; "missing" = not in the resume. Be honest; do not mark things "shown" generously.
- changes: the most meaningful rewrites, each with the original base-resume wording and the new wording, so the
  applicant can confirm nothing was overstated. Up to 12.
- suggestions: what real experience they could add to strengthen the application, phrased as
  "If you have done X, add ...". Never assume they have it.
- cut: notable material removed to fit two pages.
Always respond by calling the save_draft tool.`;

const TOOL = {
  name: "save_draft",
  description: "Save the tailored resume and the honest assessment.",
  input_schema: {
    type: "object",
    properties: {
      resume: { type: "string", description: "The full tailored resume in the specified text format." },
      checklist: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string" },
            status: { type: "string", enum: ["shown", "thin", "missing"] },
            evidence: { type: "string", description: "Where the resume shows it, or what is lacking." },
          },
          required: ["requirement", "status", "evidence"],
        },
      },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: { original: { type: "string" }, revised: { type: "string" } },
          required: ["original", "revised"],
        },
      },
      suggestions: { type: "array", items: { type: "string" } },
      cut: { type: "array", items: { type: "string" } },
    },
    required: ["resume", "checklist", "changes", "suggestions", "cut"],
  },
};

function monthStartDenver(): string {
  // First day of the current month in America/Denver, as an ISO timestamp
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit" })
    .formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  // Denver is UTC-7 or UTC-6; using -07:00 can be up to an hour early in summer, which is harmless for a cap
  return new Date(`${y}-${m}-01T00:00:00-07:00`).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !u?.user) return json({ error: "Not signed in" }, 401);
    const userId = u.user.id;

    const { job_id } = await req.json().catch(() => ({}));
    if (!job_id) return json({ error: "Missing job_id" }, 400);

    // Monthly cap
    const { count } = await admin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "draft")
      .gte("created_at", monthStartDenver());
    if ((count ?? 0) >= MONTHLY_CAP) {
      return json({ error: `You've used your ${MONTHLY_CAP} drafts this month. It resets on the 1st.` }, 429);
    }

    const [{ data: resume }, { data: job }] = await Promise.all([
      admin.from("resumes").select("resume_text").eq("user_id", userId).maybeSingle(),
      admin.from("jobs").select("*").eq("id", String(job_id)).maybeSingle(),
    ]);
    if (!resume?.resume_text) return json({ error: "Add your base resume first (Resume tab)." }, 400);
    if (!job) return json({ error: "That job isn't in the app yet. Run a search first." }, 404);

    const d = job.details ?? {};
    const announcement = [
      `TITLE: ${job.title} (${job.grade ?? ""})`,
      `AGENCY: ${job.org ?? ""}`,
      `LOCATION: ${job.location ?? ""}`,
      `SUMMARY:\n${d.summary ?? ""}`,
      `DUTIES:\n${d.duties ?? ""}`,
      `QUALIFICATIONS / SPECIALIZED EXPERIENCE:\n${d.qualifications ?? ""}`,
      `EDUCATION:\n${d.education ?? ""}`,
      `HOW YOU WILL BE EVALUATED:\n${d.evaluations ?? ""}`,
      `REQUIREMENTS:\n${d.requirements ?? ""}`,
    ].join("\n\n");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "auto" },
        messages: [{
          role: "user",
          content: `<announcement>\n${announcement}\n</announcement>\n\n<base_resume>\n${resume.resume_text}\n</base_resume>`,
        }],
      }),
    });
    if (!r.ok) {
      const raw = await r.text();
      let detail = raw.slice(0, 300);
      try { detail = JSON.parse(raw)?.error?.message ?? detail; } catch (_) { /* keep raw */ }
      console.error("Claude API error", r.status, detail);
      return json({ error: `The drafting service returned an error (${r.status}): ${detail}` }, 502);
    }
    const out = await r.json();
    const call = (out.content ?? []).find((b: any) => b.type === "tool_use" && b.name === "save_draft");
    if (!call?.input?.resume) {
      const kinds = (out.content ?? []).map((b: any) => b.type).join(",");
      console.error("No save_draft call", out.stop_reason, kinds);
      return json({ error: `The draft came back incomplete (${out.stop_reason}; ${kinds}). Try again.` }, 502);
    }
    const draft = call.input;

    // Count it, then save it
    await admin.from("usage_events").insert({ user_id: userId, kind: "draft" });
    const { data: saved, error: saveErr } = await admin
      .from("drafts")
      .insert({
        user_id: userId,
        job_id: String(job_id),
        resume_text: draft.resume,
        checklist: draft.checklist,
        changes: draft.changes,
        suggestions: { add: draft.suggestions, cut: draft.cut },
      })
      .select("*")
      .single();
    if (saveErr) throw saveErr;

    return json({ ok: true, draft: saved, used_this_month: (count ?? 0) + 1, cap: MONTHLY_CAP });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
