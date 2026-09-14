import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared authorization helpers for internal/report edge functions.
 *
 * Trusted callers:
 *  - Internal edge functions / the Cloud Run worker: Bearer SUPABASE_SERVICE_ROLE_KEY
 *    or WORKER_SECRET, or an `x-internal-secret: WORKER_SECRET` header.
 *  - Signed-in users: valid JWT, and they must own the report run (admins bypass).
 */

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function isInternalCaller(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const workerSecret = Deno.env.get("WORKER_SECRET");
  const token = bearerToken(req);
  const internalHeader = req.headers.get("x-internal-secret")?.trim();

  if (workerSecret && internalHeader && internalHeader === workerSecret) return true;
  if (!token) return false;
  if (serviceKey && token === serviceKey) return true;
  if (workerSecret && token === workerSecret) return true;
  return false;
}

export function internalHeaders(): Record<string, string> {
  const workerSecret = Deno.env.get("WORKER_SECRET") ?? "";
  return workerSecret ? { "x-internal-secret": workerSecret } : {};
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Returns the authenticated user id for a caller JWT, or null. */
export async function getCallerUserId(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || !anonKey) return null;
  // Reject the publishable/anon key itself being used as a "session".
  if (token === anonKey) return null;
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .maybeSingle();
  return Boolean(data);
}

/**
 * Authorize access to a report run: internal secret, the owning user, or an admin.
 * Returns null when authorized, or a Response to return to the caller.
 */
export async function authorizeReportRun(
  req: Request,
  reportRunId: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (isInternalCaller(req)) return null;

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);
  if (await isAdminUser(userId)) return null;

  const { data } = await serviceClient()
    .from("report_runs")
    .select("id, application:applications!inner(user_id)")
    .eq("id", reportRunId)
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const ownerId = (data as any)?.application?.user_id;
  if (!data || ownerId !== userId) return json({ error: "Forbidden" }, 403);
  return null;
}

/** Authorize access to a report row (by report id): internal, owner, or admin. */
export async function authorizeReport(
  req: Request,
  reportId: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (isInternalCaller(req)) return null;

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);
  if (await isAdminUser(userId)) return null;

  const { data } = await serviceClient()
    .from("reports")
    .select("id, user_id")
    .eq("id", reportId)
    .maybeSingle();

  if (!data || data.user_id !== userId) return json({ error: "Forbidden" }, 403);
  return null;
}

/** Block SSRF targets: non-http(s) schemes, localhost, and private/link-local hosts. */
export function isPublicHttpUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) return false;

  // IPv4 private / loopback / link-local / metadata ranges
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // includes 169.254.169.254 metadata
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  // IPv6 unique-local / link-local
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;

  return true;
}
