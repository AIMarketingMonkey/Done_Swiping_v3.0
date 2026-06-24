# ElevenLabs Conversational AI — agent configuration

Everything to set up the agent in the ElevenLabs dashboard. Pair this with
`system-prompt.txt` (paste it verbatim as the system prompt).

> The ElevenLabs UI and SDKs move. Treat field names below as the intent and
> confirm the exact labels/ids in the current dashboard at build time.

## Core

| Setting | Value |
|---|---|
| **System prompt** | Paste `agent/system-prompt.txt` verbatim |
| **LLM** | Claude — a current Sonnet model (verify the exact id in the dashboard). If only "Custom LLM" is offered, point it at Anthropic's OpenAI-compatible endpoint with your Anthropic key. |
| **Voice** | A warm, natural UK-English voice. Note the voice id. |
| **First message** | A warm, brief opener — replaces the removed "talking to an AI" banner. e.g. *"Hey, I'm really glad you're here. No forms, no swiping — let's just talk. So, what's been on your mind lately?"* |
| **Language** | English (en) |

## Tools

- Enable the built-in **`end_call`** tool. The system prompt calls it to wrap up
  naturally.

## Dynamic variables

- Accept **`user_id`** (a string). The client passes it into `startSession`
  (sourced from the `voice-token` function), and it flows back to the webhook as
  `data.conversation_initiation_client_data.dynamic_variables.user_id` so we can
  attribute the conversation to the right user.

> Trust note: passing `user_id` from the client is fine for MVP. To make it
> spoof-proof later, use ElevenLabs' **conversation-initiation webhook** to inject
> `user_id` server-side instead. The `voice-webhook` reads the same field either way.

## Security

- **Signed URL / authentication: required** (private agent). The client never holds
  the API key — `voice-token` mints a short-lived signed URL.

## Post-call webhook

- Point the **post-call webhook** at your deployed function:
  `https://<PROJECT-REF>.supabase.co/functions/v1/voice-webhook`
- Save the **webhook secret** → set it as `ELEVENLABS_WEBHOOK_SECRET`
  (see SETUP.md). The function verifies the `ElevenLabs-Signature` HMAC.

## Data collection (post-call structured capture)

These drive the profile. Field **names must match** what `voice-webhook` reads.

### Required demographics
| Field | Type | Notes |
|---|---|---|
| `age` | number | actual age (separate from the 18+ tick) |
| `gender` | string | |
| `height_cm` | number | store in centimetres |
| `location` | string | rough location is fine |
| `seeking` | string | who they want to meet |

### Relationship core
| Field | Type |
|---|---|
| `relationship_goal` | string |
| `relationship_readiness` | string |
| `dealbreakers` | list |

### Psychographic
| Field | Type |
|---|---|
| `values` | list |
| `communication_style` | string |
| `lifestyle` | string |
| `social_energy` | string |
| `humour` | string |
| `family_priorities` | string |
| `career_ambitions` | string |
| `emotional_availability` | string |
| `conflict_style` | string |
| `attraction_preferences` | string |
| `partner_preferences` | string |
| `interests` | list |

### Summary
| Field | Type | Notes |
|---|---|---|
| `summary` | string | one-paragraph read of the person |

> Lists may arrive as a JSON array or a comma/newline-separated string — the
> webhook handles both. Scalar traits become `profile_facts` of kind `trait`;
> `values` → `value`, `dealbreakers` → `dealbreaker`, `interests` → `interest`.
