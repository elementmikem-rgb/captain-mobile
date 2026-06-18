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
import * as LocalAuthentication from 'expo-local-authentication';
import { testConnection, resetClient } from '../services/api';
import { useTheme, PALETTE } from '../context/ThemeContext';

const SETTINGS_KEY = 'captain_settings';
const DEFAULT_SETTINGS = {
  voiceEnabled: true,
  autoListen: false,
  ambientMode: false,
  shakeToActivate: true,
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
  personality: 'casual',
  driveMode: false,
  whisperMode: false,
  meetingMode: false,
  focusMode: false,
  useLocation: false,
  calendarEnabled: false,
  biometricLock: false,
};

const PERSONALITIES = [
  {
    key: 'professional',
    icon: 'business-center',
    label: 'Professional',
    example: '"Understood, sir. I\'ll handle that."',
  },
  {
    key: 'casual',
    icon: 'chat-bubble-outline',
    label: 'Casual',
    example: '"Got it! On it."',
  },
  {
    key: 'direct',
    icon: 'flash-on',
    label: 'Direct',
    example: '"Done."',
  },
];

const MODES = [
  { key: 'dark',  icon: 'dark-mode',        label: 'Dark' },
  { key: 'light', icon: 'light-mode',        label: 'Light' },
  { key: 'auto',  icon: 'brightness-auto',   label: 'Auto' },
];

function ThemeSwatch({ colorKey, isSelected, onPress, isDark }) {
  const p = PALETTE[colorKey];
  const bgHalf = isDark ? p.darkBg : p.lightBg;
  return (
    <Pressable onPress={onPress} style={styles.swatchWrapper}>
      <View style={[
        styles.swatch,
        isSelected && { borderColor: p.accent, borderWidth: 2.5 },
      ]}>
        <View style={[styles.swatchHalf, { backgroundColor: bgHalf }]} />
        <View style={[styles.swatchHalf, { backgroundColor: p.accent }]} />
        {isSelected && (
          <View style={styles.swatchCheck}>
            <MaterialIcons name="check" size={11} color={p.accent} />
          </View>
        )}
      </View>
      <Text style={[
        styles.swatchLabel,
        { color: isSelected ? p.accent : '#888', fontWeight: isSelected ? '600' : '400' },
      ]}>
        {p.label}
      </Text>
    </Pressable>
  );
}

export default function SettingsScreen({ navigation }) {
  const { theme, colorKey, mode, setColorKey, setMode, isDark } = useTheme();
  const [apiUrl, setApiUrl] = useState('https://callova.live/captain');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    (async () => {
      const url = await AsyncStorage.getItem('captain_api_url');
      const key = await AsyncStorage.getItem('captain_api_key');
      const saved = await AsyncStorage.getItem(SETTINGS_KEY);
      if (url) setApiUrl(url);
      if (key) setApiKey(key);
      if (saved) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
        } catch {
          setSettings(DEFAULT_SETTINGS);
          await AsyncStorage.removeItem(SETTINGS_KEY);
        }
      }
      try {
        const baseUrl = url || 'https://callova.live/captain';
        const apiKeyVal = key || '';
        const res = await fetch(`${baseUrl}/api/auth/google/status`, { headers: { 'X-API-Key': apiKeyVal } });
        const data = await res.json();
        setGoogleConnected(data.connected);
      } catch {}

      // Check biometric hardware availability
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(hasHardware && isEnrolled);
      } catch {
        setBiometricAvailable(false);
      }
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
      const prev = await AsyncStorage.multiGet(['captain_api_url', 'captain_api_key']);
      await AsyncStorage.multiSet([
        ['captain_api_url', apiUrl],
        ['captain_api_key', apiKey],
      ]);
      resetClient();
      const ok = await testConnection();
      if (!ok) {
        await AsyncStorage.multiSet(prev.map(([k, v]) => [k, v ?? '']));
        resetClient();
      }
      setStatus(ok ? 'connected' : 'failed');
    } catch {
      setStatus('failed');
    } finally {
      setTesting(false);
    }
  };

  const handlePersonalityChange = async (personalityKey) => {
    const p = PERSONALITIES.find(x => x.key === personalityKey);
    if (!p) return;
    await updateSetting('personality', personalityKey);
    try {
      const baseUrl = apiUrl || 'https://callova.live/captain';
      const key = apiKey || '';
      await fetch(`${baseUrl}/api/personality`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ mode: personalityKey }),
      });
    } catch {}
  };

  const handleBiometricToggle = async (value) => {
    if (value && !biometricAvailable) {
      Alert.alert(
        'Biometrics Not Available',
        'This device does not have Face ID, Touch ID, or fingerprint authentication set up.',
      );
      return;
    }
    await updateSetting('biometricLock', value);
  };

  const handleConnectGoogle = () => {
    const baseUrl = apiUrl || 'https://callova.live/captain';
    Linking.openURL(`${baseUrl}/api/auth/google`);
  };

  const handleClearMemory = () => {
    Alert.alert('Clear Captain Memory', "This will erase all of Captain's learned facts about you. Are you sure?", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            const baseUrl = apiUrl || 'https://callova.live/captain';
            const key = apiKey || '';
            await fetch(`${baseUrl}/api/identity`, {
              method: 'DELETE',
              headers: { 'X-API-Key': key },
            });
            Alert.alert('Done', "Captain's memory has been cleared.");
          } catch {
            Alert.alert('Error', 'Could not clear memory.');
          }
        },
      },
    ]);
  };

  const SettingRow = ({ icon, label, children }) => (
    <View style={[styles.settingRow, { borderBottomColor: theme.divider }]}>
      <View style={styles.settingLeft}>
        <MaterialIcons name={icon} size={18} color={theme.fgTertiary} />
        <Text style={[styles.settingLabel, { color: theme.fgSecondary }]}>{label}</Text>
      </View>
      {children}
    </View>
  );

  const s = (bg) => ([styles.section, { backgroundColor: bg || theme.sectionBg }]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>

      {/* ── Appearance ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Appearance</Text>

        {/* Mode toggle */}
        <View style={[styles.modeToggle, { backgroundColor: theme.inputBg, borderColor: theme.divider }]}>
          {MODES.map(m => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMode(m.key)}
                style={[
                  styles.modeBtn,
                  active && { backgroundColor: theme.accent + '22' },
                ]}
              >
                <MaterialIcons name={m.icon} size={16} color={active ? theme.accent : theme.fgTertiary} />
                <Text style={[styles.modeBtnText, { color: active ? theme.accent : theme.fgTertiary }]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Color swatches */}
        <Text style={[styles.subLabel, { color: theme.fgTertiary }]}>Color</Text>
        <View style={styles.swatchRow}>
          {Object.keys(PALETTE).map(key => (
            <ThemeSwatch
              key={key}
              colorKey={key}
              isSelected={colorKey === key}
              onPress={() => setColorKey(key)}
              isDark={isDark}
            />
          ))}
        </View>
      </View>

      {/* ── Personality ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Personality</Text>
        <Text style={[styles.subLabel, { color: theme.fgTertiary }]}>How Captain talks to you</Text>
        <View style={styles.personalityRow}>
          {PERSONALITIES.map(p => {
            const active = settings.personality === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => handlePersonalityChange(p.key)}
                style={[
                  styles.personalityChip,
                  {
                    borderColor: active ? theme.accent : theme.divider,
                    backgroundColor: active ? theme.accent + '18' : theme.inputBg,
                  },
                ]}
              >
                <MaterialIcons name={p.icon} size={20} color={active ? theme.accent : theme.fgTertiary} />
                <Text style={[styles.personalityLabel, { color: active ? theme.accent : theme.fgSecondary }]}>
                  {p.label}
                </Text>
                <Text style={[styles.personalityDesc, { color: theme.fgTertiary }]}>{p.example}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Modes ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Modes</Text>
        <SettingRow icon="directions-car" label="Drive Mode">
          <Switch
            value={settings.driveMode}
            onValueChange={v => updateSetting('driveMode', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.driveMode ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <SettingRow icon="volume-off" label="Whisper Mode">
          <Switch
            value={settings.whisperMode}
            onValueChange={v => updateSetting('whisperMode', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.whisperMode ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <SettingRow icon="event" label="Meeting Mode">
          <Switch
            value={settings.meetingMode}
            onValueChange={v => updateSetting('meetingMode', v)}
            trackColor={{ false: theme.switchTrackOff, true: '#f8717140' }}
            thumbColor={settings.meetingMode ? '#f87171' : theme.switchThumbOff}
          />
        </SettingRow>
        <SettingRow icon="center-focus-strong" label="Focus Mode">
          <Switch
            value={settings.focusMode}
            onValueChange={v => updateSetting('focusMode', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.focusMode ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
      </View>

      {/* ── Voice ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Voice</Text>
        <SettingRow icon="volume-up" label="Speak responses">
          <Switch
            value={settings.voiceEnabled}
            onValueChange={v => updateSetting('voiceEnabled', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.voiceEnabled ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <SettingRow icon="mic" label="Auto-listen on open">
          <Switch
            value={settings.autoListen}
            onValueChange={v => updateSetting('autoListen', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.autoListen ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <SettingRow icon="loop" label="Ambient mode (re-listen after speaking)">
          <Switch
            value={settings.ambientMode}
            onValueChange={v => updateSetting('ambientMode', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.ambientMode ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <SettingRow icon="vibration" label="Shake to activate">
          <Switch
            value={settings.shakeToActivate}
            onValueChange={v => updateSetting('shakeToActivate', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.shakeToActivate ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <View style={[styles.settingRow, { borderBottomColor: theme.divider }]}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="speed" size={18} color={theme.fgTertiary} />
            <Text style={[styles.settingLabel, { color: theme.fgSecondary }]}>Voice speed</Text>
          </View>
          <View style={styles.speedChips}>
            {[0.75, 1.0, 1.25, 1.5].map(v => {
              const active = settings.voiceSpeed === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => updateSetting('voiceSpeed', v)}
                  style={[styles.speedChip, active && { backgroundColor: theme.accent + '20', borderColor: theme.accent }]}
                >
                  <Text style={[styles.speedChipText, { color: active ? theme.accent : theme.fgTertiary }]}>
                    {v}x
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── Macros ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Macros</Text>
        <Text style={[styles.subLabel, { color: theme.fgTertiary }]}>Say any trigger phrase to activate a macro</Text>
        {[
          { name: 'Morning Mode',  icon: 'wb-sunny',            triggers: '"morning mode"  or  "start my day"',  desc: 'Opens briefing, ambient ON, speed 1.0x' },
          { name: 'Focus Mode',    icon: 'center-focus-strong', triggers: '"focus mode"  or  "heads down"',      desc: 'Whisper ON, ambient OFF' },
          { name: 'Drive Mode',    icon: 'directions-car',      triggers: '"drive mode"  or  "driving"',         desc: 'Drive ON, ambient ON, speed 0.85x' },
          { name: 'End of Day',    icon: 'nights-stay',         triggers: '"end of day"  or  "wrap up"',         desc: 'Ambient OFF, drive OFF, prompts reflection' },
          { name: 'Status Check',  icon: 'radar',               triggers: '"status check"',                      desc: 'Fires your daily briefing' },
        ].map(macro => (
          <View key={macro.name} style={[styles.macroCard, { backgroundColor: theme.inputBg, borderColor: theme.divider }]}>
            <View style={[styles.macroIconWrap, { backgroundColor: theme.accent + '18' }]}>
              <MaterialIcons name={macro.icon} size={18} color={theme.accent} />
            </View>
            <View style={styles.macroBody}>
              <Text style={[styles.macroName, { color: theme.fgSecondary }]}>{macro.name}</Text>
              <Text style={[styles.macroTrigger, { color: theme.accent }]}>{macro.triggers}</Text>
              <Text style={[styles.macroDesc, { color: theme.fgTertiary }]}>{macro.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Routines ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Routines</Text>
        <Text style={[styles.subLabel, { color: theme.fgTertiary }]}>Say a trigger phrase to run a multi-step routine automatically</Text>
        {[
          {
            name: 'Morning',
            icon: 'wb-sunny',
            color: '#fbbf24',
            triggers: '"morning routine"  |  "start my morning"  |  "good morning captain"',
            steps: 'Briefing + weather + bookings, urgent messages check, contextual chips',
          },
          {
            name: 'Evening',
            icon: 'nights-stay',
            color: '#818cf8',
            triggers: '"evening routine"  |  "wrap up my day"  |  "end of day captain"',
            steps: 'Day summary, tomorrow focus prompt, session summary offer',
          },
          {
            name: 'Focus',
            icon: 'center-focus-strong',
            color: '#34d399',
            triggers: '"focus routine"  |  "deep work mode"  |  "I need to focus"',
            steps: 'Whisper ON, ambient OFF, focus timer offer',
          },
          {
            name: 'Travel',
            icon: 'flight-takeoff',
            color: '#38bdf8',
            triggers: '"travel mode"  |  "I\'m traveling"  |  "heading out"',
            steps: 'Drive mode ON, weather brief, booking count',
          },
        ].map(routine => (
          <View key={routine.name} style={[styles.macroCard, { backgroundColor: theme.inputBg, borderColor: theme.divider }]}>
            <View style={[styles.macroIconWrap, { backgroundColor: routine.color + '20' }]}>
              <MaterialIcons name={routine.icon} size={18} color={routine.color} />
            </View>
            <View style={styles.macroBody}>
              <Text style={[styles.macroName, { color: theme.fgSecondary }]}>{routine.name} Routine</Text>
              <Text style={[styles.macroTrigger, { color: routine.color }]}>{routine.triggers}</Text>
              <Text style={[styles.macroDesc, { color: theme.fgTertiary }]}>{routine.steps}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Notifications ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Notifications</Text>
        <SettingRow icon="notification-important" label="New bookings">
          <Switch value={settings.notifyNewBookings} onValueChange={v => updateSetting('notifyNewBookings', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.notifyNewBookings ? theme.switchThumbOn : theme.switchThumbOff} />
        </SettingRow>
        <SettingRow icon="cancel" label="Cancellations">
          <Switch value={settings.notifyCancellations} onValueChange={v => updateSetting('notifyCancellations', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.notifyCancellations ? theme.switchThumbOn : theme.switchThumbOff} />
        </SettingRow>
        <SettingRow icon="cloud" label="Weather alerts">
          <Switch value={settings.notifyWeatherAlerts} onValueChange={v => updateSetting('notifyWeatherAlerts', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.notifyWeatherAlerts ? theme.switchThumbOn : theme.switchThumbOff} />
        </SettingRow>
        <SettingRow icon="wb-sunny" label="Morning/evening briefings">
          <Switch value={settings.notifyBriefings} onValueChange={v => updateSetting('notifyBriefings', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.notifyBriefings ? theme.switchThumbOn : theme.switchThumbOff} />
        </SettingRow>
        <SettingRow icon="do-not-disturb" label="Do Not Disturb">
          <Switch value={settings.doNotDisturb} onValueChange={v => updateSetting('doNotDisturb', v)}
            trackColor={{ false: theme.switchTrackOff, true: '#f8717140' }}
            thumbColor={settings.doNotDisturb ? '#f87171' : theme.switchThumbOff} />
        </SettingRow>
      </View>

      {/* ── Security ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Security</Text>
        <SettingRow icon="lock" label="Biometric Lock">
          <Switch
            value={settings.biometricLock}
            onValueChange={handleBiometricToggle}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.biometricLock ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <Text style={[styles.subLabel, { color: theme.fgTertiary, marginTop: 4 }]}>
          Require Face ID or fingerprint to open Captain.
        </Text>
        {!biometricAvailable && (
          <Text style={[styles.subLabel, { color: '#f87171', marginTop: 0 }]}>
            No biometrics enrolled on this device.
          </Text>
        )}
      </View>

      {/* ── Privacy ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Privacy</Text>
        <SettingRow icon="location-on" label="Use my location">
          <Switch
            value={settings.useLocation}
            onValueChange={v => updateSetting('useLocation', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.useLocation ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <Text style={[styles.subLabel, { color: theme.fgTertiary, marginTop: 4 }]}>
          When enabled, Captain uses your real location for weather and context. Off by default.
        </Text>
        <SettingRow icon="event-note" label="Sync device calendar">
          <Switch
            value={settings.calendarEnabled}
            onValueChange={v => updateSetting('calendarEnabled', v)}
            trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
            thumbColor={settings.calendarEnabled ? theme.switchThumbOn : theme.switchThumbOff}
          />
        </SettingRow>
        <Text style={[styles.subLabel, { color: theme.fgTertiary, marginTop: 4 }]}>
          When enabled, Captain reads your device calendar events for the next 7 days and uses them as context. Off by default.
        </Text>
      </View>

      {/* ── Integrations ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Integrations</Text>
        <Pressable onPress={handleConnectGoogle} style={[styles.integrationBtn, { backgroundColor: theme.inputBg }]}>
          <MaterialIcons name="event" size={18} color={googleConnected ? '#4ade80' : theme.fgTertiary} />
          <Text style={[styles.integrationText, { color: theme.fgSecondary }]}>
            {googleConnected ? 'Google Calendar Connected' : 'Connect Google Calendar & Gmail'}
          </Text>
          <MaterialIcons name={googleConnected ? 'check-circle' : 'chevron-right'} size={18} color={googleConnected ? '#4ade80' : theme.fgTertiary} />
        </Pressable>
      </View>

      {/* ── Connection ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Connection</Text>
        <Text style={[styles.label, { color: theme.fgTertiary }]}>Server URL</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, color: theme.fgSecondary, borderColor: theme.inputBorder }]}
          placeholder="https://callova.live/captain"
          placeholderTextColor={theme.fgTertiary}
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.keyHeader}>
          <Text style={[styles.label, { color: theme.fgTertiary }]}>API Key</Text>
          <Pressable onPress={() => setShowApiKey(!showApiKey)} style={styles.toggleBtn}>
            <MaterialIcons name={showApiKey ? 'visibility-off' : 'visibility'} size={16} color={theme.accent} />
          </Pressable>
        </View>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, color: theme.fgSecondary, borderColor: theme.inputBorder }]}
          placeholder="Paste your API key"
          placeholderTextColor={theme.fgTertiary}
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry={!showApiKey}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.buttonRow}>
          <Pressable onPress={handleTest} disabled={testing} style={[styles.testBtn, { borderColor: theme.accent + '30', backgroundColor: theme.accent + '10' }]}>
            <MaterialIcons name="wifi-tethering" size={16} color={theme.accent} />
            <Text style={[styles.testText, { color: theme.accent }]}>{testing ? 'Testing...' : 'Test'}</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={[styles.saveBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.saveText, { color: isDark ? '#000' : '#fff' }]}>Save</Text>
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

      {/* ── Updates ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Updates</Text>
        <Pressable onPress={handleUpdate} disabled={updating} style={[styles.updateBtn, { borderColor: theme.accent + '30', backgroundColor: theme.accent + '10' }]}>
          <MaterialIcons name="system-update" size={18} color={theme.accent} />
          <Text style={[styles.updateText, { color: theme.accent }]}>{updating ? updateStatus : 'Check for Updates'}</Text>
        </Pressable>
        {!updating && updateStatus ? (
          <Text style={[styles.updateResult, updateStatus === 'Up to date' ? styles.statusOk : styles.statusFail]}>
            {updateStatus}
          </Text>
        ) : null}
      </View>

      {/* ── Intelligence Report ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Reports</Text>
        <Pressable
          onPress={() => navigation.navigate('Insights')}
          style={[styles.integrationBtn, { backgroundColor: theme.inputBg }]}
        >
          <MaterialIcons name="insights" size={18} color={theme.accent} />
          <Text style={[styles.integrationText, { color: theme.fgSecondary }]}>Intelligence Report</Text>
          <MaterialIcons name="chevron-right" size={18} color={theme.fgTertiary} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('ActivityLog')}
          style={[styles.integrationBtn, { backgroundColor: theme.inputBg, marginTop: 8 }]}
        >
          <MaterialIcons name="history" size={18} color={theme.accent} />
          <Text style={[styles.integrationText, { color: theme.fgSecondary }]}>Activity Log</Text>
          <MaterialIcons name="chevron-right" size={18} color={theme.fgTertiary} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Search')}
          style={[styles.integrationBtn, { backgroundColor: theme.inputBg, marginTop: 8 }]}
        >
          <MaterialIcons name="manage-search" size={18} color={theme.accent} />
          <Text style={[styles.integrationText, { color: theme.fgSecondary }]}>Search Everything</Text>
          <MaterialIcons name="chevron-right" size={18} color={theme.fgTertiary} />
        </Pressable>
      </View>

      {/* ── Data ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Data</Text>
        <Pressable onPress={handleClearMemory} style={styles.dangerBtn}>
          <MaterialIcons name="delete-forever" size={18} color="#f87171" />
          <Text style={styles.dangerText}>Clear Captain's Memory</Text>
        </Pressable>
      </View>

      {/* ── About ── */}
      <View style={s()}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>About</Text>
        {[
          ['Version', '2.2.0'],
          ['AI Models', 'Claude Haiku / Sonnet / Opus'],
          ['Routing', 'Auto (complexity-based)'],
          ['Voice', 'OpenAI TTS (Onyx)'],
          ['Search', 'Brave Search API'],
        ].map(([label, value]) => (
          <View key={label} style={[styles.aboutRow, { borderBottomColor: theme.divider }]}>
            <Text style={[styles.aboutLabel, { color: theme.fgTertiary }]}>{label}</Text>
            <Text style={[styles.aboutValue, { color: theme.fgSecondary }]}>{value}</Text>
          </View>
        ))}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  section: {
    borderRadius: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 10,
    marginTop: 4,
  },

  /* Mode toggle */
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 9,
  },
  modeBtnText: { fontSize: 13, fontWeight: '500' },

  /* Swatches */
  swatchRow: { flexDirection: 'row', justifyContent: 'space-between' },
  swatchWrapper: { alignItems: 'center', gap: 6 },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  },
  swatchHalf: { flex: 1, height: '100%' },
  swatchCheck: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: { fontSize: 10 },

  /* Setting rows */
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { fontSize: 14 },

  /* Personality */
  personalityRow: { flexDirection: 'row', gap: 8 },
  personalityChip: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  personalityLabel: { fontSize: 13, fontWeight: '600' },
  personalityDesc: { fontSize: 10, textAlign: 'center' },

  label: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
  keyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  toggleBtn: { padding: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 14,
  },
  buttonRow: { flexDirection: 'row', gap: 12 },
  testBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  testText: { fontWeight: '600', fontSize: 14 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveText: { fontWeight: '700', fontSize: 14 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  statusOk: { backgroundColor: 'rgba(74, 222, 128, 0.08)' },
  statusFail: { backgroundColor: 'rgba(248, 113, 113, 0.08)' },
  statusText: { fontSize: 13, fontWeight: '500' },

  integrationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderRadius: 10, paddingHorizontal: 14,
  },
  integrationText: { flex: 1, fontSize: 14 },

  updateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1,
  },
  updateText: { fontWeight: '600', fontSize: 14 },
  updateResult: { textAlign: 'center', marginTop: 10, fontSize: 13, fontWeight: '500' },

  speedChips: { flexDirection: 'row', gap: 6 },
  speedChip: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: 'transparent',
  },
  speedChipText: { fontSize: 12, fontWeight: '600' },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1,
    borderColor: '#f8717130', backgroundColor: '#f8717110',
  },
  dangerText: { color: '#f87171', fontWeight: '600', fontSize: 14 },

  aboutRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1,
  },
  aboutLabel: { fontSize: 14 },
  aboutValue: { fontSize: 14 },

  macroCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 8,
  },
  macroIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  macroBody: { flex: 1, gap: 2 },
  macroName: { fontSize: 13, fontWeight: '700' },
  macroTrigger: { fontSize: 12, fontWeight: '500', fontStyle: 'italic' },
  macroDesc: { fontSize: 11, marginTop: 2 },
});
