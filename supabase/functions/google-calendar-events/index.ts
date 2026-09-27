// Fetches events for the household's connected Google Calendar(s) on behalf
// of either an admin (JWT) or a paired display (device token). Returns the
// same trimmed event shape the old client-side fetchGoogleCalendarEvents()
// returned, so display/admin rendering code doesn't need to change.
//
// Private-events masking happens here, server-side: if the connection's
// private_events_mode is "busy" (the default), any event whose Google
// visibility is "private" or "confidential" has its summary replaced with
// "Busy" and its description/location stripped before it ever leaves this
// function. See CLAUDE.md "Privacy Policy Compliance".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  CORS_HEADERS,
  GOOGLE_TOKEN_URL,
  getServiceRoleClient,
  jsonResponse,
  requireAdmin,
  requireDisplayDevice,
} from "./gcal-shared.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";

type TrimmedEvent = {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: Record<string, string>;
  end: Record<string, string>;
};

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

async function fetchOneCalendar(
  calendarId: string,
  accessToken: string,
  timeMin: string,
  timeMax: string,
  maxResults: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) break; // skip a calendar that errors rather than failing the whole request

    const json = await response.json();
    if (Array.isArray(json.items)) items.push(...json.items);
    pageToken = json.nextPageToken ?? null;
  } while (pageToken);

  return items;
}

function trimEvent(raw: Record<string, unknown>, maskPrivate: boolean): TrimmedEvent {
  const isPrivate = raw.visibility === "private" || raw.visibility === "confidential";
  const shouldMask = maskPrivate && isPrivate;

  return {
    id: String(raw.id ?? ""),
    summary: shouldMask ? "Busy" : String(raw.summary ?? ""),
    description: shouldMask ? undefined : (raw.description as string | undefined),
    location: shouldMask ? undefined : (raw.location as string | undefined),
    start: (raw.start as Record<string, string>) ?? {},
    end: (raw.end as Record<string, string>) ?? {},
  };
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
  const device = admin ? null : await requireDisplayDevice(req, supabaseAdmin);
  const householdId = admin?.householdId ?? device?.householdId;

  if (!householdId) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid request body" });
  }

  const timeMin = typeof body.timeMin === "string" ? body.timeMin : null;
  const timeMax = typeof body.timeMax === "string" ? body.timeMax : null;
  const maxResults = typeof body.maxResults === "string" ? body.maxResults : "250";

  if (!timeMin || !timeMax) {
    return jsonResponse(400, { error: "timeMin and timeMax are required" });
  }

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("google_calendar_connections")
    .select("refresh_token_secret_id, selected_calendars, private_events_mode, status")
    .eq("household_id", householdId)
    .maybeSingle();

  if (connectionError || !connection?.refresh_token_secret_id) {
    return jsonResponse(404, { error: "not_connected" });
  }

  const selectedCalendars = Array.isArray(connection.selected_calendars)
    ? (connection.selected_calendars as Array<{ id: string }>)
    : [];

  if (selectedCalendars.length === 0) {
    return jsonResponse(409, { error: "no_calendars_selected" });
  }

  const { data: refreshToken } = await supabaseAdmin.rpc("gcal_read_refresh_token", {
    p_secret_id: connection.refresh_token_secret_id,
  });

  if (!refreshToken) {
    return jsonResponse(404, { error: "not_connected" });
  }

  const refreshed = await refreshAccessToken(refreshToken as string);
  if (!refreshed.ok) {
    if (refreshed.invalidGrant) {
      await supabaseAdmin
        .from("google_calendar_connections")
        .update({ status: "needs_reauth" })
        .eq("household_id", householdId);
    }
    return jsonResponse(409, { error: "needs_reauth" });
  }

  try {
    const perCalendarResults = await Promise.all(
      selectedCalendars.map((cal) =>
        fetchOneCalendar(cal.id, refreshed.accessToken, timeMin, timeMax, maxResults),
      ),
    );

    const maskPrivate = connection.private_events_mode !== "full";
    const seen = new Set<string>();
    const merged: TrimmedEvent[] = [];

    for (const rawItems of perCalendarResults) {
      for (const raw of rawItems) {
        const id = String(raw.id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(trimEvent(raw, maskPrivate));
      }
    }

    merged.sort((a, b) => {
      const aTime = a.start.dateTime || a.start.date || "";
      const bTime = b.start.dateTime || b.start.date || "";
      return aTime.localeCompare(bTime);
    });

    await supabaseAdmin
      .from("google_calendar_connections")
      .update({ last_success_at: new Date().toISOString() })
      .eq("household_id", householdId);

    return jsonResponse(200, { items: merged });
  } catch (_err) {
    return jsonResponse(502, { error: "Something went wrong loading your calendar. Please try again." });
  }
});
