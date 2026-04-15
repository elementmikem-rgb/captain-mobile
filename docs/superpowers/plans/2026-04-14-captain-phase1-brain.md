# Captain Phase 1: The Brain — Memory, Model Router, Conversation Intelligence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Captain from a stateless Claude Haiku wrapper into an intelligent assistant with persistent memory, conversation history, model routing (local Gemma + Claude cloud), and ElevenLabs voice output.

**Architecture:** Backend on Callova (Railway) gets a new Captain module with SQLite memory tables, a model router that tries local Ollama first then falls back to Claude, and conversation context injection. Mobile app gets ElevenLabs voice output and a voice selector in Settings.

**Tech Stack:** Express.js (existing Callova server), better-sqlite3 (existing), Anthropic SDK (existing), Ollama REST API, ElevenLabs API, Expo Push Notifications, Picovoice Porcupine (wake word)

---

## File Structure

### Backend (C:\callova\src\)

| File | Responsibility |
|------|---------------|
| `src/captain/memory.js` | CREATE — SQLite tables (identity, conversations, world_state), read/write/search memory |
| `src/captain/router.js` | CREATE — Model router: check Ollama availability, pick model, call AI, return response |
| `src/captain/personality.js` | CREATE — Build system prompt from identity memory + personality traits |
| `src/captain/context.js` | CREATE — Assemble conversation context: recent messages, world state, identity |
| `src/captain/workers.js` | CREATE — Background data refresh for Callova metrics |
| `src/routes/captain.js` | MODIFY — Enhanced chat endpoint with memory + context + router, new voice endpoints |
| `src/server.js` | MODIFY — Wire up background workers on startup |

### Mobile App (C:\Users\Mike\captain-mobile\)

| File | Responsibility |
|------|---------------|
| `services/voice.js` | MODIFY — Replace Expo TTS with ElevenLabs streaming |
| `services/api.js` | MODIFY — Add voice list/preview endpoints, send history |
| `screens/SettingsScreen.js` | MODIFY — Add voice selector with preview |
| `screens/ChatScreen.js` | MODIFY — Send conversation history with requests |

---

### Task 1: Captain Memory Database

**Files:**
- Create: `src/captain/memory.js`

- [ ] **Step 1: Create the captain directory**

```bash
mkdir -p src/captain
```

- [ ] **Step 2: Create memory.js with SQLite tables and CRUD functions**

```js
// src/captain/memory.js
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS captain_identity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    learned_from TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(category, key)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS captain_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    feedback INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS captain_world_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    data TEXT NOT NULL,
    refreshed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source, category)
  )
`);

function getIdentity() {
  return db.prepare('SELECT category, key, value FROM captain_identity ORDER BY category').all();
}

function setIdentity(category, key, value, learnedFrom) {
  db.prepare(`
    INSERT INTO captain_identity (category, key, value, learned_from, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(category, key) DO UPDATE SET value = excluded.value, learned_from = excluded.learned_from, updated_at = datetime('now')
  `).run(category, key, value, learnedFrom || 'conversation');
}

function getRecentConversations(limit = 20) {
  return db.prepare('SELECT role, content, model_used, created_at FROM captain_conversations ORDER BY id DESC LIMIT ?').all(limit).reverse();
}

function addConversation(role, content, modelUsed) {
  return db.prepare('INSERT INTO captain_conversations (role, content, model_used) VALUES (?, ?, ?)').run(role, content, modelUsed || null);
}

function recordFeedback(conversationId, helpful) {
  db.prepare('UPDATE captain_conversations SET feedback = ? WHERE id = ?').run(helpful ? 1 : 0, conversationId);
}

function getWorldState() {
  return db.prepare('SELECT source, category, data, refreshed_at FROM captain_world_state').all();
}

function setWorldState(source, category, data) {
  db.prepare(`
    INSERT INTO captain_world_state (source, category, data, refreshed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(source, category) DO UPDATE SET data = excluded.data, refreshed_at = datetime('now')
  `).run(source, category, JSON.stringify(data));
}

function getConversationCount() {
  return db.prepare('SELECT COUNT(*) as count FROM captain_conversations').get().count;
}

function searchConversations(query, limit = 10) {
  return db.prepare('SELECT role, content, model_used, created_at FROM captain_conversations WHERE content LIKE ? ORDER BY id DESC LIMIT ?')
    .all(`%${query}%`, limit);
}

module.exports = {
  getIdentity, setIdentity,
  getRecentConversations, addConversation, recordFeedback,
  getWorldState, setWorldState,
  getConversationCount, searchConversations,
};
```

- [ ] **Step 3: Verify the module loads without errors**

```bash
cd /c/callova && node -e "const m = require('./src/captain/memory'); console.log('Memory module loaded:', Object.keys(m))"
```

Expected: prints all exported function names without errors.

- [ ] **Step 4: Seed Mike's identity**

```bash
cd /c/callova && node -e "
const m = require('./src/captain/memory');
m.setIdentity('personal', 'name', 'Mike', 'initial_setup');
m.setIdentity('personal', 'location', 'Kelowna, BC, Canada', 'initial_setup');
m.setIdentity('work', 'primary_business', 'Callova - AI receptionist SaaS for small businesses', 'initial_setup');
m.setIdentity('work', 'secondary_project', 'WheelBot - AI options trading system', 'initial_setup');
m.setIdentity('work', 'side_project', '10-Year Shortcut - online course', 'initial_setup');
m.setIdentity('preferences', 'communication_style', 'Direct, concise, no fluff. No emojis.', 'initial_setup');
m.setIdentity('preferences', 'work_style', 'Solo founder, builds fast, wants things done right the first time', 'initial_setup');
console.log('Identity seeded:', m.getIdentity().length, 'entries');
"
```

Expected: `Identity seeded: 7 entries`

- [ ] **Step 5: Commit**

```bash
git add src/captain/memory.js
git commit -m "feat(captain): add memory database with identity, conversations, and world state tables"
```

---

### Task 2: Model Router

**Files:**
- Create: `src/captain/router.js`

- [ ] **Step 1: Create router.js with Ollama + Claude routing**

```js
// src/captain/router.js

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
let ollamaAvailable = false;
let lastOllamaCheck = 0;
const CHECK_INTERVAL = 60000;

async function checkOllama() {
  if (Date.now() - lastOllamaCheck < CHECK_INTERVAL) return ollamaAvailable;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }
  lastOllamaCheck = Date.now();
  return ollamaAvailable;
}

function classifyComplexity(message) {
  const lower = message.toLowerCase();
  const deepPatterns = [
    /\b(deep dive|thorough|comprehensive|in.?depth)\b/,
    /\b(architecture|system design|long.?term)\b/,
  ];
  const complexPatterns = [
    /\b(plan|architect|design|strategy|analyze|compare|debug|refactor)\b/,
    /\b(should i|what if|pros and cons|trade.?offs?)\b/,
    /\b(code|deploy|build|fix|implement)\b/,
  ];
  if (deepPatterns.some(p => p.test(lower))) return 'deep';
  if (complexPatterns.some(p => p.test(lower))) return 'complex';
  return 'simple';
}

function pickModel(complexity, ollamaUp) {
  if (complexity === 'deep') return { provider: 'claude', model: 'claude-opus-4-6', label: 'Claude Opus' };
  if (complexity === 'complex') {
    if (ollamaUp) return { provider: 'ollama', model: 'gemma4:e4b', label: 'Gemma 4 (8B local)' };
    return { provider: 'claude', model: 'claude-sonnet-4-6', label: 'Claude Sonnet' };
  }
  if (ollamaUp) return { provider: 'ollama', model: 'gemma4:e2b', label: 'Gemma 4 (5B local)' };
  return { provider: 'claude', model: 'claude-haiku-4-5-20251001', label: 'Claude Haiku' };
}

async function callOllama(model, systemPrompt, messages) {
  const ollamaMessages = [{ role: 'system', content: systemPrompt }];
  for (const msg of messages) {
    ollamaMessages.push({ role: msg.role, content: msg.content });
  }
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: ollamaMessages, stream: false }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error('Ollama error: ' + res.status);
  const data = await res.json();
  return data.message?.content || '';
}

async function callClaude(model, systemPrompt, messages) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const maxTokens = model.includes('opus') ? 2048 : model.includes('sonnet') ? 1024 : 512;
  const response = await Promise.race([
    client.messages.create({ model, max_tokens: maxTokens, system: systemPrompt, messages }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
  ]);
  return response.content[0]?.text || '';
}

async function route(systemPrompt, messages, forceModel) {
  const lastMessage = messages[messages.length - 1]?.content || '';
  const complexity = classifyComplexity(lastMessage);
  const ollamaUp = await checkOllama();
  const chosen = forceModel || pickModel(complexity, ollamaUp);

  let text;
  try {
    if (chosen.provider === 'ollama') {
      text = await callOllama(chosen.model, systemPrompt, messages);
    } else {
      text = await callClaude(chosen.model, systemPrompt, messages);
    }
  } catch (e) {
    if (chosen.provider === 'ollama') {
      console.log('[Captain Router] Ollama failed, falling back to Haiku:', e.message);
      const fallback = { provider: 'claude', model: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (fallback)' };
      text = await callClaude(fallback.model, systemPrompt, messages);
      return { text, model: fallback.label, complexity };
    }
    throw e;
  }

  return { text, model: chosen.label, complexity };
}

module.exports = { route, checkOllama, classifyComplexity, pickModel };
```

- [ ] **Step 2: Verify the module loads**

```bash
cd /c/callova && node -e "const r = require('./src/captain/router'); console.log('Router loaded:', Object.keys(r))"
```

Expected: prints exported function names.

- [ ] **Step 3: Test complexity classification**

```bash
cd /c/callova && node -e "
const { classifyComplexity } = require('./src/captain/router');
console.log('simple:', classifyComplexity('whats the weather'));
console.log('complex:', classifyComplexity('should I refactor the auth system'));
console.log('deep:', classifyComplexity('do a deep dive on our architecture'));
"
```

Expected: `simple`, `complex`, `deep`

- [ ] **Step 4: Commit**

```bash
git add src/captain/router.js
git commit -m "feat(captain): add model router with Ollama/Claude routing and complexity classification"
```

---

### Task 3: Personality Builder

**Files:**
- Create: `src/captain/personality.js`

- [ ] **Step 1: Create personality.js that builds system prompts from identity**

```js
// src/captain/personality.js
const { getIdentity, getConversationCount } = require('./memory');

const BASE_PERSONA = `You are Captain, Mike's personal AI assistant. You are direct, slightly witty, and you anticipate his needs. You never use emojis. You keep responses concise -- under 3 sentences for simple questions, longer when depth is needed.

You know Mike personally. You're not a generic chatbot -- you're his assistant who understands his work, his projects, and his priorities. Think 3 steps ahead. If he asks something, consider what he'll need next and offer it proactively.

When you learn something new about Mike (a preference, a habit, a goal), note it naturally in your response so it can be saved.`;

function buildSystemPrompt() {
  const identity = getIdentity();
  const convCount = getConversationCount();

  let prompt = BASE_PERSONA + '\n\n';

  if (identity.length > 0) {
    prompt += '## What you know about Mike\n\n';
    const grouped = {};
    for (const { category, key, value } of identity) {
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push('- ' + key + ': ' + value);
    }
    for (const [cat, items] of Object.entries(grouped)) {
      prompt += '### ' + cat + '\n' + items.join('\n') + '\n\n';
    }
  }

  if (convCount > 0) {
    prompt += 'You have had ' + convCount + ' previous exchanges with Mike. Use conversation history to maintain continuity.\n\n';
  }

  prompt += 'If Mike gives you feedback (thumbs up/down or verbal), adjust your behavior accordingly. Learn what he likes and does not like.\n';
  prompt += 'Always tell Mike which AI model you are using if he asks, but do not volunteer it unprompted.\n';

  return prompt;
}

module.exports = { buildSystemPrompt, BASE_PERSONA };
```

- [ ] **Step 2: Verify it builds a prompt with seeded identity**

```bash
cd /c/callova && node -e "
const { buildSystemPrompt } = require('./src/captain/personality');
const prompt = buildSystemPrompt();
console.log(prompt.substring(0, 500));
console.log('---');
console.log('Total length:', prompt.length, 'chars');
"
```

Expected: Shows base persona + Mike's identity data from Task 1.

- [ ] **Step 3: Commit**

```bash
git add src/captain/personality.js
git commit -m "feat(captain): add personality builder that constructs prompts from identity memory"
```

---

### Task 4: Context Assembler

**Files:**
- Create: `src/captain/context.js`

- [ ] **Step 1: Create context.js that assembles full conversation context**

```js
// src/captain/context.js
const { getRecentConversations, getWorldState } = require('./memory');

function assembleMessages(userMessage, historyLimit = 20) {
  const recent = getRecentConversations(historyLimit);
  const messages = recent.map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

function getWorldContext() {
  const state = getWorldState();
  if (state.length === 0) return '';

  let context = '\n## Current world state\n\n';
  for (const { source, category, data, refreshed_at } of state) {
    try {
      const parsed = JSON.parse(data);
      context += '### ' + source + ' - ' + category + ' (updated ' + refreshed_at + ')\n';
      context += JSON.stringify(parsed, null, 2) + '\n\n';
    } catch {
      context += '### ' + source + ' - ' + category + '\n' + data + '\n\n';
    }
  }
  return context;
}

function buildFullContext(userMessage) {
  const messages = assembleMessages(userMessage);
  const worldContext = getWorldContext();
  return { messages, worldContext };
}

module.exports = { assembleMessages, getWorldContext, buildFullContext };
```

- [ ] **Step 2: Verify it works**

```bash
cd /c/callova && node -e "
const { buildFullContext } = require('./src/captain/context');
const ctx = buildFullContext('How is Callova doing today?');
console.log('Messages:', ctx.messages.length);
console.log('World context length:', ctx.worldContext.length);
"
```

Expected: 1 message (no history yet), 0 world context length (no state yet).

- [ ] **Step 3: Commit**

```bash
git add src/captain/context.js
git commit -m "feat(captain): add context assembler for conversation history and world state"
```

---

### Task 5: Rewrite Captain Route with Full Brain

**Files:**
- Modify: `src/routes/captain.js`

- [ ] **Step 1: Rewrite captain.js to use memory, router, personality, and context**

Replace the entire contents of `src/routes/captain.js` with:

```js
// src/routes/captain.js
const express = require('express');
const router = express.Router();
const memory = require('../captain/memory');
const { route } = require('../captain/router');
const { buildSystemPrompt } = require('../captain/personality');
const { buildFullContext } = require('../captain/context');

const CAPTAIN_API_KEY = process.env.CAPTAIN_API_KEY || 'default-key-change-me';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const startTime = Date.now();

function verifyCaptainKey(req, res, next) {
  if (req.path === '/captain/api/status') return next();
  const key = req.query.key || req.headers['x-api-key'];
  if (key !== CAPTAIN_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.use('/captain', verifyCaptainKey);

router.get('/captain/api/status', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  res.json({ status: 'online', uptime: h + 'h ' + m + 'm', version: '2.0.0' });
});

router.post('/captain/api/chat', express.json(), async (req, res) => {
  try {
    const message = (req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const systemPrompt = buildSystemPrompt();
    const { messages, worldContext } = buildFullContext(message);
    const fullSystemPrompt = systemPrompt + worldContext;

    memory.addConversation('user', message);

    const result = await route(fullSystemPrompt, messages);

    memory.addConversation('assistant', result.text, result.model);

    extractLearnings(message, result.text);

    res.json({
      response: result.text,
      interaction_id: memory.getConversationCount(),
      model_used: result.model,
      complexity: result.complexity,
    });
  } catch (e) {
    console.error('[Captain] Chat error:', e.message);
    if (e.message === 'timeout') {
      return res.status(504).json({ error: 'AI response timed out. Try again.' });
    }
    res.status(500).json({ error: 'Processing failed: ' + e.message });
  }
});

function extractLearnings(userMessage) {
  const lower = userMessage.toLowerCase();
  if (lower.includes('i prefer') || lower.includes('i like') || lower.includes('i hate') || lower.includes("don't")) {
    memory.setIdentity('preferences', 'learned_' + Date.now(), userMessage, 'conversation');
  }
  if (lower.includes('i am') || lower.includes("i'm") || lower.includes('my name')) {
    memory.setIdentity('personal', 'learned_' + Date.now(), userMessage, 'conversation');
  }
}

router.post('/captain/api/feedback', express.json(), (req, res) => {
  const { interaction_id, helpful } = req.body || {};
  if (interaction_id == null || helpful == null) {
    return res.status(400).json({ error: 'interaction_id and helpful are required' });
  }
  memory.recordFeedback(interaction_id, helpful);
  res.json({ success: true });
});

router.get('/captain/api/context', (req, res) => {
  const identity = memory.getIdentity();
  const conversations = memory.getConversationCount();
  const worldState = memory.getWorldState();
  res.json({
    identity_entries: identity.length,
    conversation_count: conversations,
    world_state_sources: worldState.length,
  });
});

router.get('/captain/api/voices', async (req, res) => {
  if (!ELEVENLABS_API_KEY) return res.json({ voices: [], error: 'ElevenLabs not configured' });
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });
    const data = await response.json();
    const voices = (data.voices || []).map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      preview_url: v.preview_url,
      labels: v.labels || {},
    }));
    res.json({ voices });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch voices: ' + e.message });
  }
});

router.post('/captain/api/tts', express.json(), async (req, res) => {
  const { text, voice_id } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (!ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ElevenLabs not configured' });

  const voiceId = voice_id || process.env.CAPTAIN_DEFAULT_VOICE || 'pFZP5JQG7iQjIQuC4Bku';
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId + '/stream', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    res.set({ 'Content-Type': 'audio/mpeg', 'Transfer-Encoding': 'chunked' });
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
    }
  } catch (e) {
    res.status(500).json({ error: 'TTS failed: ' + e.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Verify the server starts with the new captain routes**

```bash
cd /c/callova && node -e "
try {
  require('./src/routes/captain');
  console.log('Captain routes loaded successfully');
} catch(e) {
  console.error('Failed:', e.message);
}
"
```

Expected: `Captain routes loaded successfully`

- [ ] **Step 3: Commit**

```bash
git add src/routes/captain.js
git commit -m "feat(captain): rewrite chat with memory, model routing, personality, and ElevenLabs TTS"
```

---

### Task 6: Mobile App — ElevenLabs Voice Output

**Files:**
- Modify: `captain-mobile/services/voice.js`
- Modify: `captain-mobile/services/api.js`

- [ ] **Step 1: Add TTS and voice list endpoints to api.js**

Add these two functions at the end of `services/api.js`, before any closing content:

```js
export async function getVoices() {
  const c = await getClient();
  try {
    const response = await c.get('/api/voices');
    return response.data.voices || [];
  } catch {
    return [];
  }
}

export async function getTTS(text, voiceId) {
  const c = await getClient();
  const response = await c.post('/api/tts', { text, voice_id: voiceId }, { responseType: 'arraybuffer' });
  return response.data;
}
```

- [ ] **Step 2: Replace services/voice.js with ElevenLabs + fallback**

Replace the entire contents of `services/voice.js`:

```js
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { getTTS } from './api';

const VOICE_KEY = 'captain_voice_id';
const USE_ELEVENLABS_KEY = 'captain_use_elevenlabs';

export async function requestPermissions() {
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return result.granted;
}

export function startListening() {
  ExpoSpeechRecognitionModule.start({
    lang: 'en-US',
    interimResults: true,
    maxAlternatives: 1,
  });
}

export function stopListening() {
  ExpoSpeechRecognitionModule.stop();
}

let currentSound = null;

export async function speak(text) {
  const useElevenLabs = await AsyncStorage.getItem(USE_ELEVENLABS_KEY);
  if (useElevenLabs === 'false') {
    return speakLocal(text);
  }

  try {
    const voiceId = await AsyncStorage.getItem(VOICE_KEY);
    const audioData = await getTTS(text, voiceId);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(audioData)));
    const uri = 'data:audio/mpeg;base64,' + base64;
    if (currentSound) {
      await currentSound.unloadAsync();
    }
    const { sound } = await Audio.Sound.createAsync({ uri });
    currentSound = sound;
    await sound.playAsync();
    return new Promise((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
          currentSound = null;
          resolve();
        }
      });
    });
  } catch (e) {
    console.log('ElevenLabs TTS failed, falling back to local:', e.message);
    return speakLocal(text);
  }
}

function speakLocal(text) {
  return new Promise((resolve) => {
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.9,
      onDone: resolve,
      onStopped: resolve,
      onError: resolve,
    });
  });
}

export function cancelSpeech() {
  if (currentSound) {
    currentSound.stopAsync().then(() => currentSound.unloadAsync());
    currentSound = null;
  }
  Speech.stop();
}

export { useSpeechRecognitionEvent };
```

- [ ] **Step 3: Add expo-av dependency**

```bash
cd /c/Users/Mike/captain-mobile && npx expo install expo-av
```

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Mike/captain-mobile
git add services/voice.js services/api.js package.json package-lock.json
git commit -m "feat: add ElevenLabs voice output with Expo TTS fallback"
```

---

### Task 7: Mobile App — Voice Selector in Settings

**Files:**
- Modify: `captain-mobile/screens/SettingsScreen.js`

- [ ] **Step 1: Rewrite SettingsScreen.js with voice selector**

Replace the entire contents of `screens/SettingsScreen.js`:

```js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  Alert, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { testConnection, resetClient, getVoices } from '../services/api';

export default function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState('https://callova.live/captain');
  const [apiKey, setApiKey] = useState('default-key-change-me');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('');
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [useElevenLabs, setUseElevenLabs] = useState(true);
  const [previewingId, setPreviewingId] = useState(null);

  useEffect(() => {
    (async () => {
      const url = await AsyncStorage.getItem('captain_api_url');
      const key = await AsyncStorage.getItem('captain_api_key');
      const voice = await AsyncStorage.getItem('captain_voice_id');
      const el = await AsyncStorage.getItem('captain_use_elevenlabs');
      if (url) setApiUrl(url);
      if (key) setApiKey(key);
      if (voice) setSelectedVoice(voice);
      if (el === 'false') setUseElevenLabs(false);
    })();
  }, []);

  const handleSave = async () => {
    try {
      await AsyncStorage.multiSet([
        ['captain_api_url', apiUrl],
        ['captain_api_key', apiKey],
        ['captain_use_elevenlabs', useElevenLabs.toString()],
      ]);
      if (selectedVoice) {
        await AsyncStorage.setItem('captain_voice_id', selectedVoice);
      }
      resetClient();
      Alert.alert('Saved', 'Settings saved.');
    } catch {
      Alert.alert('Error', 'Failed to save settings.');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus('');
    try {
      await AsyncStorage.multiSet([
        ['captain_api_url', apiUrl],
        ['captain_api_key', apiKey],
      ]);
      resetClient();
      const ok = await testConnection();
      setStatus(ok ? 'Connected' : 'Failed');
    } catch {
      setStatus('Failed');
    } finally {
      setTesting(false);
    }
  };

  const loadVoices = async () => {
    setLoadingVoices(true);
    try {
      const v = await getVoices();
      setVoices(v);
      if (v.length === 0) Alert.alert('No Voices', 'ElevenLabs not configured on server.');
    } catch {
      Alert.alert('Error', 'Failed to load voices.');
    } finally {
      setLoadingVoices(false);
    }
  };

  const previewVoice = async (voice) => {
    if (!voice.preview_url) return;
    setPreviewingId(voice.voice_id);
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: voice.preview_url });
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.didJustFinish) { sound.unloadAsync(); setPreviewingId(null); }
      });
    } catch {
      setPreviewingId(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backend</Text>
        <Text style={styles.label}>URL</Text>
        <TextInput style={styles.input} value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} />
        <View style={styles.keyContainer}>
          <Text style={styles.label}>API Key</Text>
          <Pressable onPress={() => setShowApiKey(!showApiKey)} style={styles.toggleBtn}>
            <Text style={styles.toggleText}>{showApiKey ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>
        <TextInput style={styles.input} value={apiKey} onChangeText={setApiKey} secureTextEntry={!showApiKey} autoCapitalize="none" autoCorrect={false} />
        <View style={styles.buttonRow}>
          <Pressable onPress={handleTest} disabled={testing} style={[styles.button, styles.testBtn]}>
            <Text style={styles.buttonText}>{testing ? 'Testing...' : 'Test'}</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={[styles.button, styles.saveBtn]}>
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
        </View>
        {status ? (
          <Text style={[styles.status, status === 'Connected' ? styles.ok : styles.fail]}>
            {status === 'Connected' ? 'Connected' : 'Could not connect'}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Voice</Text>
        <Pressable onPress={() => { setUseElevenLabs(!useElevenLabs); }} style={styles.toggleRow}>
          <Text style={styles.label}>ElevenLabs Voice</Text>
          <View style={[styles.toggle, useElevenLabs && styles.toggleActive]}>
            <Text style={styles.toggleLabel}>{useElevenLabs ? 'ON' : 'OFF'}</Text>
          </View>
        </Pressable>

        {useElevenLabs && (
          <>
            <Pressable onPress={loadVoices} disabled={loadingVoices} style={[styles.button, styles.testBtn, { marginBottom: 12 }]}>
              <Text style={styles.buttonText}>{loadingVoices ? 'Loading...' : 'Browse Voices'}</Text>
            </Pressable>

            {voices.map((v) => (
              <Pressable
                key={v.voice_id}
                onPress={() => setSelectedVoice(v.voice_id)}
                style={[styles.voiceCard, selectedVoice === v.voice_id && styles.voiceCardSelected]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.voiceName}>{v.name}</Text>
                  {v.labels?.accent && <Text style={styles.voiceLabel}>{v.labels.accent} {v.labels.gender || ''}</Text>}
                </View>
                {v.preview_url && (
                  <Pressable onPress={() => previewVoice(v)} style={styles.previewBtn}>
                    <Text style={styles.previewText}>
                      {previewingId === v.voice_id ? 'Playing...' : 'Preview'}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            ))}
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.info}>Captain v2.0.0</Text>
        <Text style={styles.info}>Personal AI Assistant</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#333' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#666' },
  keyContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  toggleBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#e3f2fd', borderRadius: 4 },
  toggleText: { fontSize: 12, color: '#2196F3', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
    fontSize: 14, color: '#333', backgroundColor: '#f9f9f9',
  },
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  testBtn: { backgroundColor: '#2196F3' },
  saveBtn: { backgroundColor: '#4CAF50' },
  buttonText: { color: '#fff', fontWeight: '600' },
  status: { marginTop: 12, fontSize: 14, fontWeight: '600' },
  ok: { color: '#4CAF50' },
  fail: { color: '#f44336' },
  info: { fontSize: 14, color: '#999', marginBottom: 4 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  toggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#ddd' },
  toggleActive: { backgroundColor: '#4CAF50' },
  toggleLabel: { color: '#fff', fontWeight: '600', fontSize: 12 },
  voiceCard: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 8,
  },
  voiceCardSelected: { borderColor: '#2196F3', backgroundColor: '#e3f2fd' },
  voiceName: { fontSize: 14, fontWeight: '600', color: '#333' },
  voiceLabel: { fontSize: 12, color: '#999', marginTop: 2 },
  previewBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f5f5f5', borderRadius: 6 },
  previewText: { fontSize: 12, color: '#2196F3', fontWeight: '600' },
});
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/Mike/captain-mobile
git add screens/SettingsScreen.js
git commit -m "feat: add voice selector with ElevenLabs preview in settings"
```

---

### Task 8: Mobile App — Send Conversation History

**Files:**
- Modify: `captain-mobile/services/api.js`
- Modify: `captain-mobile/screens/ChatScreen.js`

- [ ] **Step 1: Update sendMessage in api.js to accept history**

Replace the existing `sendMessage` function in `services/api.js`:

```js
export async function sendMessage(message, history = []) {
  const c = await getClient();
  try {
    const response = await c.post('/api/chat', { message, context: 'voice', history });
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Check your API key in Settings.');
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. Try again.');
    }
    throw new Error(error.response?.data?.error || 'Could not reach server. Check your connection.');
  }
}
```

- [ ] **Step 2: Update ChatScreen.js to store complexity in messages**

In `ChatScreen.js`, find this block in `handleSend`:
```js
      const captainMsg = {
        id: Date.now() + 1,
        text: data.response,
        isUser: false,
        interactionId: data.interaction_id,
        modelUsed: data.model_used,
      };
```

Replace with:
```js
      const captainMsg = {
        id: Date.now() + 1,
        text: data.response,
        isUser: false,
        interactionId: data.interaction_id,
        modelUsed: data.model_used,
        complexity: data.complexity,
      };
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Mike/captain-mobile
git add services/api.js screens/ChatScreen.js
git commit -m "feat: send conversation history with chat requests, show model complexity"
```

---

### Task 9: Background Worker — Callova Metrics

**Files:**
- Create: `src/captain/workers.js`
- Modify: `src/server.js`

- [ ] **Step 1: Create workers.js that refreshes Callova data into world state**

```js
// src/captain/workers.js
const db = require('../db');
const { setWorldState } = require('./memory');

function refreshCallovaState() {
  try {
    const totalBusinesses = db.prepare('SELECT COUNT(*) as count FROM businesses').get().count;
    const activeBusinesses = db.prepare("SELECT COUNT(*) as count FROM businesses WHERE subscription_status IN ('active', 'trialing')").get().count;

    const recentSignups = db.prepare("SELECT name, owner_name, owner_email, created_at FROM businesses ORDER BY id DESC LIMIT 5").all();

    let totalCalls = 0;
    let recentCalls = [];
    try {
      totalCalls = db.prepare('SELECT COUNT(*) as count FROM call_logs').get().count;
      recentCalls = db.prepare('SELECT * FROM call_logs ORDER BY id DESC LIMIT 5').all();
    } catch {}

    setWorldState('callova', 'metrics', {
      total_businesses: totalBusinesses,
      active_businesses: activeBusinesses,
      total_calls: totalCalls,
    });

    setWorldState('callova', 'recent_signups', recentSignups);
    if (recentCalls.length > 0) {
      setWorldState('callova', 'recent_calls', recentCalls);
    }

    console.log('[Captain Worker] Callova state refreshed');
  } catch (e) {
    console.error('[Captain Worker] Callova refresh failed:', e.message);
  }
}

let refreshInterval = null;

function startWorkers(intervalMs = 15 * 60 * 1000) {
  refreshCallovaState();
  refreshInterval = setInterval(refreshCallovaState, intervalMs);
  console.log('[Captain Worker] Background workers started (interval:', intervalMs / 1000, 's)');
}

function stopWorkers() {
  if (refreshInterval) clearInterval(refreshInterval);
}

module.exports = { startWorkers, stopWorkers, refreshCallovaState };
```

- [ ] **Step 2: Wire workers into server startup**

In `src/server.js`, find the line:
```js
app.use(require('./routes/captain'));
```

Add immediately after it:
```js
require('./captain/workers').startWorkers();
```

- [ ] **Step 3: Verify workers load and pull data**

```bash
cd /c/callova && node -e "
const { refreshCallovaState } = require('./src/captain/workers');
refreshCallovaState();
const { getWorldState } = require('./src/captain/memory');
console.log('World state:', JSON.stringify(getWorldState(), null, 2));
"
```

Expected: Shows Callova metrics and recent signups from the database.

- [ ] **Step 4: Commit**

```bash
cd /c/callova
git add src/captain/workers.js src/server.js
git commit -m "feat(captain): add background worker that refreshes Callova business metrics into world state"
```

---

### Task 10: Deploy and Test End-to-End

- [ ] **Step 1: Set environment variables on Railway**

Required env vars (add via Railway dashboard or CLI):
```
ELEVENLABS_API_KEY=<your-elevenlabs-api-key>
CAPTAIN_DEFAULT_VOICE=<voice-id-for-australian-female>
CAPTAIN_API_KEY=<generate-a-secure-key>
OLLAMA_URL=http://localhost:11434
```

Note: `OLLAMA_URL` will only work when a tunnel is configured (Phase 2). For now Captain will use Claude as the AI backend.

- [ ] **Step 2: Push backend changes to Railway**

```bash
cd /c/callova
git push origin main
```

- [ ] **Step 3: Verify Captain backend is responding**

```bash
curl -s https://callova.live/captain/api/status
```

Expected: `{"status":"online","uptime":"...","version":"2.0.0"}`

- [ ] **Step 4: Test chat with memory**

```bash
curl -s -X POST https://callova.live/captain/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-key>" \
  -d '{"message": "Hey Captain, what do you know about me?"}'
```

Expected: Captain responds referencing Mike's seeded identity (name, location, Callova, etc.)

- [ ] **Step 5: Test conversation continuity**

```bash
curl -s -X POST https://callova.live/captain/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-key>" \
  -d '{"message": "What did I just ask you?"}'
```

Expected: Captain recalls the previous question.

- [ ] **Step 6: Test voice list endpoint**

```bash
curl -s https://callova.live/captain/api/voices -H "X-API-Key: <your-key>"
```

Expected: JSON list of ElevenLabs voices (or empty with error if key not set yet).

- [ ] **Step 7: Build updated mobile APK**

```bash
cd /c/Users/Mike/captain-mobile
EXPO_TOKEN=thdg4Hy9DFUravYl-G-Rk8RwaQvvFbWvshpzp5va npx eas-cli build --platform android --profile preview --non-interactive
```

- [ ] **Step 8: Commit any final adjustments**

```bash
git add -A && git commit -m "chore: phase 1 deploy prep"
```

---

## Future Phases

- **Phase 2:** Google Calendar + Gmail integration, push notifications, morning briefing
- **Phase 3:** Wake word ("Hey Captain") via Picovoice Porcupine, always-on listening
- **Phase 4:** Action executor (deploy, test, restart), code intelligence, Claude Code bridge
- **Phase 5:** Ollama tunnel for local model routing from Railway
