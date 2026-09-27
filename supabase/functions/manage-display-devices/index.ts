// Admin-facing management of paired wall displays (display_devices).
// Lets an admin see whether a display is currently paired and revoke its
// device token so the running kiosk falls back to the pairing screen on its
// own (see fetchCalendarEventsViaProxy in js/shared.js) — no manual clearing
// of the tablet's browser storage required.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getServiceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Same admin-verification approach as the Google Calendar OAuth functions'
// requireAdmin (see supabase/functions/google-calendar-events/gcal-shared.ts):
// ask Supabase's own auth server to check the session (works regardless of
// JWT signing algorithm), then confirm household admin membership.
async function requireAdmin(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<{ userId: string; householdId: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user?.id) return null;

  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from("users")
    .select("household_id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (userRowError || !userRow?.household_id || userRow.role !== "admin") return null;

  return { userId: userData.user.id, householdId: userRow.household_id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseAdmin = getServiceRoleClient();
  const admin = await requireAdmin(req, supabaseAdmin);
  if (!admin) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid request body" });
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "status") {
      const { data, error } = await supabaseAdmin
        .from("display_devices")
        .select("created_at, last_seen_at")
        .eq("household_id", admin.householdId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse(500, { error: "Something went wrong loading your data. Please try refreshing." });
      }

      const rows = data ?? [];
      if (rows.length === 0) {
        return jsonResponse(200, { paired: false });
      }

      const lastSeenAt = rows.reduce<string | null>((latest, row) => {
        if (!row.last_seen_at) return latest;
        if (!latest || row.last_seen_at > latest) return row.last_seen_at;
        return latest;
      }, null);

      return jsonResponse(200, {
        paired: true,
        pairedAt: rows[0].created_at,
        lastSeenAt,
        deviceCount: rows.length,
      });
    }

    if (action === "unpair") {
      const { data, error } = await supabaseAdmin
        .from("display_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("household_id", admin.householdId)
        .is("revoked_at", null)
        .select("id");

      if (error) {
        return jsonResponse(500, { error: "Something went wrong saving your changes. Please try again." });
      }

      return jsonResponse(200, { ok: true, unpaired: data?.length ?? 0 });
    }

    return jsonResponse(400, { error: "Unknown action" });
  } catch (_err) {
    return jsonResponse(500, { error: "Something went wrong. Please try again." });
  }
});
