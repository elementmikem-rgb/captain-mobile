import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { testConnection, resetClient } from '../services/api';

export default function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState('http://192.168.1.100:5000');
  const [apiKey, setApiKey] = useState('default-key-change-me');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const url = await AsyncStorage.getItem('captain_api_url');
      const key = await AsyncStorage.getItem('captain_api_key');
      if (url) setApiUrl(url);
      if (key) setApiKey(key);
    })();
  }, []);

  const handleSave = async () => {
    try {
      await AsyncStorage.multiSet([
        ['captain_api_url', apiUrl],
        ['captain_api_key', apiKey],
      ]);
      resetClient();
      Alert.alert('Saved', 'Settings saved successfully.');
    } catch (error) {
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backend Configuration</Text>

        <Text style={styles.label}>Backend URL</Text>
        <TextInput
          style={styles.input}
          placeholder="http://192.168.1.100:5000"
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>API Key</Text>
        <TextInput
          style={styles.input}
          placeholder="your-api-key"
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.buttonRow}>
          <Pressable onPress={handleTest} disabled={testing} style={[styles.button, styles.testBtn]}>
            <Text style={styles.buttonText}>{testing ? 'Testing...' : 'Test Connection'}</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={[styles.button, styles.saveBtn]}>
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
        </View>

        {status ? (
          <Text style={[styles.status, status === 'Connected' ? styles.ok : styles.fail]}>
            {status === 'Connected' ? 'Connected to Captain backend' : 'Could not connect. Check URL and ensure Captain is running.'}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.info}>Captain Voice Assistant v1.0.0</Text>
        <Text style={styles.info}>AI assistant powered by Ollama (gemma4) and Claude</Text>
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
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14,
    backgroundColor: '#f9f9f9',
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
});
