// Admin-facing Google Calendar connection management.
// Every action here requires a verified, authenticated admin (see requireAdmin).
// This function never returns a Google token to the caller — only connection
// status, the calendar list, and simple settings.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ALLOWED_RETURN_ORIGINS,
  CORS_HEADERS,
  GOOGLE_CALENDAR_LIST_URL,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_URL,
  GOOGLE_REVOKE_URL,
  getServiceRoleClient,
  jsonResponse,
  requireAdmin,
  signState,
} from "./gcal-shared.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;

async function refreshAccessToken(refreshToken: string): Promise<
  { ok: true; accessToken: string } | { ok: false; invalidGrant: boolean }
> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, invalidGrant: body?.error === "invalid_grant" };
  }

  const json = await response.json();
  return { ok: true, accessToken: json.access_token as string };
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
    if (action === "start") {
      const requestOrigin = req.headers.get("origin") ?? "";
      const returnOrigin = ALLOWED_RETURN_ORIGINS.includes(requestOrigin)
        ? requestOrigin
        : ALLOWED_RETURN_ORIGINS[0];

      const state = await signState({
        householdId: admin.householdId,
        userId: admin.userId,
        returnOrigin,
        nonce: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + 10 * 60,
      });

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        response_type: "code",
        access_type: "offline",
        prompt: "consent select_account",
        include_granted_scopes: "true",
        scope: GOOGLE_SCOPES,
        state,
      });

      return jsonResponse(200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
    }

    if (action === "status") {
      const { data } = await supabaseAdmin
        .from("google_calendar_connections")
        .select("google_account_email, status, selected_calendars, private_events_mode")
        .eq("household_id", admin.householdId)
        .maybeSingle();

      if (!data) {
        return jsonResponse(200, { connected: false });
      }

      return jsonResponse(200, {
        connected: true,
        google_account_email: data.google_account_email,
        status: data.status,
        selected_calendars: data.selected_calendars ?? [],
        private_events_mode: data.private_events_mode ?? "busy",
      });
    }

    if (action === "list_calendars") {
      const { data: connection } = await supabaseAdmin
        .from("google_calendar_connections")
        .select("refresh_token_secret_id")
        .eq("household_id", admin.householdId)
        .maybeSingle();

      if (!connection?.refresh_token_secret_id) {
        return jsonResponse(404, { error: "not_connected" });
      }

      const { data: tokenRow } = await supabaseAdmin.rpc("gcal_read_refresh_token", {
        p_secret_id: connection.refresh_token_secret_id,
      });

      if (!tokenRow) {
        return jsonResponse(404, { error: "not_connected" });
      }

      const refreshed = await refreshAccessToken(tokenRow as string);
      if (!refreshed.ok) {
        if (refreshed.invalidGrant) {
          await supabaseAdmin
            .from("google_calendar_connections")
            .update({ status: "needs_reauth" })
            .eq("household_id", admin.householdId);
        }
        return jsonResponse(409, { error: "needs_reauth" });
      }

      const listResponse = await fetch(`${GOOGLE_CALENDAR_LIST_URL}?minAccessRole=reader`, {
        headers: { Authorization: `Bearer ${refreshed.accessToken}` },
      });

      if (!listResponse.ok) {
        return jsonResponse(502, { error: "Something went wrong loading your calendars. Please try again." });
      }

      const listJson = await listResponse.json();
      const calendars = Array.isArray(listJson.items)
        ? listJson.items.map((cal: Record<string, unknown>) => ({
            id: cal.id,
            summary: cal.summary,
            primary: Boolean(cal.primary),
          }))
        : [];

      return jsonResponse(200, { calendars });
    }

    if (action === "select_calendars") {
      const calendars = Array.isArray(body.calendars) ? body.calendars : null;
      if (!calendars || calendars.length === 0 || calendars.length > 10) {
        return jsonResponse(400, { error: "Pick between 1 and 10 calendars." });
      }

      const normalized = calendars
        .filter((c): c is { id: unknown; summary: unknown } => c && typeof c === "object")
        .map((c) => ({ id: String(c.id ?? "").trim(), summary: String(c.summary ?? "").trim() }))
        .filter((c) => c.id.length > 0);

      if (normalized.length === 0) {
        return jsonResponse(400, { error: "Pick at least one calendar." });
      }

      const { error } = await supabaseAdmin
        .from("google_calendar_connections")
        .update({ selected_calendars: normalized, updated_at: new Date().toISOString() })
        .eq("household_id", admin.householdId);

      if (error) {
        return jsonResponse(500, { error: "Something went wrong saving your changes. Please try again." });
      }

      return jsonResponse(200, { ok: true });
    }

    if (action === "update_settings") {
      const mode = body.private_events_mode;
      if (mode !== "busy" && mode !== "full") {
        return jsonResponse(400, { error: "Invalid setting." });
      }

      const { error } = await supabaseAdmin
        .from("google_calendar_connections")
        .update({ private_events_mode: mode, updated_at: new Date().toISOString() })
        .eq("household_id", admin.householdId);

      if (error) {
        return jsonResponse(500, { error: "Something went wrong saving your changes. Please try again." });
      }

      return jsonResponse(200, { ok: true });
    }

    if (action === "disconnect") {
      const { data: connection } = await supabaseAdmin
        .from("google_calendar_connections")
        .select("refresh_token_secret_id")
        .eq("household_id", admin.householdId)
        .maybeSingle();

      if (connection?.refresh_token_secret_id) {
        const { data: tokenRow } = await supabaseAdmin.rpc("gcal_read_refresh_token", {
          p_secret_id: connection.refresh_token_secret_id,
        });

        if (tokenRow) {
          // Best-effort: also revoke at Google so it disappears from the
          // user's "Third-party access" list, not just from our database.
          // Token goes in the form-encoded body, never the URL — query
          // strings can end up in proxy/access logs.
          await fetch(GOOGLE_REVOKE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: tokenRow as string }),
          }).catch(() => {
            // Best-effort revoke; the local disconnect below still proceeds either way.
          });
        }

        await supabaseAdmin.rpc("gcal_delete_refresh_token", {
          p_secret_id: connection.refresh_token_secret_id,
        });
      }

      await supabaseAdmin
        .from("google_calendar_connections")
        .delete()
        .eq("household_id", admin.householdId);

      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(400, { error: "Unknown action" });
  } catch (_err) {
    return jsonResponse(500, { error: "Something went wrong. Please try again." });
  }
});
