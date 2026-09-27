// Google redirects the admin's browser here after they approve or deny
// calendar access. No JWT on this request — trust comes entirely from the
// signed `state` value minted by google-calendar-connect's "start" action.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ALLOWED_RETURN_ORIGINS,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  getServiceRoleClient,
  verifyState,
} from "./gcal-shared.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;

function redirectTo(origin: string, query: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/admin?${query}` },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") ?? "";
  const googleError = url.searchParams.get("error");

  const state = await verifyState(stateParam);
  const returnOrigin = state?.returnOrigin ?? ALLOWED_RETURN_ORIGINS[0];

  if (googleError) {
    return redirectTo(returnOrigin, `gcal=${googleError === "access_denied" ? "denied" : "error"}`);
  }

  if (!state || !code) {
    return redirectTo(returnOrigin, "gcal=error&reason=invalid_state");
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: CALLBACK_URL,
      }),
    });

    if (!tokenResponse.ok) {
      return redirectTo(returnOrigin, "gcal=error&reason=token_exchange_failed");
    }

    const tokenJson = await tokenResponse.json();
    const refreshToken = tokenJson.refresh_token as string | undefined;
    const accessToken = tokenJson.access_token as string | undefined;

    if (!refreshToken || !accessToken) {
      // Happens if Google didn't grant a refresh token — shouldn't occur with
      // access_type=offline + prompt=consent, but fail safe rather than store
      // a connection we can't actually refresh.
      return redirectTo(returnOrigin, "gcal=error&reason=no_refresh_token");
    }

    let googleAccountEmail = "";
    const userinfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userinfoResponse.ok) {
      const userinfoJson = await userinfoResponse.json();
      googleAccountEmail = typeof userinfoJson.email === "string" ? userinfoJson.email : "";
    }

    const supabaseAdmin = getServiceRoleClient();

    const { data: existingConnection } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("refresh_token_secret_id")
      .eq("household_id", state.householdId)
      .maybeSingle();

    const { data: newSecretId, error: secretError } = await supabaseAdmin.rpc(
      "gcal_store_refresh_token",
      {
        p_token: refreshToken,
        p_name: `gcal_refresh_${state.householdId}_${Date.now()}`,
      },
    );

    if (secretError || !newSecretId) {
      return redirectTo(returnOrigin, "gcal=error&reason=store_failed");
    }

    const { error: upsertError } = await supabaseAdmin
      .from("google_calendar_connections")
      .upsert(
        {
          household_id: state.householdId,
          connected_by_user_id: state.userId,
          google_account_email: googleAccountEmail || null,
          refresh_token_secret_id: newSecretId,
          scopes: typeof tokenJson.scope === "string" ? tokenJson.scope : null,
          status: "active",
          last_success_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "household_id" },
      );

    if (upsertError) {
      await supabaseAdmin.rpc("gcal_delete_refresh_token", { p_secret_id: newSecretId });
      return redirectTo(returnOrigin, "gcal=error&reason=save_failed");
    }

    if (
      existingConnection?.refresh_token_secret_id &&
      existingConnection.refresh_token_secret_id !== newSecretId
    ) {
      await supabaseAdmin.rpc("gcal_delete_refresh_token", {
        p_secret_id: existingConnection.refresh_token_secret_id,
      });
    }

    return redirectTo(returnOrigin, "gcal=connected");
  } catch (_err) {
    return redirectTo(returnOrigin, "gcal=error");
  }
});
