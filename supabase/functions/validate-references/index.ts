import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MAX_URLS = 15;
const HEAD_TIMEOUT_MS = 2000;
const FIRECRAWL_TIMEOUT_MS = 5000;
const OVERALL_TIMEOUT_MS = 45000;

interface RefValidation {
  url: string;
  status: "verified" | "partially_verified" | "not_verified" | "dead" | "access_restricted";
  reason: string;
  context_snippet?: string;
}

interface ValidationSummary {
  total_refs: number;
  verified: number;
  partially_verified: number;
  not_verified: number;
  dead: number;
  access_restricted: number;
  details: RefValidation[];
}

function extractUrls(html: string): { url: string; surroundingText: string }[] {
  const seen = new Set<string>();
  const results: { url: string; surroundingText: string }[] = [];

  const anchorRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const url = match[1];
    const linkText = match[2].replace(/<[^>]*>/g, "").trim();

    if (!url.startsWith("http") || url.includes("mailto:") || seen.has(url)) continue;

    seen.add(url);

    const start = Math.max(0, match.index - 150);
    const end = Math.min(html.length, match.index + match[0].length + 150);
    const surrounding = html.slice(start, end).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    results.push({ url, surroundingText: `[${linkText}] ${surrounding}` });

    if (results.length >= MAX_URLS) break;
  }

  return results;
}

/** Quick HEAD check to see if URL is reachable at all */
async function checkUrlReachable(url: string): Promise<{ reachable: boolean; statusCode?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    clearTimeout(timeout);
    const ok = resp.status >= 200 && resp.status < 400;
    return { reachable: ok, statusCode: resp.status };
  } catch {
    clearTimeout(timeout);
    return { reachable: false };
  }
}

async function scrapeUrl(url: string, firecrawlApiKey: string): Promise<{ success: boolean; content: string; statusCode?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIRECRAWL_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const status = response.status;
      await response.text(); // consume body
      if (status === 402 || status === 429) {
        return { success: false, content: "rate_limited", statusCode: status };
      }
      return { success: false, content: `HTTP ${status}`, statusCode: status };
    }

    const data = await response.json();
    const markdown = data?.data?.markdown || data?.markdown || "";
    return { success: true, content: markdown.substring(0, 2000), statusCode: 200 };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      return { success: false, content: "timeout" };
    }
    return { success: false, content: error instanceof Error ? error.message : "unknown error" };
  }
}

async function aiValidateReferences(
  refs: { url: string; surroundingText: string; scrapedContent: string }[],
  lovableApiKey: string
): Promise<Record<string, { status: string; reason: string }>> {
  const refDescriptions = refs.map((r, i) =>
    `REF ${i + 1}:\n  URL: ${r.url}\n  Cited context: "${r.surroundingText.substring(0, 300)}"\n  Page content preview: "${r.scrapedContent.substring(0, 500)}"`
  ).join("\n\n");

  const systemPrompt = `You are a reference validation assistant. For each reference, determine if the URL's actual page content supports the claim made in the report. You must use the tool provided to return structured results.`;
  const userPrompt = `Validate these ${refs.length} references.\n\n${refDescriptions}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "validate_refs",
            description: "Return validation results for each reference.",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      status: { type: "string", enum: ["verified", "partially_verified", "not_verified"] },
                      reason: { type: "string", description: "Brief explanation (max 50 words)" },
                    },
                    required: ["url", "status", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["results"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "validate_refs" } },
      }),
    });

    if (!response.ok) {
      console.error(`AI validation failed: ${response.status}`);
      await response.text();
      return {};
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return {};

    const parsed = JSON.parse(toolCall.function.arguments);
    const resultMap: Record<string, { status: string; reason: string }> = {};
    for (const r of parsed.results || []) {
      resultMap[r.url] = { status: r.status, reason: r.reason };
    }
    return resultMap;
  } catch (error) {
    console.error("AI validation error:", error);
    return {};
  }
}

function patchHtml(html: string, validations: RefValidation[]): string {
  let patched = html;
  const unverified: RefValidation[] = [];

  for (const v of validations) {
    if (v.status === "verified" || v.status === "partially_verified") continue;

    unverified.push(v);

    const escapedUrl = v.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const linkRegex = new RegExp(
      `(<a\\s[^>]*href=["'])${escapedUrl}(["'][^>]*>)([\\s\\S]*?)(</a>)`,
      "gi"
    );

    if (v.status === "dead") {
      // Replace href with # and add strikethrough styling
      patched = patched.replace(linkRegex,
        `$1#$2<span style="text-decoration:line-through;color:#999;">$3</span>$4 <sup style="color:#c0392b;font-size:0.75em;">[Link unavailable]</sup>`
      );
    } else {
      const statusLabel = v.status === "access_restricted"
        ? "Access restricted"
        : "Source not verified";

      patched = patched.replace(linkRegex,
        `$1${v.url}$2$3$4 <sup style="color:#c0392b;font-size:0.75em;">[${statusLabel}]</sup>`
      );
    }
  }

  if (unverified.length > 0) {
    const appendixItems = unverified.map(v => {
      const label = v.status === "dead" ? "Unavailable"
        : v.status === "access_restricted" ? "Access Restricted"
          : "Not Verified";
      const href = v.status === "dead" ? "#" : v.url;
      const style = v.status === "dead" ? ' style="text-decoration:line-through;color:#999;"' : "";
      return `<li><strong>[${label}]</strong> <a href="${href}"${style}>${v.url}</a> — ${v.reason}</li>`;
    }).join("\n");

    const appendixHtml = `
<hr style="margin-top:2em;margin-bottom:1em;">
<h2 style="color:#c0392b;">Unverified References</h2>
<p style="font-size:0.9em;color:#666;">The following references could not be fully verified against their source material. They may be outdated, inaccessible, or not directly supporting the cited claims.</p>
<ol style="font-size:0.9em;">
${appendixItems}
</ol>`;

    const insertPoint = patched.lastIndexOf("</body>");
    if (insertPoint !== -1) {
      patched = patched.slice(0, insertPoint) + appendixHtml + patched.slice(insertPoint);
    } else {
      const htmlEnd = patched.lastIndexOf("</html>");
      if (htmlEnd !== -1) {
        patched = patched.slice(0, htmlEnd) + appendixHtml + patched.slice(htmlEnd);
      } else {
        patched += appendixHtml;
      }
    }
  }

  return patched;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const { report_html, report_run_id, report_id } = await req.json();

    if (!report_html || !report_run_id) {
      return new Response(
        JSON.stringify({ error: "report_html and report_run_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await logMessage(supabase, report_run_id, "info", "Validating references in background...");

    // Phase 1: Extract URLs
    const extractedRefs = extractUrls(report_html);
    await logMessage(supabase, report_run_id, "info", `Found ${extractedRefs.length} unique URLs to validate`);

    if (extractedRefs.length === 0) {
      // Update report with empty validation if report_id provided
      if (report_id) {
        const emptySummary = { total_refs: 0, verified: 0, partially_verified: 0, not_verified: 0, dead: 0, access_restricted: 0, details: [] };
        await updateReportValidation(supabase, report_id, report_html, emptySummary);
      }
      return new Response(
        JSON.stringify({ validated_html: report_html, validation_summary: { total_refs: 0, verified: 0, partially_verified: 0, not_verified: 0, dead: 0, access_restricted: 0, details: [] } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Phase 2: HEAD check reachability first, then scrape reachable ones via Firecrawl
    const headResults = await Promise.all(
      extractedRefs.map(async (ref) => {
        const headCheck = await checkUrlReachable(ref.url);
        return { ...ref, headReachable: headCheck.reachable, headStatus: headCheck.statusCode };
      })
    );

    const reachableRefs = headResults.filter(r => r.headReachable);
    const deadRefs = headResults.filter(r => !r.headReachable);

    await logMessage(supabase, report_run_id, "info", `HEAD check: ${reachableRefs.length} reachable, ${deadRefs.length} dead/unreachable`);

    // Check timeout guard
    const elapsed = () => Date.now() - startTime;
    const hasTime = () => elapsed() < OVERALL_TIMEOUT_MS;

    // Scrape reachable URLs via Firecrawl (only if we have time and key)
    const scrapeResults: { url: string; surroundingText: string; scrapedContent: string; reachable: boolean }[] = [];

    if (firecrawlApiKey && hasTime()) {
      for (let i = 0; i < reachableRefs.length && hasTime(); i += 5) {
        const batch = reachableRefs.slice(i, i + 5);
        const results = await Promise.all(
          batch.map(async (ref) => {
            const result = await scrapeUrl(ref.url, firecrawlApiKey!);
            return {
              url: ref.url,
              surroundingText: ref.surroundingText,
              scrapedContent: result.content,
              reachable: result.success,
            };
          })
        );
        scrapeResults.push(...results);

        if (i + 5 < reachableRefs.length && hasTime()) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    // Add any reachable refs we didn't have time to scrape
    const scrapedUrls = new Set(scrapeResults.map(r => r.url));
    for (const ref of reachableRefs) {
      if (!scrapedUrls.has(ref.url)) {
        scrapeResults.push({ url: ref.url, surroundingText: ref.surroundingText, scrapedContent: "", reachable: true });
      }
    }

    // Phase 3: AI review (only if we have time)
    let aiResults: Record<string, { status: string; reason: string }> = {};
    if (lovableApiKey && hasTime()) {
      const aiCandidates = scrapeResults.filter(r => r.reachable && r.scrapedContent.length > 50);
      if (aiCandidates.length > 0) {
        await logMessage(supabase, report_run_id, "info", `Running AI verification on ${aiCandidates.length} references...`);
        for (let i = 0; i < aiCandidates.length && hasTime(); i += 10) {
          const batch = aiCandidates.slice(i, i + 10);
          const batchResults = await aiValidateReferences(batch, lovableApiKey);
          aiResults = { ...aiResults, ...batchResults };
        }
      }
    }

    // Phase 4: Compile validation results
    const validations: RefValidation[] = [];

    // Dead refs from HEAD check
    for (const ref of deadRefs) {
      const is404 = ref.headStatus === 404;
      const isForbidden = ref.headStatus === 403;
      validations.push({
        url: ref.url,
        status: isForbidden ? "access_restricted" : "dead",
        reason: is404 ? "Page returned 404 (not found)"
          : isForbidden ? "Page behind access restriction (403)"
          : `URL unreachable (status: ${ref.headStatus || "timeout"})`,
      });
    }

    // Scraped refs
    for (const ref of scrapeResults) {
      const aiResult = aiResults[ref.url];
      if (aiResult) {
        validations.push({
          url: ref.url,
          status: aiResult.status as RefValidation["status"],
          reason: aiResult.reason,
          context_snippet: ref.scrapedContent.substring(0, 200),
        });
      } else {
        validations.push({
          url: ref.url,
          status: "partially_verified",
          reason: ref.scrapedContent.length > 50 ? "URL reachable but AI verification skipped" : "URL reachable but content not scraped",
          context_snippet: ref.scrapedContent.substring(0, 200),
        });
      }
    }

    const summary: ValidationSummary = {
      total_refs: validations.length,
      verified: validations.filter(v => v.status === "verified").length,
      partially_verified: validations.filter(v => v.status === "partially_verified").length,
      not_verified: validations.filter(v => v.status === "not_verified").length,
      dead: validations.filter(v => v.status === "dead").length,
      access_restricted: validations.filter(v => v.status === "access_restricted").length,
      details: validations,
    };

    const validatedHtml = patchHtml(report_html, validations);

    const flagged = summary.not_verified + summary.dead;
    await logMessage(supabase, report_run_id, "info",
      `Reference validation complete: ${summary.verified} verified, ${summary.partially_verified} partial, ${flagged} flagged, ${summary.access_restricted} restricted`
    );

    // If report_id provided, update the report in-place
    if (report_id) {
      await updateReportValidation(supabase, report_id, validatedHtml, summary);
      await logMessage(supabase, report_run_id, "info", "Report updated with validated references");
    }

    return new Response(
      JSON.stringify({ validated_html: validatedHtml, validation_summary: summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("validate-references error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function updateReportValidation(supabase: any, reportId: string, validatedHtml: string, summary: ValidationSummary) {
  try {
    await supabase
      .from("reports")
      .update({
        content_json: {
          report_html: validatedHtml,
          validation_summary: summary,
          validated_at: new Date().toISOString(),
        },
      })
      .eq("id", reportId);
  } catch (err) {
    console.error("Failed to update report with validation:", err);
  }
}

// deno-lint-ignore no-explicit-any
async function logMessage(supabase: any, runId: string, level: string, message: string) {
  try {
    await supabase.from("report_logs").insert({
      report_run_id: runId,
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch { /* ignore logging errors */ }
}
