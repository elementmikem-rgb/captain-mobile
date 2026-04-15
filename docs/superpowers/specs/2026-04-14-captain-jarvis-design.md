# Captain: Personal AI Assistant (Jarvis)

**Date:** 2026-04-14
**Status:** Approved
**Project:** captain-mobile + captain backend

## Vision

Captain is a personal AI assistant that knows Mike deeply, anticipates his needs, and proactively manages his world. It connects to his calendar, email, and Callova business -- learning over time to become indispensable. Always available via voice ("Hey Captain"), push notifications, and the mobile app.

## Architecture

### On Phone (Captain App - React Native/Expo)

- Wake word detection via Picovoice Porcupine ("Hey Captain", on-device, offline)
- Speech-to-text via Expo Speech Recognition (on-device)
- Voice output via ElevenLabs streaming API (default: Australian female)
- Voice selector in Settings (browse and switch ElevenLabs voices)
- Push notification receiver (Expo Push Notifications)
- Conversation UI with full history
- Settings: backend URL, API key, voice selection, notification preferences, briefing time

### On Railway (Captain Backend)

Runs 24/7 on the existing Callova Railway deployment.

**API Endpoints:**
- `POST /captain/api/chat` -- main conversation endpoint (enhanced with memory + context)
- `GET /captain/api/status` -- health check
- `POST /captain/api/feedback` -- thumbs up/down, stored and used for learning
- `GET /captain/api/context` -- current world state
- `GET /captain/api/briefing` -- generate morning/evening briefing
- `POST /captain/api/action` -- execute whitelisted server actions
- `GET /captain/api/voices` -- list available ElevenLabs voices
- `POST /captain/api/voice/preview` -- preview a voice

**Background Worker:**
- Runs every 15 minutes
- Scans Gmail, Google Calendar, Callova database
- Feeds changes to AI with prompt: "Here's what changed. Is anything worth telling Mike about?"
- Sends push notifications for urgent items
- Sends scheduled briefings at configured times

**Memory Database (SQLite):**

Three tables:

1. `captain_identity` -- permanent facts about Mike (key-value pairs with categories)
   - name, location, businesses, preferences, goals, communication style
   - Updated through conversation ("Mike prefers short answers")

2. `captain_conversations` -- full conversation history
   - message text, timestamp, model used, feedback given
   - Summarized after 24 hours for long-term recall
   - Last 10-20 messages sent as context per request

3. `captain_world_state` -- ephemeral current state
   - today's calendar events, unread important emails, Callova metrics
   - Refreshed every 15 minutes by background worker
   - Replaces stale data on each refresh

**Model Router:**

Decides which model handles each request:

| Model | When | Cost |
|-------|------|------|
| Gemma e2b (local) | Quick triage, yes/no decisions, simple lookups | Free |
| Gemma e4b (local) | Briefings, summaries, standard conversations | Free |
| Claude Haiku | Fallback when PC is off, routine requests | ~$0.001/req |
| Claude Sonnet | Complex reasoning, planning, code analysis | ~$0.01/req |
| Claude Opus | Deep strategic thinking, architecture decisions | ~$0.05/req |

Router logic:
- Check if local Ollama is reachable (ping localhost:11434)
- If yes, route to Gemma by default (e2b for simple, e4b for complex)
- If no, fall back to Haiku
- Escalate to Sonnet when: request involves planning, multi-step reasoning, code analysis, or Gemma's response quality is low
- Escalate to Opus when: request involves strategic decisions, architecture, or deep analysis
- Captain announces model switches: "Let me think harder about this" (Sonnet) / "This needs deep analysis" (Opus)

**Action Executor:**

Whitelisted server commands Captain can run remotely:

- `deploy` -- trigger Callova deployment
- `test` -- run test suite
- `restart` -- restart Callova server
- `status` -- check server/deploy status
- `logs` -- fetch recent logs

Guardrails:
- Only whitelisted commands, no arbitrary execution
- Confirmation step before destructive actions (deploy, restart)
- Full audit log of every action taken
- Rate limited (no more than 1 action per minute)

### On Mike's PC (When Running)

- Ollama with Gemma e2b (5.1B) and e4b (8B)
- Railway backend calls local Ollama via tunnel or direct IP
- Connection method: Cloudflare Tunnel or ngrok (persistent, auto-reconnects)
- Health check every 60 seconds to detect availability
- Graceful fallback to Claude when unreachable

## Push Notifications

### Notification Tiers

1. **Urgent (immediate)**
   - New Callova business signup
   - Email from known important contacts
   - Calendar event in 15 minutes
   - Server down / deploy failure

2. **Briefing (scheduled)**
   - Morning briefing at configured time (default 7am)
   - End-of-day recap (default 8pm)

3. **Insight (when relevant)**
   - "You haven't followed up with that new signup from 2 days ago"
   - "Call volume is up 40% this week"
   - "You have a gap in your schedule this afternoon"

### Learning

Captain tracks which notifications Mike engages with vs dismisses. Over time it learns:
- What's worth interrupting for
- What time of day Mike is receptive
- What categories Mike cares about most
- Stored as preferences in captain_identity

## Data Integrations

### Google Calendar
- OAuth2 connection via Google Calendar API
- Read access: events, schedule, availability
- Refreshed every 15 minutes
- Used for: briefings, proactive reminders, schedule awareness

### Gmail
- OAuth2 connection via Gmail API
- Read access: inbox messages, labels
- Refreshed every 15 minutes
- Used for: important email alerts, briefing summaries, context

### Callova Database
- Direct SQLite queries (same server)
- Signups, call logs, business activity, metrics
- Real-time access (no refresh needed)
- Used for: business updates, signup alerts, performance insights

## Code Intelligence

Captain has three levels of code interaction:

### A) Code Consultant
- Knows the Callova codebase structure from indexed summaries
- Answers questions: "How does the demo pipeline work?" "What endpoint handles signups?"
- Reads files on demand when asked about specific code
- No code editing capability at this level

### B) Action Triggers
- Whitelisted commands (deploy, test, restart, status, logs)
- Confirmation required before execution
- Results reported back via voice/text
- Full audit trail

### C) Claude Code Bridge
- Captain queues tasks: "Start a Claude Code session to fix the signup bug"
- Stores task description in a queue
- When Mike is at his desk, pending tasks are ready to pick up
- Captain can provide context to the Claude Code session

## Voice

### Output (Text-to-Speech)
- ElevenLabs streaming API for low-latency voice synthesis
- Default: Australian female voice
- Voice selector in app settings with preview capability
- Fallback to Expo TTS if ElevenLabs is unreachable

### Input (Speech-to-Text)
- Expo Speech Recognition (on-device, no network required)
- Real-time transcript shown while speaking

### Wake Word
- Picovoice Porcupine SDK
- Custom wake word: "Hey Captain"
- Runs on-device, no network required
- Low battery impact (optimized native detection)
- Configurable: can enable/disable in settings

## Conversation & Personality

### System Prompt (evolves over time)
Base persona: Direct, slightly witty, anticipates needs. Not sycophantic, not robotic. Mirrors Mike's communication style. Australian female personality to match the voice.

### Context Window Per Request
1. System prompt with personality + current identity snapshot
2. Current world state (calendar, emails, Callova metrics)
3. Last 10-20 conversation messages
4. Relevant older conversation summaries (retrieved by semantic similarity)
5. User's message

### Learning Loop
After every interaction, Captain silently updates identity memory:
- Communication preferences ("Mike prefers short answers")
- Behavioral patterns ("Mike checks signups first thing")
- Interests and priorities
- Notification preferences based on engagement

## Cost Estimates

**With local Ollama handling 90% of requests:**
- Claude Haiku fallback: ~$5-10/month
- Sonnet escalation (occasional): ~$10-20/month
- Opus escalation (rare): ~$5-10/month
- ElevenLabs voice: ~$5-22/month
- **Total: ~$25-60/month**

**Without local Ollama (PC off):**
- All traffic on Haiku: ~$30-60/month
- Sonnet/Opus same as above
- **Total: ~$50-90/month**

## Security

- API key authentication for all Captain endpoints
- Google OAuth2 tokens stored encrypted in SQLite
- ElevenLabs API key server-side only
- Action executor whitelisted and rate-limited
- Audit log for all actions and data access
- Push notification tokens stored server-side
- No sensitive data stored on-device beyond conversation cache
