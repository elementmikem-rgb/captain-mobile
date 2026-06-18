import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

let client = null;

const DEFAULT_URL = 'https://callova.live/captain';

async function getClient() {
  if (client) return client;
  let url = await AsyncStorage.getItem('captain_api_url');
  if (url && url.includes('192.168.')) {
    url = null;
    await AsyncStorage.removeItem('captain_api_url');
  }
  url = url || DEFAULT_URL;
  const key = await AsyncStorage.getItem('captain_api_key') || '';
  client = axios.create({
    baseURL: url,
    timeout: 45000,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': key,
    },
  });
  return client;
}

export function resetClient() {
  client = null;
}

export async function sendMessage(message, opts = {}) {
  const c = await getClient();
  try {
    const response = await c.post('/api/chat', {
      message,
      context: 'voice',
      chatMode: opts.chatMode || null,
      driveMode: opts.driveMode || false,
    });
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

export async function getStatus() {
  const c = await getClient();
  const response = await c.get('/api/status');
  return response.data;
}

export async function sendFeedback(interaction_id, helpful) {
  const c = await getClient();
  const response = await c.post('/api/feedback', { interaction_id, helpful });
  return response.data;
}

export async function getContext() {
  const c = await getClient();
  try {
    const response = await c.get('/api/context');
    return response.data;
  } catch {
    return {};
  }
}

export async function testConnection() {
  try {
    await getStatus();
    return true;
  } catch {
    return false;
  }
}

export async function getBriefing(type = 'morning') {
  const c = await getClient();
  try {
    const response = await c.get('/api/briefing', { params: { type } });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Could not fetch briefing');
  }
}

export async function getDailyBriefingStructured() {
  const c = await getClient();
  try {
    const response = await c.get('/api/briefing/structured');
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Could not fetch structured briefing');
  }
}

export async function registerPushToken(token) {
  const c = await getClient();
  const response = await c.post('/api/push-token', { token });
  return response.data;
}

export async function getHistory(limit = 50) {
  const c = await getClient();
  const response = await c.get('/api/history', { params: { limit } });
  return response.data;
}

export async function sendMessageStream(message, onChunk, onMeta, onDone, opts = {}) {
  let url = await AsyncStorage.getItem('captain_api_url') || DEFAULT_URL;
  if (url.includes('192.168.')) {
    url = DEFAULT_URL;
    await AsyncStorage.removeItem('captain_api_url');
  }
  const key = await AsyncStorage.getItem('captain_api_key') || '';

  const response = await fetch(`${url}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify({
      message,
      chatMode: opts.chatMode || null,
      driveMode: opts.driveMode || false,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Stream failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'text') {
          fullText += data.text;
          onChunk(data.text, fullText);
        } else if (data.type === 'meta') {
          onMeta(data);
        } else if (data.type === 'done') {
          onDone(data.full_text, data);
        }
      } catch {}
    }
  }
  return fullText;
}

export async function getBookingsToday() {
  const c = await getClient();
  const response = await c.get('/api/bookings/today');
  return response.data;
}

export async function getBookingsUpcoming(days = 7) {
  const c = await getClient();
  const response = await c.get('/api/bookings/upcoming', { params: { days } });
  return response.data;
}

export async function addExpense(amount, category, description) {
  const c = await getClient();
  const response = await c.post('/api/expenses', { amount, category, description, date: new Date().toISOString().slice(0, 10) });
  return response.data;
}

export async function getBirthdays() {
  const c = await getClient();
  const response = await c.get('/api/birthdays');
  return response.data;
}

export async function addBookmark(text, source) {
  const c = await getClient();
  const response = await c.post('/api/bookmarks', { text, source: source || 'captain', saved_at: new Date().toISOString() });
  return response.data;
}

export async function getBookmarks() {
  const c = await getClient();
  const response = await c.get('/api/bookmarks');
  return response.data;
}

export async function addDocument(title, content) {
  const c = await getClient();
  const response = await c.post('/api/documents', { title, content });
  return response.data;
}

export async function getDocuments() {
  const c = await getClient();
  const response = await c.get('/api/documents');
  return response.data;
}

export async function getReminders() {
  const c = await getClient();
  const response = await c.get('/api/reminders');
  return response.data;
}

export async function addReminder(text, triggerAt) {
  const c = await getClient();
  const response = await c.post('/api/reminders', { text, trigger_at: triggerAt });
  return response.data;
}

export async function getExpenseSummary() {
  const c = await getClient();
  const response = await c.get('/api/expenses/summary');
  return response.data;
}

export async function getExpenses(from, to) {
  const c = await getClient();
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;
  const response = await c.get('/api/expenses', { params });
  return response.data;
}

export async function searchContacts(q) {
  const c = await getClient();
  const response = await c.get('/api/contacts', { params: { q } });
  return response.data;
}

export async function getContacts() {
  const c = await getClient();
  const response = await c.get('/api/contacts');
  return response.data;
}

export async function addContact(name, phone, notes) {
  const c = await getClient();
  const response = await c.post('/api/contacts', { name, phone, notes: notes || '' });
  return response.data;
}

export async function getMemoryFacts() {
  const c = await getClient();
  const response = await c.get('/api/memory/facts');
  return response.data;
}

export async function getMemories() {
  const c = await getClient();
  const response = await c.get('/api/memory');
  return response.data;
}

export async function addMemory(fact) {
  const c = await getClient();
  const response = await c.post('/api/memory', { fact });
  return response.data;
}

export async function deleteMemory(id) {
  const c = await getClient();
  const response = await c.delete(`/api/memory/${id}`);
  return response.data;
}

export async function addPersonMemory(subject, fact) {
  const c = await getClient();
  const response = await c.post('/api/memory/person', { subject, fact });
  return response.data;
}

export async function getPersonMemories() {
  const c = await getClient();
  const response = await c.get('/api/memory/people');
  return response.data;
}

export async function deleteReminder(id) {
  const c = await getClient();
  const response = await c.delete(`/api/reminders/${id}`);
  return response.data;
}

export async function getWeather(lat, lon) {
  const c = await getClient();
  const params = lat && lon ? { lat, lon } : {};
  const response = await c.get('/api/weather', { params });
  return response.data;
}

export async function getDailySummary() {
  const c = await getClient();
  const date = new Date().toISOString().slice(0, 10);
  const response = await c.get('/api/summary/daily', { params: { date } });
  return response.data;
}

export async function recallMemory(query) {
  const c = await getClient();
  try {
    const response = await c.post('/api/recall', { query });
    return response.data;
  } catch {
    return { summary: '' };
  }
}

export async function summarizeSession(messages) {
  const c = await getClient();
  try {
    const response = await c.post('/api/summarize', { messages });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Summarize failed');
  }
}

export async function generateDraft({ type, recipient, context, tone }) {
  const c = await getClient();
  try {
    const response = await c.post('/api/draft', { type, recipient, context, tone });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Draft generation failed');
  }
}

export async function getFollowups() {
  const c = await getClient();
  const response = await c.get('/api/followups');
  return response.data;
}

export async function addFollowup(text) {
  const c = await getClient();
  const response = await c.post('/api/followups', { text });
  return response.data;
}

export async function deleteFollowup(id) {
  const c = await getClient();
  const response = await c.delete(`/api/followups/${id}`);
  return response.data;
}

export async function getSuggestions(lastAssistantMessage, userMessage) {
  const c = await getClient();
  const response = await c.post('/api/suggestions', { lastAssistantMessage, userMessage });
  return response.data;
}

export async function sendVision(imageBase64, mimeType, prompt) {
  let url = await AsyncStorage.getItem('captain_api_url') || DEFAULT_URL;
  if (url.includes('192.168.')) { url = DEFAULT_URL; }
  const key = await AsyncStorage.getItem('captain_api_key') || '';

  const response = await fetch(`${url}/api/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify({
      image_base64: imageBase64,
      mime_type: mimeType || 'image/jpeg',
      prompt: prompt || "What do you see? Be concise.",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Vision request failed');
  }

  return response.json();
}
