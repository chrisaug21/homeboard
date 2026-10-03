import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateDeviceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Pairing codes are short (4 characters), so guessing has to be throttled.
// Attempts are logged (timestamp only, no IP) in pairing_attempts and the
// limit is global rather than per-visitor: there are only a handful of
// households and pairing is a rare, one-time action, so a global cap blocks
// brute force without storing anything about who is guessing.
const MAX_FAILED_ATTEMPTS = 20;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const { code } = await req.json();

    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ error: 'Code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const trimmedCode = code.trim().toUpperCase();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Throttle brute-force guessing. Reserve a slot BEFORE looking at the code,
    // then count: concurrent requests all see each other's reservations, so a
    // burst can't slip past the limit the way check-then-record would allow.
    // A reservation is kept when the guess fails and released when it succeeds.
    const jsonHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

    const { data: reservation, error: reserveError } = await supabaseAdmin
      .from('pairing_attempts')
      .insert({})
      .select('id')
      .single();

    if (reserveError || !reservation) {
      // Fail closed: if we can't record the attempt, don't allow the guess.
      console.error('validate-pairing-code: failed to reserve attempt', reserveError);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: jsonHeaders
      });
    }

    const releaseReservation = async () => {
      await supabaseAdmin.from('pairing_attempts').delete().eq('id', reservation.id);
    };

    const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
    const { count: recentAttempts, error: countError } = await supabaseAdmin
      .from('pairing_attempts')
      .select('id', { count: 'exact', head: true })
      .gte('attempted_at', windowStart);

    if (countError) {
      console.error('validate-pairing-code: failed to read attempts', countError);
      await releaseReservation();
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: jsonHeaders
      });
    }

    if ((recentAttempts ?? 0) > MAX_FAILED_ATTEMPTS) {
      // Over the limit: give the slot back so rejected requests don't extend the lockout.
      await releaseReservation();
      return new Response(JSON.stringify({ error: 'Too many attempts. Please wait a few minutes and try again.' }), {
        status: 429,
        headers: { ...jsonHeaders, 'Retry-After': '600' }
      });
    }

    // Housekeeping: keep the table tiny.
    await supabaseAdmin
      .from('pairing_attempts')
      .delete()
      .lt('attempted_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    // Look up the code
    const { data, error } = await supabaseAdmin
      .from('display_pairings')
      .select('id, household_id, expires_at')
      .eq('code', trimmedCode)
      .maybeSingle();

    if (error || !data) {
      return new Response(JSON.stringify({ error: 'Invalid or expired code' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Check expiry in JS
    if (new Date(data.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invalid or expired code' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Consume the code atomically: delete-and-return so two concurrent
    // requests for the same code can't both pass this check and both walk
    // away with a valid device token.
    const { data: consumed, error: consumeError } = await supabaseAdmin
      .from('display_pairings')
      .delete()
      .eq('id', data.id)
      .select('id');

    if (consumeError || !consumed || consumed.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid or expired code' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // The guess was right, so it shouldn't count against the failure limit.
    await releaseReservation();

    // Issue this display its own device token. It's the only credential a
    // paired tablet has, and google-calendar-events requires it to read a
    // private calendar — a household id alone isn't proof of anything, since
    // household ids are readable with just the app's public key. Only the
    // hash is stored; the raw token is returned once and kept on the tablet.
    const deviceToken = generateDeviceToken();
    const tokenHash = await sha256Hex(deviceToken);

    const { error: deviceError } = await supabaseAdmin
      .from('display_devices')
      .insert({ household_id: data.household_id, token_hash: tokenHash });

    if (deviceError) {
      console.error('validate-pairing-code: failed to create display device', deviceError);
      // The pairing code is already consumed above, so don't report success —
      // this display has no device token and can't authenticate for private
      // calendars. Surface a real error so the admin knows to generate a new code.
      return new Response(JSON.stringify({ error: 'Something went wrong pairing this display. Please generate a new code and try again.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({
      household_id: data.household_id,
      device_token: deviceToken,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});
