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

    // Delete the used code
    await supabaseAdmin
      .from('display_pairings')
      .delete()
      .eq('id', data.id);

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
    }

    return new Response(JSON.stringify({
      household_id: data.household_id,
      device_token: deviceError ? null : deviceToken,
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
