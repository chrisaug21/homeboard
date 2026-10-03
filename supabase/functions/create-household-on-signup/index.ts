import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const defaultDisplaySettings = {
  screen_order: ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns"],
  active_screens: ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns"],
  timer_interval: 30,
  timer_intervals: {
    upcoming_calendar: 30,
    monthly_calendar: 45,
    todos: 30,
    meals: 30,
    countdowns: 10,
  },
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authorizationHeader = request.headers.get("Authorization");
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Unauthorized" });
  }
  const accessToken = authorizationHeader.slice("Bearer ".length).trim();

  let requestBody: { display_name?: unknown; invite_code?: unknown };

  try {
    requestBody = await request.json();
  } catch (_error) {
    return jsonResponse(400, { error: "Invalid request body" });
  }

  const displayName = typeof requestBody.display_name === "string"
    ? requestBody.display_name.trim()
    : "";

  if (!displayName) {
    return jsonResponse(400, { error: "display_name is required" });
  }

  const inviteCode = typeof requestBody.invite_code === "string"
    ? requestBody.invite_code.trim().toUpperCase()
    : "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("create-household-on-signup: missing environment variables");
    return jsonResponse(500, { error: "Something went wrong creating your household." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Verify the token with Supabase Auth (checks the signature and expiry).
  // verify_jwt is off for this project, and the previous version only
  // base64-decoded the token, so a forged token for a known user id was accepted.
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  const userId = authData?.user?.id;
  const email = authData?.user?.email;

  if (authError || !userId || !email || !isUuid(userId)) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const { data: existingUser } = await supabase
    .from("users")
    .select("household_id, member_id")
    .eq("id", userId)
    .maybeSingle();

  if (existingUser?.household_id) {
    return jsonResponse(200, {
      household_id: existingUser.household_id,
      member_id: existingUser.member_id,
    });
  }

  // Invite codes are enforced here, not in the browser. Consume one atomically
  // before creating anything; it's handed back below if setup fails.
  if (!inviteCode) {
    return jsonResponse(400, { error: "invalid_invite_code" });
  }

  const { data: inviteCodeId, error: inviteError } = await supabase.rpc("consume_invite_code", {
    p_code: inviteCode,
  });

  if (inviteError) {
    console.error("create-household-on-signup: failed to consume invite code", inviteError);
    return jsonResponse(500, { error: "Something went wrong creating your household." });
  }

  if (!inviteCodeId) {
    return jsonResponse(400, { error: "invalid_invite_code" });
  }

  // Undo a half-finished setup so a failed signup doesn't burn an invite use
  // or leave orphaned rows behind. Best effort: failures here are only logged.
  const rollback = async (ids: { householdId?: string; memberId?: string }) => {
    // supabase-js doesn't throw on query errors, it returns { error }, so every
    // step's result is checked. One failed step must not stop the later ones.
    const steps: Array<[string, () => PromiseLike<{ error: unknown }>]> = [];
    if (ids.memberId) {
      steps.push(["delete household member", () => supabase.from("household_members").delete().eq("id", ids.memberId!)]);
    }
    if (ids.householdId) {
      steps.push(["delete household", () => supabase.from("households").delete().eq("id", ids.householdId!)]);
    }
    steps.push(["release invite code", () => supabase.rpc("release_invite_code", { p_id: inviteCodeId })]);

    for (const [label, run] of steps) {
      try {
        const { error } = await run();
        if (error) {
          // inviteCodeId is logged so an operator can restore the use count by hand.
          console.error(`create-household-on-signup: rollback step failed (${label})`, { inviteCodeId, ...ids, error });
        }
      } catch (rollbackError) {
        console.error(`create-household-on-signup: rollback step threw (${label})`, { inviteCodeId, ...ids, rollbackError });
      }
    }
  };

  const householdName = `${displayName}'s Household`;

  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({
      name: householdName,
      display_settings: defaultDisplaySettings,
      color_scheme: "warm",
    })
    .select("id")
    .single();

  if (householdError || !household?.id) {
    console.error("create-household-on-signup: failed to create household", {
      userId,
      email,
      householdError,
    });
    await rollback({});
    return jsonResponse(500, { error: "Something went wrong creating your household." });
  }

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .insert({
      household_id: household.id,
      display_name: displayName,
      color: "#2563eb",
    })
    .select("id")
    .single();

  if (memberError || !member?.id) {
    console.error("create-household-on-signup: failed to create household member", {
      userId,
      email,
      householdId: household.id,
      memberError,
    });
    await rollback({ householdId: household.id });
    return jsonResponse(500, { error: "Something went wrong creating your household." });
  }

  const { error: userError } = await supabase
    .from("users")
    .insert({
      id: userId,
      household_id: household.id,
      display_name: displayName,
      role: "admin",
      member_id: member.id,
      preferences: {
        onboarding_complete: false,
      },
    });

  if (userError) {
    console.error("create-household-on-signup: failed to create user row", {
      userId,
      email,
      householdId: household.id,
      memberId: member.id,
      userError,
    });
    await rollback({ householdId: household.id, memberId: member.id });
    return jsonResponse(500, { error: "Something went wrong creating your household." });
  }

  return jsonResponse(200, {
    household_id: household.id,
    member_id: member.id,
  });
});
