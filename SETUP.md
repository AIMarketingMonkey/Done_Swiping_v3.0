# Done Swiping v3.0 — Setup & Deploy

This repo is the **complete codebase**. What's left is the work only you can do:
create the accounts, paste in credentials, run the schema, deploy the functions,
and build. Follow this top-to-bottom. Estimated time: ~60–90 min the first time.

> Architecture and rationale live in `V3_PROVISIONING_RUNBOOK`. This file is the
> hands-on checklist. Agent details are in `agent/`.

---

## 0. Prerequisites

- **Node 20+** and **Git**.
- **Supabase CLI** — `npm i -g supabase` (or `brew install supabase/tap/supabase`).
- Accounts you'll create below: **Supabase**, **ElevenLabs**, **Anthropic**.
- For native builds only: an **Expo/EAS** account, **Apple Developer** ($99/yr),
  **Google Play Console** ($25 once).

```bash
npm install          # install dependencies
cp .env.example .env # then fill in values from Step 1
```

---

## 1. Supabase — the backbone

1. Create **one** project (region **London/Frankfurt, UK/EU**). Save the **Project
   URL**, **anon key**, **service_role key**, and **DB password** somewhere safe.
2. **SQL Editor → New query →** paste all of `supabase/schema.sql` → **Run**. This
   creates the tables, RLS policies, and the auto-profile trigger. (Run once.)
3. **Authentication → Sign In / Providers → Email:** enable Email, and turn
   **OFF "Confirm email"** (MVP).
4. **Authentication → URL Configuration:**
   - **Site URL:** `http://localhost:8081` for dev (swap to your web URL at launch).
   - **Redirect URLs:** add `doneswiping://` (native deep link) and your web URL.
5. Put the public values into `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```

---

## 2. ElevenLabs — the voice agent (the heart)

Full field-by-field guide: **`agent/agent-config.md`**. In short:

1. Create a **Conversational AI agent**.
2. **System prompt:** paste `agent/system-prompt.txt` **verbatim**.
3. **LLM:** Claude (a current Sonnet model — verify the id).
4. **Voice:** pick a warm UK-English voice; note the **voice id**.
5. **First message:** a short warm opener (see agent-config.md).
6. **Tools:** enable **`end_call`**.
7. **Dynamic variables:** accept **`user_id`**.
8. **Data collection:** add every field listed in `agent/agent-config.md`
   (names must match exactly).
9. **Security:** require a **signed URL** (private agent).
10. **Post-call webhook:** set the URL to your deployed
    `…/functions/v1/voice-webhook` (you'll have it after Step 3) and **save the
    webhook secret**.
11. Record the **Agent ID** and an **API key**.

> The Anthropic key is configured **inside ElevenLabs** (as the agent's LLM). It
> does not go in this repo.

---

## 3. Edge Functions — the only backend

From the repo root, with the Supabase CLI:

```bash
supabase login
supabase link --project-ref <PROJECT-REF>

# Server secrets (never in .env / never shipped to the client):
supabase secrets set \
  ELEVENLABS_API_KEY=<your elevenlabs api key> \
  ELEVENLABS_AGENT_ID=<your agent id> \
  ELEVENLABS_WEBHOOK_SECRET=<webhook secret from Step 2.10>

# Deploy. The webhook MUST be public (ElevenLabs has no Supabase JWT):
supabase functions deploy voice-token
supabase functions deploy voice-webhook --no-verify-jwt
```

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
  not set them yourself.
- After deploy, copy the **voice-webhook URL** back into the ElevenLabs post-call
  webhook (Step 2.10) if you hadn't already.

Quick check:
```bash
supabase functions list      # both functions present
```

---

## 4. Run the Web app (primary path)

```bash
npm run web        # opens http://localhost:8081
```

Then walk the **verification checklist** in Step 6. To ship the web build:

```bash
npm run export:web           # outputs dist/
# Deploy dist/ to a static host (Cloudflare Pages free tier, Netlify, etc.)
# Point doneswiping.app at it, then add that URL to Supabase Auth → URL config.
```

> Rebuild the web export whenever you change `EXPO_PUBLIC_*` — env is inlined at
> build time.

---

## 5. Native builds (iOS + Android) — when you're ready

The voice SDK has native modules, so **Expo Go won't work** — you need a dev build.

### 5a. Enable native voice (install the voice stack)

`@elevenlabs/react-native` and its LiveKit/WebRTC peers are intentionally kept out
of `package.json` so the web install stays clean. Add them for native:

```bash
npx expo install @elevenlabs/react-native @livekit/react-native \
  @livekit/react-native-webrtc livekit-client @livekit/react-native-expo-plugin
```

Then add the plugin to `app.json` → `expo.plugins`:
```json
"@livekit/react-native-expo-plugin"
```

> Versions move — follow the **current** `@elevenlabs/react-native` install guide
> if the above drift. `components/voice/voice.native.tsx` already imports the hook.

### 5b. Build with EAS

```bash
npm i -g eas-cli
eas login
eas build:configure                 # writes the EAS project id into app.json → extra.eas.projectId
npx expo prebuild                    # generates native ios/ android/ (gitignored)

eas build -p ios --profile development      # TestFlight / dev client
eas build -p android --profile development  # Play internal testing
# …later…
eas submit -p ios
eas submit -p android
```

iOS mic permission (`NSMicrophoneUsageDescription`) and Android `RECORD_AUDIO` are
already declared in `app.json`.

---

## 6. Verification checklist (runbook §10)

- [ ] Sign up (email + pw + 18✓) → straight to the orb (no email/age-gate/consent/banner).
- [ ] Password **eye toggle** (Show/Hide) works.
- [ ] A `profiles` row exists for the new user (created by the trigger).
- [ ] Start a call → mic prompt → **orb animates to your speech**, distinct pulse
      when the agent talks → natural conversation in the §4 voice.
- [ ] Agent wraps up and **`end_call`** ends the session.
- [ ] Webhook fired → `conversations` row + demographics on `profiles` +
      `profile_facts` + `embeddings` (check in the Supabase Table Editor).
- [ ] Works on **Web** and a **phone dev build** (iOS + Android).
- [ ] Re-login → no 404/406; straight to the orb.

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| App warns about missing Supabase env | `.env` not filled or bundler not restarted. Restart `npm run web`. |
| Sign-up "succeeds" but stuck on auth screen | "Confirm email" is still ON. Turn it OFF (Step 1.3). |
| `voice-token` 401 | Not signed in, or function deployed with the wrong project link. |
| `voice-webhook` "Invalid signature" | `ELEVENLABS_WEBHOOK_SECRET` mismatch, or webhook deployed **with** JWT (must be `--no-verify-jwt`). |
| Webhook runs but no profile data | Data-collection field names in ElevenLabs don't match `agent/agent-config.md`. |
| No `embeddings` rows | `gte-small` only runs on deployed functions, not all local setups — verify on the hosted function. |
| Orb doesn't react to voice | Volume getter names changed in the SDK — see the VERIFY notes in `components/voice/voice.web.tsx`. |
| Native build can't resolve `@elevenlabs/react-native` | Run Step 5a. |

---

## 8. Before public launch (deferred on purpose — runbook §12)

Email verification + custom SMTP · "highly effective" age assurance (UK OSA) ·
AI disclosure (EU AI Act) · data export/delete · payments (Stripe; Apple IAP on iOS).
