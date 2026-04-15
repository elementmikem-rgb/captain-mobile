import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

let client = null;

const DEFAULT_URL = 'https://callova.live/captain';

async function getClient() {
  if (client) return client;
  let url = await AsyncStorage.getItem('captain_api_url');
  // Migration: clear old local IP defaults
  if (url && url.includes('192.168.')) {
    url = null;
    await AsyncStorage.removeItem('captain_api_url');
  }
  url = url || DEFAULT_URL;
  const key = await AsyncStorage.getItem('captain_api_key') || 'Ml2znOnV_iylluaiXn-9Me8JIHVP0eu95yw-V6koqlI';
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

export async function sendMessage(message) {
  const c = await getClient();
  try {
    const response = await c.post('/api/chat', { message, context: 'voice' });
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

export async function sendMessageStream(message, onChunk, onMeta, onDone) {
  let url = await AsyncStorage.getItem('captain_api_url') || DEFAULT_URL;
  if (url.includes('192.168.')) url = DEFAULT_URL;
  const key = await AsyncStorage.getItem('captain_api_key') || 'Ml2znOnV_iylluaiXn-9Me8JIHVP0eu95yw-V6koqlI';

  const response = await fetch(`${url}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify({ message }),
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
