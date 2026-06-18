import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Image,
  Vibration,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConversationItem from '../components/ConversationItem';
import MicButton from '../components/MicButton';
import Waveform from '../components/Waveform';
import { useTheme } from '../context/ThemeContext';
import { sendMessage, sendMessageStream, sendFeedback, testConnection, getBriefing, getDailyBriefingStructured, registerPushToken, sendVision, getBookingsToday, getWeather, addReminder, addMemory } from '../services/api';
import {
  requestPermissions,
  startListening,
  stopListening,
  speak,
  cancelSpeech,
  playWakeChime,
  playDoneChime,
  useSpeechRecognitionEvent,
} from '../services/voice';

const STORAGE_KEY = 'captain_messages';

const RING_SIZE = 80; // matches MicButton diameter

function HUDPulse({ active, color }) {
  const r0 = useRef(new Animated.Value(0)).current;
  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const rings = [r0, r1, r2];

  useEffect(() => {
    if (!active) {
      rings.forEach(r => r.setValue(0));
      return;
    }
    const animations = rings.map((r, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(r, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [active]);

  if (!active) return null;

  return (
    <>
      {rings.map((r, i) => {
        const size = RING_SIZE + (i + 1) * 28;
        const inset = (RING_SIZE - size) / 2; // centers ring over mic button; negative = bleed outside wrapper
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 1.5,
              borderColor: color,
              zIndex: 0,
              top: inset,
              left: inset,
              opacity: r.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.6, 0] }),
              transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.4] }) }],
            }}
          />
        );
      })}
    </>
  );
}

function ThinkingDots({ color }) {
  const a = useRef(new Animated.Value(0.2)).current;
  const b = useRef(new Animated.Value(0.2)).current;
  const c = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const make = (val, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(val, { toValue: 0.2, duration: 280, useNativeDriver: true }),
        Animated.delay(Math.max(0, 840 - delay - 560)),
      ])
    );
    const anims = [make(a, 0), make(b, 180), make(c, 360)];
    anims.forEach(x => x.start());
    return () => anims.forEach(x => x.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingVertical: 16 }}>
      {[a, b, c].map((val, i) => (
        <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: val }} />
      ))}
    </View>
  );
}

const CHAT_MODES = [
  { key: 'drive',  icon: 'directions-car',      label: 'Drive',  color: '#f59e0b' },
  { key: 'deep',   icon: 'search',               label: 'Deep',   color: '#6366f1' },
  { key: 'devil',  icon: 'thumbs-up-down',       label: 'Devil',  color: '#ef4444' },
  { key: 'wit',    icon: 'sentiment-very-satisfied', label: 'Wit', color: '#10b981' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning, Mike';
  if (h >= 12 && h < 17) return 'Good afternoon, Mike';
  if (h >= 17 && h < 21) return 'Good evening, Mike';
  return "Still up, Mike?";
}

function getCaptainGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 8) return "Good morning. Kelowna is waking up. Your schedule is loaded and I'm standing by.";
  if (h >= 8 && h < 12) return "Morning. I've reviewed your day — speak whenever you're ready.";
  if (h >= 12 && h < 17) return "Afternoon. Everything's running smoothly on my end. What do you need?";
  if (h >= 17 && h < 21) return "Good evening. Long day? I'm here. What can I take off your plate?";
  return "Still at it. I'll keep this brief — what do you need?";
}

let ImagePicker = null;
try { ImagePicker = require('expo-image-picker'); } catch {}

export default function ChatScreen({ navigation }) {
  const { theme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastModelUsed, setLastModelUsed] = useState('');
  const [transcript, setTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [appSettings, setAppSettings] = useState({ driveMode: false, whisperMode: false, meetingMode: false, ambientMode: false, voiceSpeed: 1.0 });
  const [pendingImage, setPendingImage] = useState(null);
  const [streamingMsgId, setStreamingMsgId] = useState(null);
  const [connected, setConnected] = useState(null);
  const [contextInfo, setContextInfo] = useState(null);
  const [quickReminder, setQuickReminder] = useState(null);
  const [notedFact, setNotedFact] = useState(null);
  const [contextChips, setContextChips] = useState([]);
  const chipAnim = useRef(new Animated.Value(0)).current;
  const chipDismissTimer = useRef(null);
  const scrollViewRef = useRef(null);
  const inFlightRef = useRef(false);
  const spokenGreeting = useRef(false);
  const dismissChips = useCallback(() => {
    if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
    Animated.timing(chipAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setContextChips([]));
  }, [chipAnim]);

  const computeChips = useCallback((text) => {
    const lower = text.toLowerCase();
    const specific = [];
    if (lower.includes('remind') || lower.includes('reminder')) {
      specific.push({ label: 'Set Reminder', onPress: () => setTextInput('Remind me about this in 1 hour') });
    } else if (lower.includes('call') || lower.includes('phone')) {
      specific.push({ label: 'Open Contacts', onPress: () => Linking.openURL('tel:') });
    } else if (lower.includes('weather')) {
      specific.push({ label: 'Full Forecast', onPress: () => navigation.navigate('Actions') });
    } else if (lower.includes('booking') || lower.includes('appointment')) {
      specific.push({ label: 'View Bookings', onPress: () => navigation.navigate('Actions') });
    } else if (lower.includes('note') || lower.includes('remember')) {
      specific.push({ label: 'Save Note', onPress: () => setTextInput('Save this as a note: ') });
    }
    const copyChip = { label: 'Copy', onPress: () => Clipboard.setStringAsync(text) };
    return [...specific.slice(0, 1), copyChip];
  }, [navigation]);

  useEffect(() => {
    if (streamingMsgId !== null) return;
    if (messages.length === 0) { setContextChips([]); return; }
    const last = messages[messages.length - 1];
    if (last.isUser || !last.text) return;
    const chips = computeChips(last.text);
    setContextChips(chips);
    chipAnim.setValue(0);
    Animated.timing(chipAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
    chipDismissTimer.current = setTimeout(dismissChips, 8000);
    return () => {
      if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streamingMsgId]);


  const loadSettings = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem('captain_settings');
      if (s) {
        const parsed = JSON.parse(s);
        setAppSettings({
          driveMode: !!parsed.driveMode,
          whisperMode: !!parsed.whisperMode,
          meetingMode: !!parsed.meetingMode,
          ambientMode: !!parsed.ambientMode,
          voiceSpeed: parsed.voiceSpeed || 1.0,
        });
      }
    } catch {}
  }, []);

  const triggerAutoListen = useCallback(async () => {
    const granted = await requestPermissions();
    if (!granted) return;
    Vibration.vibrate(40);
    playWakeChime();
    setTranscript('');
    setIsListening(true);
    startListening();
  }, []);

  useEffect(() => {
    (async () => {
      await loadSettings();

      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setMessages(parsed);
        } catch {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      }

      const ok = await testConnection();
      setConnected(ok);
      if (ok) {
        Promise.allSettled([getBookingsToday(), getWeather()]).then(([bRes, wRes]) => {
          const bookingCount = bRes.status === 'fulfilled' ? (bRes.value.bookings || []).length : 0;
          const weather = wRes.status === 'fulfilled' ? wRes.value : null;
          setContextInfo({ bookingCount, weather });
        });
      }
      if (!ok) {
        Alert.alert(
          'Connection Error',
          'Cannot reach Captain backend. Check Settings.',
          [{ text: 'Settings', onPress: () => navigation.navigate('Settings') }]
        );
      }

      if (ok && !spokenGreeting.current) {
        try {
          const s = await AsyncStorage.getItem('captain_settings');
          const voiceEnabled = s ? JSON.parse(s).voiceEnabled !== false : true;
          const savedMessages = await AsyncStorage.getItem(STORAGE_KEY);
          const hasMessages = savedMessages ? JSON.parse(savedMessages).length > 0 : false;
          if (voiceEnabled && !hasMessages) {
            spokenGreeting.current = true;
            speak(getCaptainGreeting());
          }
        } catch {}
      }

      try {
        const Notifications = require('expo-notifications');
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          await registerPushToken(tokenData.data);
        }
      } catch {}

      const initialUrl = await Linking.getInitialURL();
      if (initialUrl?.includes('listen')) {
        setTimeout(triggerAutoListen, 1200);
      } else {
        try {
          const s = await AsyncStorage.getItem('captain_settings');
          if (s && JSON.parse(s).autoListen) setTimeout(triggerAutoListen, 1200);
        } catch {}
      }
    })();

    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url?.includes('listen')) triggerAutoListen();
    });

    const focusSub = navigation.addListener('focus', loadSettings);
    return () => { sub.remove(); focusSub(); };
  }, [triggerAutoListen, loadSettings]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript || '';
    setTranscript(text);
    if (event.isFinal) {
      setIsListening(false);
      if (text.trim() && !inFlightRef.current && !isSpeaking) handleSend(text.trim());
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    setTranscript('');
    if (event.error !== 'no-speech') {
      Alert.alert('Voice Error', event.message || 'Speech recognition failed');
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  const handleMicPress = useCallback(async () => {
    if (isSpeaking) {
      cancelSpeech();
      setIsSpeaking(false);
      return;
    }
    if (isListening) {
      stopListening();
      setIsListening(false);
      return;
    }
    const granted = await requestPermissions();
    if (!granted) {
      Alert.alert('Permission Denied', 'Microphone permission is required.');
      return;
    }
    Vibration.vibrate([0, 15, 30, 15]);
    playWakeChime();
    setTranscript('');
    setIsListening(true);
    startListening();
  }, [isListening, isSpeaking]);

  const shouldSpeak = useCallback(async () => {
    if (appSettings.whisperMode || appSettings.meetingMode) return false;
    try {
      const s = await AsyncStorage.getItem('captain_settings');
      if (s) return JSON.parse(s).voiceEnabled !== false;
    } catch {}
    return true;
  }, [appSettings]);

  const handleQuickReminder = useCallback(async (text) => {
    try {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await addReminder(text, tomorrow);
      setQuickReminder(null);
      Vibration.vibrate([0, 40, 60, 40]);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  const handleSend = useCallback(async (userText, imagePayload = null) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsProcessing(true);
    setTranscript('');
    setPendingImage(null);
    setQuickReminder(null);
    setContextChips([]);
    chipAnim.setValue(0);
    if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
    setNotedFact(null);

    const opts = {
      chatMode: activeMode,
      driveMode: appSettings.driveMode || activeMode === 'drive',
    };

    if (!imagePayload && userText) {
      const lower = userText.toLowerCase();
      if (lower.includes('remind me') || lower.includes('don\'t let me forget') || lower.includes('remember to')) {
        const extracted = userText.replace(/remind me (to |about )?/i, '').replace(/don't let me forget (to |about )?/i, '').replace(/remember to /i, '').trim();
        if (extracted.length > 3) setQuickReminder(extracted);
      }

      // Memory detection — store facts silently and show "Noted" badge
      const memoryPatterns = [
        { re: /remember that (.+)/i, extract: m => m[1] },
        { re: /my (.+) is (.+)/i, extract: m => `Mike's ${m[1]} is ${m[2]}` },
        { re: /don'?t forget that (.+)/i, extract: m => m[1] },
        { re: /note that (.+)/i, extract: m => m[1] },
      ];
      for (const { re, extract } of memoryPatterns) {
        const match = userText.match(re);
        if (match) {
          const fact = extract(match).trim();
          if (fact.length > 2) {
            addMemory(fact).catch(() => {});
            setNotedFact(fact);
            setTimeout(() => setNotedFact(null), 3000);
          }
          break;
        }
      }
    }

    // Briefing trigger: fetch structured data and prepend as context before sending to AI
    const BRIEFING_TRIGGERS = ['briefing', 'my day', "what's my day", 'morning brief', 'daily brief'];
    if (!imagePayload && userText) {
      const lowerBriefing = userText.toLowerCase();
      const isBriefingRequest = BRIEFING_TRIGGERS.some(t => lowerBriefing.includes(t));
      if (isBriefingRequest) {
        try {
          const briefData = await getDailyBriefingStructured();
          const weatherStr = briefData.weather
            ? `${briefData.weather.temp !== null ? briefData.weather.temp + '°C' : ''} ${briefData.weather.condition || ''}`.trim()
            : 'unavailable';
          const bookingStr = briefData.bookings && briefData.bookings.length > 0
            ? `${briefData.bookings.length} booking${briefData.bookings.length !== 1 ? 's' : ''} today`
            : 'no bookings today';
          const reminderStr = briefData.reminders && briefData.reminders.length > 0
            ? briefData.reminders.map(r => r.text).join(', ')
            : 'no active reminders';
          userText = `Here is today's briefing data: Date: ${briefData.date}. Weather: ${weatherStr}. Bookings: ${bookingStr}. Reminders: ${reminderStr}. Please present this as my daily briefing in your Jarvis style.`;
        } catch {
          // If structured briefing fetch fails, continue with original message
        }
      }
    }

    const now = Date.now();
    const displayText = imagePayload ? `[Image] ${userText || 'What do you see?'}` : userText;
    const userMsg = { id: now, text: displayText, isUser: true, ts: now };
    const captainMsgId = now + 1;
    const captainMsg = { id: captainMsgId, text: '', isUser: false, modelUsed: '', complexity: '', ts: now + 1 };
    setStreamingMsgId(captainMsgId);
    setMessages(prev => [...prev, userMsg, captainMsg]);

    try {
      let responseText = '';
      let modelUsed = '';

      if (imagePayload) {
        const data = await sendVision(imagePayload.base64, imagePayload.mimeType, userText || null);
        responseText = data.response;
        modelUsed = data.model_used || 'Claude Vision';
        setMessages(prev => prev.map(m =>
          m.id === captainMsgId ? { ...m, text: responseText, modelUsed } : m
        ));
        setLastModelUsed(modelUsed);
        const saved = prev => {
          const next = prev.map(m => m.id === captainMsgId ? { ...m, text: responseText, modelUsed } : m);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        };
        setMessages(saved);
      } else {
        const fullText = await sendMessageStream(
          userText,
          (chunk, soFar) => {
            setMessages(prev => prev.map(m => m.id === captainMsgId ? { ...m, text: soFar } : m));
          },
          (meta) => {
            setLastModelUsed(meta.model || '');
            setMessages(prev => prev.map(m => m.id === captainMsgId ? { ...m, modelUsed: meta.model, complexity: meta.complexity } : m));
          },
          (finalText) => {
            let finalMessages;
            setMessages(prev => {
              finalMessages = prev.map(m => m.id === captainMsgId ? { ...m, text: finalText } : m);
              return finalMessages;
            });
            if (finalMessages) {
              AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(finalMessages)).catch(() => {});
            }
          },
          opts
        );
        responseText = fullText;
      }

      setStreamingMsgId(null);
      if (await shouldSpeak()) {
        Vibration.vibrate([0, 30, 80, 30]);
        setIsSpeaking(true);
        await speak(responseText, appSettings.voiceSpeed);
        setIsSpeaking(false);
        playDoneChime();
        if (appSettings.ambientMode && !appSettings.whisperMode && !appSettings.meetingMode) {
          setTimeout(() => {
            Vibration.vibrate(20);
            setTranscript('');
            setIsListening(true);
            startListening();
          }, 400);
        }
      }
    } catch (error) {
      if (!imagePayload) {
        try {
          const data = await sendMessage(userText, opts);
          setMessages(prev => prev.map(m =>
            m.id === captainMsgId ? { ...m, text: data.response, modelUsed: data.model_used, complexity: data.complexity } : m
          ));
          setLastModelUsed(data.model_used || '');
          if (await shouldSpeak()) {
            setIsSpeaking(true);
            await speak(data.response);
            setIsSpeaking(false);
            playDoneChime();
          }
        } catch (fallbackError) {
          Alert.alert('Error', fallbackError.message);
          setMessages(prev => prev.filter(m => m.id !== captainMsgId));
        }
      } else {
        Alert.alert('Vision Error', error.message);
        setMessages(prev => prev.filter(m => m.id !== captainMsgId));
      }
    } finally {
      setStreamingMsgId(null);
      inFlightRef.current = false;
      setIsProcessing(false);
    }
  }, [activeMode, appSettings, shouldSpeak]);

  const handleCameraPress = useCallback(async () => {
    if (!ImagePicker) {
      Alert.alert('Camera Not Available', 'A app rebuild is required to enable camera. Contact support.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setPendingImage({
          uri: asset.uri,
          base64: asset.base64,
          mimeType: asset.mimeType || 'image/jpeg',
        });
        setShowKeyboard(true);
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  }, []);

  const handleFeedback = useCallback(async (interactionId, helpful) => {
    try { await sendFeedback(interactionId, helpful); } catch {}
  }, []);

  const handleBriefing = useCallback(async () => {
    setIsProcessing(true);
    try {
      const hour = new Date().getHours();
      const type = hour < 15 ? 'morning' : 'evening';
      const data = await getBriefing(type);
      const briefingMsg = { id: Date.now(), text: data.text, isUser: false, modelUsed: 'Briefing' };
      const updated = [...messages, briefingMsg];
      setMessages(updated);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      if (await shouldSpeak()) {
        setIsSpeaking(true);
        await speak(data.text);
        setIsSpeaking(false);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  }, [messages, shouldSpeak]);

  const handleTextSend = useCallback(() => {
    const text = textInput.trim();
    if ((!text && !pendingImage) || isProcessing) return;
    setTextInput('');
    setShowKeyboard(false);
    if (pendingImage) {
      handleSend(text, pendingImage);
    } else {
      handleSend(text);
    }
  }, [textInput, isProcessing, pendingImage, handleSend]);

  const handleClear = useCallback(() => {
    Alert.alert('Clear History', 'Clear all conversation history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setMessages([]);
          setLastModelUsed('');
          await AsyncStorage.removeItem(STORAGE_KEY);
        },
      },
    ]);
  }, []);

  const toggleMode = useCallback((key) => {
    setActiveMode(prev => prev === key ? null : key);
  }, []);

  const activeModeObj = CHAT_MODES.find(m => m.key === activeMode);
  const effectiveDrive = appSettings.driveMode || activeMode === 'drive';

  const statusText = appSettings.meetingMode
    ? 'Meeting mode — silent'
    : isListening
    ? 'Listening...'
    : isProcessing
    ? 'Thinking...'
    : isSpeaking
    ? 'Speaking...'
    : effectiveDrive
    ? 'Drive mode — tap to speak'
    : 'Tap to speak';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.fgPrimary }]}>Captain</Text>
            {connected !== null && (
              <View style={[styles.connDot, { backgroundColor: connected ? '#4ade80' : '#f87171' }]} />
            )}
          </View>
          {lastModelUsed ? (
            <Text style={[styles.subtitle, { color: theme.accent }]}>{lastModelUsed}</Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {activeModeObj ? (
            <View style={[styles.modeBadge, { backgroundColor: activeModeObj.color + '20', borderColor: activeModeObj.color + '40' }]}>
              <MaterialIcons name={activeModeObj.icon} size={12} color={activeModeObj.color} />
              <Text style={[styles.modeBadgeText, { color: activeModeObj.color }]}>{activeModeObj.label}</Text>
            </View>
          ) : null}
          {appSettings.meetingMode ? (
            <View style={[styles.modeBadge, { backgroundColor: '#f8717118', borderColor: '#f8717130' }]}>
              <MaterialIcons name="event" size={12} color="#f87171" />
              <Text style={[styles.modeBadgeText, { color: '#f87171' }]}>Meeting</Text>
            </View>
          ) : null}
          <Pressable onPress={() => navigation.navigate('Actions')} style={styles.settingsBtn}>
            <MaterialIcons name="grid-view" size={22} color={theme.fgTertiary} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
            <MaterialIcons name="settings" size={22} color={theme.accent} />
          </Pressable>
        </View>
      </View>

      {/* Conversation */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.conversation}
        contentContainerStyle={styles.conversationContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            {contextInfo && (
              <View style={styles.contextBanner}>
                {contextInfo.weather ? (
                  <View style={styles.contextChip}>
                    <MaterialIcons name={contextInfo.weather.is_day ? 'wb-sunny' : 'nights-stay'} size={13} color={theme.fgTertiary} />
                    <Text style={[styles.contextChipText, { color: theme.fgTertiary }]}>{contextInfo.weather.temp}°C {contextInfo.weather.condition}</Text>
                  </View>
                ) : null}
                {contextInfo.bookingCount > 0 ? (
                  <View style={styles.contextChip}>
                    <MaterialIcons name="event" size={13} color={theme.fgTertiary} />
                    <Text style={[styles.contextChipText, { color: theme.fgTertiary }]}>{contextInfo.bookingCount} booking{contextInfo.bookingCount !== 1 ? 's' : ''} today</Text>
                  </View>
                ) : null}
                <View style={styles.contextChip}>
                  <MaterialIcons name="today" size={13} color={theme.fgTertiary} />
                  <Text style={[styles.contextChipText, { color: theme.fgTertiary }]}>{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                </View>
                <Pressable
                  onPress={() => handleSend('My daily briefing')}
                  disabled={isProcessing}
                  style={[styles.contextChip, styles.contextChipAction]}
                >
                  <MaterialIcons name="wb-sunny" size={13} color="#ffb347" />
                  <Text style={[styles.contextChipText, { color: '#ffb347' }]}>My Day</Text>
                </Pressable>
              </View>
            )}
            <View style={[styles.emptyIcon, { backgroundColor: theme.accent + '18' }]}>
              <MaterialIcons name="assistant" size={48} color={theme.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.fgPrimary }]}>{getGreeting()}</Text>
            <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>
              Speak or type to start a conversation
            </Text>
            <Pressable
              onPress={handleBriefing}
              disabled={isProcessing}
              style={styles.emptyBriefingBtn}
            >
              <MaterialIcons name="wb-sunny" size={18} color="#ffb347" />
              <Text style={styles.emptyBriefingText}>Get your briefing</Text>
            </Pressable>
          </View>
        ) : (
          messages.map((msg) => (
            <ConversationItem
              key={msg.id}
              message={msg.text}
              isUser={msg.isUser}
              interactionId={msg.interactionId}
              modelUsed={msg.modelUsed}
              complexity={msg.complexity}
              onFeedback={handleFeedback}
              isStreaming={msg.id === streamingMsgId}
              timestamp={msg.ts}
            />
          ))
        )}
        {isProcessing && <ThinkingDots color={theme.accent} />}
      </ScrollView>

      {/* Noted badge — memory stored */}
      {notedFact && (
        <View style={styles.notedBar}>
          <MaterialIcons name="bookmark-added" size={15} color="#818cf8" />
          <Text style={styles.notedText} numberOfLines={1}>Noted: {notedFact}</Text>
        </View>
      )}

      {/* Quick reminder chip */}
      {quickReminder && !isProcessing && (
        <View style={styles.quickReminderBar}>
          <MaterialIcons name="alarm-add" size={16} color="#fb923c" />
          <Text style={styles.quickReminderText} numberOfLines={1}>{quickReminder}</Text>
          <Pressable onPress={() => handleQuickReminder(quickReminder)} style={styles.quickReminderBtn}>
            <Text style={styles.quickReminderBtnText}>Set</Text>
          </Pressable>
          <Pressable onPress={() => setQuickReminder(null)} style={styles.quickReminderDismiss}>
            <MaterialIcons name="close" size={14} color="#fb923c" />
          </Pressable>
        </View>
      )}

      {/* Listening bar — waveform + transcript */}
      {isListening ? (
        <View style={styles.transcriptBar}>
          <Waveform isActive={isListening} color="#ff6b35" />
          {transcript ? (
            <Text style={styles.transcriptText} numberOfLines={1}>{transcript}</Text>
          ) : (
            <Text style={[styles.transcriptText, { opacity: 0.5 }]}>Listening...</Text>
          )}
        </View>
      ) : null}

      {/* Context action chips */}
      {contextChips.length > 0 && (
        <Animated.View style={[styles.contextChipsRow, { opacity: chipAnim }]}>
          {contextChips.map((chip) => (
            <Pressable
              key={chip.label}
              onPress={() => { chip.onPress(); dismissChips(); }}
              style={({ pressed }) => [
                styles.contextActionChip,
                { borderColor: theme.accent, backgroundColor: pressed ? theme.accent + '28' : theme.accent + '14' },
              ]}
            >
              <Text style={[styles.contextActionChipText, { color: theme.accent }]}>{chip.label}</Text>
            </Pressable>
          ))}
        </Animated.View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {showKeyboard ? (
          <>
            {pendingImage ? (
              <View style={styles.pendingImageRow}>
                <Image source={{ uri: pendingImage.uri }} style={styles.pendingThumb} />
                <Text style={[styles.pendingLabel, { color: theme.fgTertiary }]}>Image ready — add a question or just send</Text>
                <Pressable onPress={() => setPendingImage(null)} style={styles.pendingRemove}>
                  <MaterialIcons name="close" size={16} color={theme.fgTertiary} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <Pressable onPress={() => { setShowKeyboard(false); setPendingImage(null); }} style={[styles.inputSideBtn, { backgroundColor: theme.accent + '18' }]}>
                <MaterialIcons name="mic" size={22} color={theme.accent} />
              </Pressable>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.inputBg, color: theme.fgPrimary, borderColor: theme.inputBorder }]}
                placeholder={pendingImage ? 'Ask about this image...' : 'Message Captain...'}
                placeholderTextColor={theme.fgTertiary}
                value={textInput}
                onChangeText={setTextInput}
                onSubmitEditing={handleTextSend}
                returnKeyType="send"
                autoFocus={!pendingImage}
                editable={!isProcessing}
              />
              <Pressable onPress={handleCameraPress} style={[styles.inputSideBtn, { backgroundColor: theme.inputBg }]}>
                <MaterialIcons name="camera-alt" size={20} color={theme.fgTertiary} />
              </Pressable>
              <Pressable onPress={handleTextSend} disabled={(!textInput.trim() && !pendingImage) || isProcessing} style={styles.sendBtn}>
                <MaterialIcons name="send" size={20} color={(textInput.trim() || pendingImage) ? theme.accent : theme.fgTertiary} />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {/* Mode chips */}
            <View style={styles.modeChips}>
              {CHAT_MODES.map(m => {
                const active = activeMode === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => toggleMode(m.key)}
                    style={[
                      styles.modeChip,
                      { borderColor: active ? m.color : theme.divider, backgroundColor: active ? m.color + '18' : 'transparent' },
                    ]}
                  >
                    <MaterialIcons name={m.icon} size={13} color={active ? m.color : theme.fgTertiary} />
                    <Text style={[styles.modeChipText, { color: active ? m.color : theme.fgTertiary }]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.statusText, { color: isListening ? '#ff6b35' : theme.fgTertiary }]}>
              {statusText}
            </Text>

            <View style={styles.controlRow}>
              <Pressable onPress={handleBriefing} disabled={isProcessing} style={[styles.sideBtn, { backgroundColor: theme.sideBtnBg, borderColor: theme.sideBtnBorder }]}>
                <MaterialIcons name="wb-sunny" size={22} color="#ffb347" />
              </Pressable>

              <View style={styles.micWrapper}>
                <HUDPulse active={isListening || isSpeaking} color={theme.accent} />
                <View style={{ zIndex: 1 }}>
                  <MicButton
                    onPress={handleMicPress}
                    disabled={isProcessing}
                    isListening={isListening}
                    isSpeaking={isSpeaking}
                    color={theme.accent}
                  />
                </View>
              </View>

              <Pressable onPress={() => setShowKeyboard(true)} style={[styles.sideBtn, { backgroundColor: theme.sideBtnBg, borderColor: theme.sideBtnBorder }]}>
                <MaterialIcons name="keyboard" size={22} color={theme.fgTertiary} />
              </Pressable>
            </View>

            {messages.length > 0 && (
              <Pressable onPress={handleClear} style={styles.clearBtn}>
                <MaterialIcons name="delete-outline" size={14} color={theme.fgTertiary} />
                <Text style={[styles.clearText, { color: theme.fgTertiary }]}>Clear</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerLeft: {},
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  connDot: { width: 7, height: 7, borderRadius: 4, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 2 },
  settingsBtn: { padding: 8 },
  modeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  modeBadgeText: { fontSize: 11, fontWeight: '600' },
  conversation: { flex: 1 },
  conversationContent: { paddingVertical: 8, flexGrow: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  contextBanner: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 },
  contextChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(128,128,128,0.08)' },
  contextChipAction: { backgroundColor: 'rgba(255,179,71,0.1)', borderWidth: 1, borderColor: 'rgba(255,179,71,0.2)' },
  contextChipText: { fontSize: 12, fontWeight: '500' },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  emptyBriefingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 24, paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: 'rgba(255, 179, 71, 0.1)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 179, 71, 0.2)',
  },
  emptyBriefingText: { fontSize: 14, color: '#ffb347', fontWeight: '500' },
  quickReminderBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(251, 146, 60, 0.08)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(251, 146, 60, 0.2)',
  },
  quickReminderText: { flex: 1, color: '#fb923c', fontSize: 13 },
  quickReminderBtn: {
    backgroundColor: '#fb923c', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  quickReminderBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  quickReminderDismiss: { padding: 2 },
  notedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.2)',
  },
  notedText: { flex: 1, color: '#818cf8', fontSize: 12, fontStyle: 'italic' },
  transcriptBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 107, 53, 0.15)',
  },
  transcriptText: { color: '#ff6b35', fontSize: 14, flex: 1 },
  controls: { alignItems: 'center', paddingBottom: 36, paddingTop: 8 },
  modeChips: {
    flexDirection: 'row', gap: 8, marginBottom: 14,
  },
  modeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, borderWidth: 1,
  },
  modeChipText: { fontSize: 11, fontWeight: '600' },
  statusText: { fontSize: 13, marginBottom: 16, fontWeight: '500' },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  micWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  clearText: { fontSize: 12 },
  pendingImageRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  pendingThumb: { width: 40, height: 40, borderRadius: 8 },
  pendingLabel: { flex: 1, fontSize: 12 },
  pendingRemove: { padding: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4,
  },
  inputSideBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  textInput: {
    flex: 1, height: 44, borderRadius: 22,
    paddingHorizontal: 18, fontSize: 15,
    borderWidth: 1,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  contextChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  contextActionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  contextActionChipText: { fontSize: 13, fontWeight: '600' },
});
