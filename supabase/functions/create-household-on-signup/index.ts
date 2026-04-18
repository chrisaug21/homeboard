import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const defaultDisplaySettings = {
  screen_order: ["calendar", "todos", "meal_plan", "countdowns"],
  calendar_view: "week",
  active_screens: ["calendar", "todos", "meal_plan", "countdowns"],
  timer_interval: 30,
};

type JwtPayload = {
  sub?: string;
  email?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const decoded = atob(normalized + padding);
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeJwtFromHeader(authorizationHeader: string | null): JwtPayload | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  const segments = token.split(".");

  if (segments.length !== 3 || !segments[1]) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(segments[1]));
    return typeof payload === "object" && payload ? payload : null;
  } catch (_error) {
    return null;
  }
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

  const jwtPayload = decodeJwtFromHeader(request.headers.get("Authorization"));
  const userId = jwtPayload?.sub?.trim();
  const email = jwtPayload?.email?.trim();

  if (!userId || !email || !isUuid(userId)) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let requestBody: { display_name?: unknown };

  try {
    requestBody = await request.json();
  } catch (_error) {
    return jsonResponse(400, { error: "display_name is required" });
  }

  const displayName = typeof requestBody.display_name === "string"
    ? requestBody.display_name.trim()
    : "";

  if (!displayName) {
    return jsonResponse(400, { error: "display_name is required" });
  }

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
    return jsonResponse(500, { error: "Something went wrong creating your household." });
  }

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .insert({
      household_id: household.id,
      display_name: displayName,
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
    return jsonResponse(500, { error: "Something went wrong creating your household." });
  }

  return jsonResponse(200, {
    household_id: household.id,
    member_id: member.id,
  });
});
