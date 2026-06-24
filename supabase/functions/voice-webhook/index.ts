// voice-webhook — public, signature-verified Edge Function.
//
// ElevenLabs calls this after each conversation with the transcript, the
// post-call data-collection results, and the dynamic variables we set at start
// (notably user_id). We verify the HMAC signature, then write:
//   conversations  (one row per call)
//   profiles       (captured demographics + summary)
//   profile_facts  (psychographic insights, upserted on user_id,kind,key)
//   embeddings     (gte-small vectors for matching)
//
// Deploy WITHOUT JWT verification (ElevenLabs has no Supabase JWT):
//   supabase functions deploy voice-webhook --no-verify-jwt
//
// Secrets: ELEVENLABS_WEBHOOK_SECRET
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2';

function ok(body: unknown = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// ── Signature verification (HMAC-SHA256 over `${t}.${rawBody}`) ──────────────
async function verifySignature(secret: string, header: string | null, rawBody: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts['t'];
  const v0 = parts['v0'];
  if (!t || !v0) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`));
  const expected = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, v0);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Helpers for reading the data-collection results ─────────────────────────
function dcValue(dc: Record<string, any> | undefined, key: string): unknown {
  const entry = dc?.[key];
  if (entry == null) return undefined;
  // Results are usually { value, rationale, ... } but tolerate a bare value too.
  return typeof entry === 'object' && 'value' in entry ? entry.value : entry;
}

function asText(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function asInt(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function asList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v)
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'Method not allowed' }, 405);

  const raw = await req.text();
  const secret = Deno.env.get('ELEVENLABS_WEBHOOK_SECRET') ?? '';
  const valid = await verifySignature(secret, req.headers.get('ElevenLabs-Signature'), raw);
  if (!valid) return ok({ error: 'Invalid signature' }, 401);

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return ok({ error: 'Invalid JSON' }, 400);
  }

  const data = payload?.data ?? {};
  const userId: string | undefined = data?.conversation_initiation_client_data?.dynamic_variables?.user_id;
  const elConversationId: string | undefined = data?.conversation_id;

  // Can't attribute the call to a user — ack so ElevenLabs doesn't retry forever.
  if (!userId) return ok({ ok: true, skipped: 'no user_id in dynamic_variables' });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const analysis = data?.analysis ?? {};
    const dc: Record<string, any> = analysis?.data_collection_results ?? {};
    const summary = asText(analysis?.transcript_summary) ?? asText(dcValue(dc, 'summary'));

    // 1) Conversation row (idempotent on el_conversation_id).
    const { data: convo, error: convoErr } = await admin
      .from('conversations')
      .upsert(
        {
          user_id: userId,
          el_conversation_id: elConversationId,
          summary,
          ended_at: new Date().toISOString(),
        },
        { onConflict: 'el_conversation_id' },
      )
      .select('id')
      .single();
    if (convoErr) throw convoErr;
    const conversationId = convo?.id ?? null;

    // 2) Profile demographics + summary (only write fields we actually captured).
    const profilePatch: Record<string, unknown> = { onboarding_complete: true };
    const age = asInt(dcValue(dc, 'age'));
    const heightCm = asInt(dcValue(dc, 'height_cm'));
    const gender = asText(dcValue(dc, 'gender'));
    const location = asText(dcValue(dc, 'location'));
    const seeking = asText(dcValue(dc, 'seeking'));
    const relationshipGoal = asText(dcValue(dc, 'relationship_goal'));
    if (age != null) profilePatch.age = age;
    if (heightCm != null) profilePatch.height_cm = heightCm;
    if (gender) profilePatch.gender = gender;
    if (location) profilePatch.location = location;
    if (seeking) profilePatch.seeking = seeking;
    if (relationshipGoal) profilePatch.relationship_goal = relationshipGoal;
    if (summary) profilePatch.summary = summary;

    const { error: profErr } = await admin.from('profiles').update(profilePatch).eq('user_id', userId);
    if (profErr) throw profErr;

    // 3) Psychographic facts -> upsert on (user_id, kind, key).
    const facts: Array<Record<string, unknown>> = [];
    const pushFact = (kind: string, key: string, value: string) => {
      const k = key.trim().toLowerCase().slice(0, 200);
      const val = value.trim();
      if (k && val) facts.push({ user_id: userId, kind, key: k, value: val, source_conversation_id: conversationId });
    };

    // Scalar traits.
    const scalarTraits = [
      'communication_style',
      'lifestyle',
      'social_energy',
      'humour',
      'family_priorities',
      'career_ambitions',
      'emotional_availability',
      'conflict_style',
      'attraction_preferences',
      'partner_preferences',
      'relationship_readiness',
      'relationship_goal',
    ];
    for (const key of scalarTraits) {
      const v = asText(dcValue(dc, key));
      if (v) pushFact('trait', key, v);
    }

    // List facts.
    for (const v of asList(dcValue(dc, 'values'))) pushFact('value', v, v);
    for (const v of asList(dcValue(dc, 'dealbreakers'))) pushFact('dealbreaker', v, v);
    for (const v of asList(dcValue(dc, 'interests'))) pushFact('interest', v, v);

    if (facts.length) {
      const { error: factErr } = await admin
        .from('profile_facts')
        .upsert(facts, { onConflict: 'user_id,kind,key' });
      if (factErr) throw factErr;
    }

    // 4) Embeddings for matching (Supabase built-in gte-small, 384-dim).
    await writeEmbeddings(admin, userId, {
      summary,
      values: asList(dcValue(dc, 'values')).join(', '),
      goals: [relationshipGoal, seeking, asText(dcValue(dc, 'relationship_readiness'))]
        .filter(Boolean)
        .join('. '),
    });

    return ok({ ok: true });
  } catch (e) {
    // Return 500 so ElevenLabs retries transient failures.
    return ok({ error: 'Processing failed', detail: String(e) }, 500);
  }
});

async function writeEmbeddings(
  admin: ReturnType<typeof createClient>,
  userId: string,
  texts: { summary?: string; values?: string; goals?: string },
) {
  // The embeddings model is a global in the Supabase Edge runtime. If it isn't
  // available (e.g. local dev without the model), skip rather than fail the call.
  const ai = (globalThis as any).Supabase?.ai;
  if (!ai) return;

  const entries = Object.entries(texts).filter(([, text]) => text && text.trim().length > 0) as Array<
    [string, string]
  >;
  if (!entries.length) return;

  const model = new ai.Session('gte-small');
  const rows: Array<Record<string, unknown>> = [];
  for (const [kind, content] of entries) {
    const embedding = await model.run(content, { mean_pool: true, normalize: true });
    rows.push({ user_id: userId, kind, content, embedding });
  }

  // Replace this user's vectors so re-runs don't accumulate duplicates.
  await admin.from('embeddings').delete().eq('user_id', userId);
  if (rows.length) await admin.from('embeddings').insert(rows);
}
