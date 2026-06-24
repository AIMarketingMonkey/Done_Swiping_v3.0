# Done Swiping v3.0

**A dating app with no swiping.** A warm, conversational AI gets to know you by
voice — who you are, what you value, what you want — and builds your whole profile
from the conversation alone. The only thing you ever type is the sign-up form.

> Domain: **doneswiping.app**

## How it works

```
iOS · Android · Web  ──  one Expo (React Native) codebase
   sign-up (email + password-with-eye + 18✓)  →  one animated voice orb
            │  voice-token (signed URL)            │  live voice (WebRTC)
            ▼                                       ▼
   Supabase Edge Functions  ◄── webhook ──  ElevenLabs Conversational AI
   Postgres · Auth · pgvector · gte-small        (STT · turn-taking · Claude · TTS · tools)
```

Backend is just **Supabase + ElevenLabs (Claude inside it)**. No separate API host,
no extra services for embeddings or field extraction.

## Repo layout

| Path | What |
|---|---|
| `app/` | expo-router screens: `(auth)/sign-in`, `index` (the orb) |
| `components/Orb.tsx` | the single animated orb (idle / listening / speaking) |
| `components/voice/` | `voice.web.tsx`, `voice.native.tsx`, `voice.tsx` fallback + shared `VoiceLayout` |
| `lib/` | Supabase client, auth context, edge caller, cross-platform dialog, theme |
| `supabase/schema.sql` | run once in the SQL Editor |
| `supabase/functions/voice-token` | mints an ElevenLabs signed URL (authenticated) |
| `supabase/functions/voice-webhook` | post-call: writes profile, facts, embeddings |
| `agent/` | the exact system prompt + dashboard config for the ElevenLabs agent |
| `SETUP.md` | **start here** — accounts, deploy, run, verify |
| `V3_PROVISIONING_RUNBOOK` | the architecture/spec this build follows |

## Quick start

```bash
npm install
cp .env.example .env     # fill in Supabase URL + anon key (see SETUP.md §1)
npm run web
```

Then follow **[SETUP.md](./SETUP.md)** to provision Supabase, the ElevenLabs agent,
and deploy the two Edge Functions.

## Stack

Expo (React Native) + expo-router · react-native-reanimated · `@elevenlabs/react`
(web) / `@elevenlabs/react-native` (native) · `@supabase/supabase-js` · Supabase
Edge Functions (Deno) · pgvector + built-in `gte-small` embeddings · Claude (via
ElevenLabs).
