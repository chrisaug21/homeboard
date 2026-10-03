import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Source was previously deployed without being committed; kept here so it
// isn't lost. Changes vs. the deployed v5: codes now come from a
// cryptographically secure RNG instead of Math.random(), and the caller's
// token is verified with auth.getUser() instead of just base64-decoded.

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(length = 4): string {
  // Rejection sampling: discard bytes that would make some characters more
  // likely than others (256 isn't a multiple of CHARSET.length).
  const limit = 256 - (256 % CHARSET.length);
  let code = '';
  while (code.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && code.length < length) {
        code += CHARSET[b % CHARSET.length];
      }
    }
  }
  return code;
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const token = authHeader.slice('Bearer '.length);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the token with Supabase Auth (checks the signature and expiry).
    // Never trust claims decoded from the token ourselves: verify_jwt is off for
    // this project, so nothing else checks it.
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const userId = authData.user.id;

    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('household_id')
      .eq('id', userId)
      .single();

    if (userRowError || !userRow) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const householdId = userRow.household_id;
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from('display_pairings')
      .delete()
      .eq('household_id', householdId);

    const { data, error } = await supabaseAdmin
      .from('display_pairings')
      .insert({ household_id: householdId, code, expires_at: expiresAt })
      .select('id, code, expires_at')
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to create pairing code' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify(data), {
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
