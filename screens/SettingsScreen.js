import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  Switch,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { testConnection, resetClient } from '../services/api';

const SETTINGS_KEY = 'captain_settings';
const DEFAULT_SETTINGS = {
  voiceEnabled: true,
  voiceSpeed: 1.0,
  autoPlayBriefing: true,
  morningBriefingTime: '7:00 AM',
  eveningWrapupTime: '8:00 PM',
  notifyNewBookings: true,
  notifyCancellations: true,
  notifyWeatherAlerts: true,
  notifyBriefings: true,
  doNotDisturb: false,
  dndStart: '10:00 PM',
  dndEnd: '7:00 AM',
};

export default function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState('https://callova.live/captain');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    (async () => {
      const url = await AsyncStorage.getItem('captain_api_url');
      const key = await AsyncStorage.getItem('captain_api_key');
      const saved = await AsyncStorage.getItem(SETTINGS_KEY);
      if (url) setApiUrl(url);
      if (key) setApiKey(key);
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });

      try {
        const baseUrl = url || 'https://callova.live/captain';
        const apiKeyVal = key || 'Ml2znOnV_iylluaiXn-9Me8JIHVP0eu95yw-V6koqlI';
        const res = await fetch(`${baseUrl}/api/auth/google/status`, { headers: { 'X-API-Key': apiKeyVal } });
        const data = await res.json();
        setGoogleConnected(data.connected);
      } catch {}
    })();
  }, []);

  const updateSetting = async (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  };

  const handleSave = async () => {
    try {
      await AsyncStorage.multiSet([
        ['captain_api_url', apiUrl],
        ['captain_api_key', apiKey],
      ]);
      resetClient();
      Alert.alert('Saved', 'Settings updated.');
    } catch {
      Alert.alert('Error', 'Failed to save settings.');
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateStatus('Checking...');
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setUpdateStatus('Up to date');
        setUpdating(false);
        return;
      }
      setUpdateStatus('Downloading...');
      await Updates.fetchUpdateAsync();
      setUpdateStatus('Restarting...');
      await Updates.reloadAsync();
    } catch (e) {
      setUpdateStatus('Failed: ' + e.message);
      setUpdating(false);
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
      setStatus(ok ? 'connected' : 'failed');
    } catch {
      setStatus('failed');
    } finally {
      setTesting(false);
    }
  };

  const handleConnectGoogle = () => {
    const baseUrl = apiUrl || 'https://callova.live/captain';
    Linking.openURL(`${baseUrl}/api/auth/google`);
  };

  const handleClearMemory = () => {
    Alert.alert('Clear Captain Memory', 'This will erase all of Captain\'s learned facts about you. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            const baseUrl = apiUrl || 'https://callova.live/captain';
            const key = apiKey || 'Ml2znOnV_iylluaiXn-9Me8JIHVP0eu95yw-V6koqlI';
            await fetch(`${baseUrl}/api/identity`, {
              method: 'DELETE',
              headers: { 'X-API-Key': key },
            });
            Alert.alert('Done', 'Captain\'s memory has been cleared.');
          } catch {
            Alert.alert('Error', 'Could not clear memory.');
          }
        },
      },
    ]);
  };

  const SettingRow = ({ icon, label, children }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingLeft}>
        <MaterialIcons name={icon} size={18} color="#888" />
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Voice</Text>
        <SettingRow icon="volume-up" label="Speak responses">
          <Switch
            value={settings.voiceEnabled}
            onValueChange={v => updateSetting('voiceEnabled', v)}
            trackColor={{ false: '#1e293b', true: '#6c9cff40' }}
            thumbColor={settings.voiceEnabled ? '#6c9cff' : '#555'}
          />
        </SettingRow>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <SettingRow icon="notification-important" label="New bookings">
          <Switch
            value={settings.notifyNewBookings}
            onValueChange={v => updateSetting('notifyNewBookings', v)}
            trackColor={{ false: '#1e293b', true: '#6c9cff40' }}
            thumbColor={settings.notifyNewBookings ? '#6c9cff' : '#555'}
          />
        </SettingRow>
        <SettingRow icon="cancel" label="Cancellations">
          <Switch
            value={settings.notifyCancellations}
            onValueChange={v => updateSetting('notifyCancellations', v)}
            trackColor={{ false: '#1e293b', true: '#6c9cff40' }}
            thumbColor={settings.notifyCancellations ? '#6c9cff' : '#555'}
          />
        </SettingRow>
        <SettingRow icon="cloud" label="Weather alerts">
          <Switch
            value={settings.notifyWeatherAlerts}
            onValueChange={v => updateSetting('notifyWeatherAlerts', v)}
            trackColor={{ false: '#1e293b', true: '#6c9cff40' }}
            thumbColor={settings.notifyWeatherAlerts ? '#6c9cff' : '#555'}
          />
        </SettingRow>
        <SettingRow icon="wb-sunny" label="Morning/evening briefings">
          <Switch
            value={settings.notifyBriefings}
            onValueChange={v => updateSetting('notifyBriefings', v)}
            trackColor={{ false: '#1e293b', true: '#6c9cff40' }}
            thumbColor={settings.notifyBriefings ? '#6c9cff' : '#555'}
          />
        </SettingRow>
        <SettingRow icon="do-not-disturb" label="Do Not Disturb">
          <Switch
            value={settings.doNotDisturb}
            onValueChange={v => updateSetting('doNotDisturb', v)}
            trackColor={{ false: '#1e293b', true: '#f8717140' }}
            thumbColor={settings.doNotDisturb ? '#f87171' : '#555'}
          />
        </SettingRow>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Integrations</Text>
        <Pressable onPress={handleConnectGoogle} style={styles.integrationBtn}>
          <MaterialIcons name="event" size={18} color={googleConnected ? '#4ade80' : '#888'} />
          <Text style={styles.integrationText}>
            {googleConnected ? 'Google Calendar Connected' : 'Connect Google Calendar & Gmail'}
          </Text>
          <MaterialIcons name={googleConnected ? 'check-circle' : 'chevron-right'} size={18} color={googleConnected ? '#4ade80' : '#555'} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://callova.live/captain"
          placeholderTextColor="#444"
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.keyHeader}>
          <Text style={styles.label}>API Key</Text>
          <Pressable onPress={() => setShowApiKey(!showApiKey)} style={styles.toggleBtn}>
            <MaterialIcons name={showApiKey ? 'visibility-off' : 'visibility'} size={16} color="#6c9cff" />
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Paste your API key"
          placeholderTextColor="#444"
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry={!showApiKey}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.buttonRow}>
          <Pressable onPress={handleTest} disabled={testing} style={styles.testBtn}>
            <MaterialIcons name="wifi-tethering" size={16} color="#6c9cff" />
            <Text style={styles.testText}>{testing ? 'Testing...' : 'Test'}</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={styles.saveBtn}>
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>
        {status ? (
          <View style={[styles.statusBar, status === 'connected' ? styles.statusOk : styles.statusFail]}>
            <MaterialIcons
              name={status === 'connected' ? 'check-circle' : 'error'}
              size={16}
              color={status === 'connected' ? '#4ade80' : '#f87171'}
            />
            <Text style={[styles.statusText, { color: status === 'connected' ? '#4ade80' : '#f87171' }]}>
              {status === 'connected' ? 'Connected to Captain' : 'Connection failed'}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Updates</Text>
        <Pressable onPress={handleUpdate} disabled={updating} style={styles.updateBtn}>
          <MaterialIcons name="system-update" size={18} color="#6c9cff" />
          <Text style={styles.updateText}>{updating ? updateStatus : 'Check for Updates'}</Text>
        </Pressable>
        {!updating && updateStatus ? (
          <Text style={[styles.updateResult, updateStatus === 'Up to date' ? styles.statusOk : styles.statusFail]}>
            {updateStatus}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <Pressable onPress={handleClearMemory} style={styles.dangerBtn}>
          <MaterialIcons name="delete-forever" size={18} color="#f87171" />
          <Text style={styles.dangerText}>Clear Captain's Memory</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>2.1.0</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>AI Models</Text>
          <Text style={styles.aboutValue}>Claude Haiku / Sonnet / Opus</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Routing</Text>
          <Text style={styles.aboutValue}>Auto (complexity-based)</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Voice</Text>
          <Text style={styles.aboutValue}>OpenAI TTS (Onyx)</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Search</Text>
          <Text style={styles.aboutValue}>Brave Search API</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0e17' },
  content: { padding: 20, paddingBottom: 40 },
  section: {
    marginBottom: 24,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6c9cff',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 8, color: '#888' },
  keyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toggleBtn: { padding: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 14,
    color: '#e8e8e8',
    backgroundColor: '#0a0e17',
  },
  buttonRow: { flexDirection: 'row', gap: 12 },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6c9cff30',
    backgroundColor: '#6c9cff10',
  },
  testText: { color: '#6c9cff', fontWeight: '600', fontSize: 14 },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#6c9cff',
  },
  saveText: { color: '#0a0e17', fontWeight: '700', fontSize: 14 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  statusOk: { backgroundColor: 'rgba(74, 222, 128, 0.08)' },
  statusFail: { backgroundColor: 'rgba(248, 113, 113, 0.08)' },
  statusText: { fontSize: 13, fontWeight: '500' },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  aboutLabel: { fontSize: 14, color: '#888' },
  aboutValue: { fontSize: 14, color: '#e8e8e8' },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6c9cff30',
    backgroundColor: '#6c9cff10',
  },
  updateText: { color: '#6c9cff', fontWeight: '600', fontSize: 14 },
  updateResult: { textAlign: 'center', marginTop: 10, fontSize: 13, fontWeight: '500' },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: { fontSize: 14, color: '#e8e8e8' },
  integrationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#0a0e17',
  },
  integrationText: { flex: 1, fontSize: 14, color: '#e8e8e8' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f8717130',
    backgroundColor: '#f8717110',
  },
  dangerText: { color: '#f87171', fontWeight: '600', fontSize: 14 },
});
