import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

let client = null;

async function getClient() {
  if (client) return client;
  const url = await AsyncStorage.getItem('captain_api_url') || 'http://192.168.1.100:5000';
  const key = await AsyncStorage.getItem('captain_api_key') || 'default-key-change-me';
  client = axios.create({
    baseURL: url,
    timeout: 30000,
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
      throw new Error('Request timed out. Is Captain running on your computer?');
    }
    throw new Error(error.response?.data?.error || 'Could not reach Captain backend.');
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
