// voice-token — authenticated Edge Function.
//
// Flow: verify the caller's Supabase JWT -> ask ElevenLabs for a short-lived
// signed URL for the agent -> return it (plus the user id, which the client
// passes back as a dynamic variable so the post-call webhook can attribute the
// conversation to this user).
//
// Deploy WITH JWT verification (the default):
//   supabase functions deploy voice-token
//
// Secrets used (set via `supabase secrets set`):
//   ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_ANON_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    // Validate the JWT by asking Supabase who this token belongs to.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid or expired session' }, 401);

    const agentId = Deno.env.get('ELEVENLABS_AGENT_ID');
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!agentId || !apiKey) return json({ error: 'Server is missing ElevenLabs configuration' }, 500);

    // VERIFY AT BUILD TIME: the signed-url endpoint shape can change.
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
    const elRes = await fetch(url, { headers: { 'xi-api-key': apiKey } });
    if (!elRes.ok) {
      return json({ error: 'Failed to get a voice session', detail: await elRes.text() }, 502);
    }
    const { signed_url } = await elRes.json();
    if (!signed_url) return json({ error: 'ElevenLabs did not return a signed URL' }, 502);

    return json({ signedUrl: signed_url, userId: user.id });
  } catch (e) {
    return json({ error: 'Unexpected error', detail: String(e) }, 500);
  }
});
