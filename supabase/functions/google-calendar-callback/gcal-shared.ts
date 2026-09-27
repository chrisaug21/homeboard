// Shared helpers for the Google Calendar OAuth edge functions
// (google-calendar-connect, google-calendar-callback, google-calendar-events).
// Deployed as a copy alongside each function's index.ts.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Homeboard runs on one production domain plus local dev. Only these origins
// are ever written into the signed OAuth state or used as a redirect target.
export const ALLOWED_RETURN_ORIGINS = [
  "https://homeboard.chrisaug.com",
  "http://localhost:8888",
];

export function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function getServiceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? "";
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type OAuthState = {
  householdId: string;
  userId: string;
  returnOrigin: string;
  nonce: string;
  exp: number; // unix seconds
};

// Signs a short-lived state payload so google-calendar-callback can trust it
// came from our own "start" step and hasn't been tampered with or replayed
// past its expiry. Not a session token — it only ever carries these five
// fields and is single-use in spirit (checked, then a fresh row is written).
export async function signState(state: OAuthState): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(state));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyState(token: string): Promise<OAuthState | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  try {
    const [payloadPart, signaturePart] = parts;
    const payloadBytes = base64UrlToBytes(payloadPart);
    const signatureBytes = base64UrlToBytes(signaturePart);
    const key = await hmacKey();
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
    if (!valid) return null;

    const state = JSON.parse(new TextDecoder().decode(payloadBytes)) as OAuthState;
    if (
      typeof state.householdId !== "string" ||
      typeof state.userId !== "string" ||
      typeof state.returnOrigin !== "string" ||
      typeof state.exp !== "number" ||
      !ALLOWED_RETURN_ORIGINS.includes(state.returnOrigin)
    ) {
      return null;
    }
    if (state.exp < Math.floor(Date.now() / 1000)) return null;

    return state;
  } catch {
    return null;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type AdminContext = { userId: string; householdId: string };

// Verifies the caller's Supabase session by asking Supabase's own auth server
// to check it (works regardless of the project's JWT signing algorithm),
// then confirms they're an admin of a real household. Returns null on any
// failure — callers should respond 401/403 without leaking which check failed.
export async function requireAdmin(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<AdminContext | null> {
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

// Verifies a paired display's device token (sent as the x-device-token
// header) against the hashed tokens in display_devices. Never accepts a
// household id supplied by the caller directly.
export async function requireDisplayDevice(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<{ householdId: string; deviceId: string } | null> {
  const token = req.headers.get("x-device-token")?.trim();
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabaseAdmin
    .from("display_devices")
    .select("id, household_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;

  supabaseAdmin
    .from("display_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {
      // Fire-and-forget: don't block the caller on this bookkeeping write.
    });

  return { householdId: data.household_id, deviceId: data.id };
}

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
export const GOOGLE_CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");
