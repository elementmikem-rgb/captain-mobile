﻿﻿import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Modal,
  Platform,
  Linking,
  Image,
  Vibration,
  Share,
  StatusBar,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConversationItem from '../components/ConversationItem';
import MicButton from '../components/MicButton';
import Waveform from '../components/Waveform';
import { useTheme } from '../context/ThemeContext';
import { sendMessage, sendMessageStream, sendFeedback, testConnection, getBriefing, getDailyBriefingStructured, registerPushToken, sendVision, getBookingsToday, getWeather, addReminder, addMemory, recallMemory, addDocument, addPersonMemory, addContact, summarizeSession, generateDraft, addFollowup, getSuggestions } from '../services/api';
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

// ── Live Transcription Card ──────────────────────────────────────────────────
function LiveTranscriptCard({ transcript, isListening }) {
  const cardAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0.4)).current;
  const wasListening = useRef(false);

  useEffect(() => {
    if (isListening && !wasListening.current) {
      wasListening.current = true;
      Animated.timing(cardAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else if (!isListening && wasListening.current) {
      wasListening.current = false;
      Animated.timing(cardAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }
  }, [isListening, cardAnim]);

  useEffect(() => {
    if (!isListening) { dotAnim.setValue(0.4); return; }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isListening, dotAnim]);

  const hasText = transcript && transcript.trim().length > 0;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        liveCardStyles.card,
        {
          opacity: cardAnim,
          transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      <Animated.View style={[liveCardStyles.dot, { opacity: dotAnim }]} />
      <Text style={liveCardStyles.text} numberOfLines={3}>
        {hasText ? transcript : 'Listening...'}
      </Text>
    </Animated.View>
  );
}

const liveCardStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
    marginTop: 5,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 22,
    letterSpacing: 0.1,
  },
});
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

const PREDICTIVE_SLOTS = [
  { start: 5,  end: 8,  chips: ['Morning briefing', "Today's bookings", "What's the weather?"] },
  { start: 8,  end: 11, chips: ['Any messages?', 'Prep for today', 'Check reminders'] },
  { start: 11, end: 13, chips: ['Lunch note', 'Morning wrap-up', 'Expense log'] },
  { start: 13, end: 16, chips: ['Afternoon check-in', 'Status update', 'Any calls?'] },
  { start: 16, end: 18, chips: ['End of day wrap', "Tomorrow's prep", 'Expense summary'] },
  { start: 18, end: 21, chips: ['Evening briefing', 'Set tomorrow reminder', 'How did today go?'] },
  { start: 21, end: 29, chips: ['Wind down', "Tomorrow's first task", 'Goodnight briefing'] },
];

function getPredictiveChips() {
  const h = new Date().getHours();
  const slot = PREDICTIVE_SLOTS.find(s => h >= s.start && h < s.end);
  return slot ? slot.chips : PREDICTIVE_SLOTS[PREDICTIVE_SLOTS.length - 1].chips;
}

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

function PredictiveSuggestions({ onSelect, theme, disabled }) {
  const chips = getPredictiveChips();
  const lucky = chips[Math.floor(Math.random() * chips.length)];
  return (
    <View style={predStyles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={predStyles.row}
      >
        {chips.map((label) => (
          <Pressable
            key={label}
            onPress={() => !disabled && onSelect(label)}
            style={({ pressed }) => [
              predStyles.chip,
              {
                borderColor: theme.accent,
                backgroundColor: pressed ? theme.accent + '28' : theme.accent + '18',
              },
            ]}
          >
            <Text style={[predStyles.chipText, { color: theme.accent }]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={predStyles.luckyRow}>
        <Pressable
          onPress={() => !disabled && onSelect(lucky)}
          style={({ pressed }) => [
            predStyles.luckyChip,
            {
              borderColor: theme.accent + '60',
              backgroundColor: pressed ? theme.accent + '20' : theme.accent + '0c',
            },
          ]}
        >
          <MaterialIcons name="casino" size={14} color={theme.accent} style={{ opacity: 0.7 }} />
          <Text style={[predStyles.luckyText, { color: theme.accent }]}>I'm feeling lucky</Text>
        </Pressable>
      </View>
    </View>
  );
}

const predStyles = StyleSheet.create({
  wrapper: { width: '100%', marginTop: 20 },
  row: { paddingHorizontal: 4, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  luckyRow: { marginTop: 10, alignItems: 'center' },
  luckyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  luckyText: { fontSize: 13, fontWeight: '500' },
});

let ImagePicker = null;
try { ImagePicker = require('expo-image-picker'); } catch {}

// ── Task detection helpers ───────────────────────────────────────────────────
const ACTION_VERBS = ['schedule', 'call', 'send', 'book', 'check', 'prepare', 'create', 'update', 'review', 'contact', 'confirm', 'follow', 'set up', 'write', 'get', 'find', 'buy', 'order', 'reply', 'open', 'close', 'cancel', 'submit', 'upload', 'download', 'install', 'remove', 'add', 'edit', 'delete', 'share', 'invite', 'attend', 'complete', 'finish', 'start', 'stop', 'pause', 'resume', 'fix', 'test', 'deploy', 'launch', 'research', 'draft'];

function parseTaskSteps(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const steps = [];

  // Pattern 1: "1. Step text" or "1) Step text"
  const numberedRe = /^\s*(\d+)[.)]\s+(.+)$/;
  // Pattern 2: "Step 1: text" or "Step 1 - text"
  const stepLabelRe = /^\s*step\s+\d+[\s:–\-]+(.+)$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const numMatch = trimmed.match(numberedRe);
    if (numMatch) {
      const stepText = numMatch[2].trim();
      steps.push(stepText);
      if (steps.length >= 8) break;
      continue;
    }

    const stepMatch = trimmed.match(stepLabelRe);
    if (stepMatch) {
      const stepText = stepMatch[1].trim();
      steps.push(stepText);
      if (steps.length >= 8) break;
    }
  }

  if (steps.length < 2) return [];

  // Must have at least one action verb to qualify as a task list
  const lowerAll = steps.join(' ').toLowerCase();
  const hasAction = ACTION_VERBS.some(v => lowerAll.includes(v));
  if (!hasAction) return [];

  return steps;
}

// ── Task Card component ──────────────────────────────────────────────────────
function TaskCard({ task, onToggleStep, onToggleCollapse }) {
  const completedCount = task.steps.filter(s => s.done).length;
  const total = task.steps.length;
  const allDone = completedCount === total;
  const progressPct = total > 0 ? completedCount / total : 0;

  return (
    <View style={taskStyles.card}>
      {/* Progress bar */}
      <View style={taskStyles.progressTrack}>
        <View style={[taskStyles.progressFill, { width: `${progressPct * 100}%`, backgroundColor: allDone ? '#22c55e' : '#6366f1' }]} />
      </View>

      {/* Header row */}
      <Pressable onPress={onToggleCollapse} style={taskStyles.header}>
        <MaterialIcons name="assignment" size={15} color="#818cf8" />
        <Text style={taskStyles.headerText}>Task Plan</Text>
        <View style={taskStyles.headerRight}>
          {allDone && (
            <View style={taskStyles.completeBadge}>
              <Text style={taskStyles.completeBadgeText}>Complete!</Text>
            </View>
          )}
          <Text style={taskStyles.countText}>{completedCount}/{total}</Text>
          <MaterialIcons
            name={task.collapsed ? 'expand-more' : 'expand-less'}
            size={18}
            color="#818cf8"
          />
        </View>
      </Pressable>

      {/* Steps */}
      {!task.collapsed && (
        <View style={taskStyles.stepsContainer}>
          {task.steps.map((step, idx) => (
            <Pressable
              key={idx}
              onPress={() => onToggleStep(idx)}
              style={taskStyles.stepRow}
            >
              <MaterialIcons
                name={step.done ? 'check-box' : 'check-box-outline-blank'}
                size={20}
                color={step.done ? '#22c55e' : '#64748b'}
              />
              <Text style={[taskStyles.stepText, step.done && taskStyles.stepDone]} numberOfLines={3}>
                {step.text}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ChatScreen({ navigation, route }) {
  const { theme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [activeTasks, setActiveTasks] = useState({});
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastModelUsed, setLastModelUsed] = useState('');
  const [detectedLang, setDetectedLang] = useState(null); // null = english / hidden
  const [transcript, setTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [appSettings, setAppSettings] = useState({ driveMode: false, whisperMode: false, meetingMode: false, ambientMode: false, voiceSpeed: 1.0, personality: 'casual' });
  const [pendingImage, setPendingImage] = useState(null);
  const [streamingMsgId, setStreamingMsgId] = useState(null);
  const [connected, setConnected] = useState(null);
  const [contextInfo, setContextInfo] = useState(null);
  const [quickReminder, setQuickReminder] = useState(null);
  const [notedFact, setNotedFact] = useState(null);
  const [notedRelationship, setNotedRelationship] = useState(null); // { name, label }
  const [savedContact, setSavedContact] = useState(null); // { name, phone }
  const [queuedFollowup, setQueuedFollowup] = useState(null); // text string
  const [contextChips, setContextChips] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsAnim = useRef(new Animated.Value(0)).current;
  const lastUserMsgRef = useRef('');
  const [rerunHint, setRerunHint] = useState(false);
  const [searchingMemory, setSearchingMemory] = useState(false);
  const [voiceNoteMode, setVoiceNoteMode] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false); // visual: green mic during long-press
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchBarHeight = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef(null);
  const [showSummaryBanner, setShowSummaryBanner] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [draftModal, setDraftModal] = useState(null); // { draftText, recipient, type }
  const [draftText, setDraftText] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const summaryOfferedRef = useRef(new Set());
  const summaryDismissTimer = useRef(null);
  const [weatherAlert, setWeatherAlert] = useState(null); // { alertText, severity }
  const weatherAlertAnim = useRef(new Animated.Value(0)).current;
  const weatherAlertDismissed = useRef(false);
  const [hudMode, setHudMode] = useState(false);
  const hudAnim = useRef(new Animated.Value(0)).current;
  const pressStartRef = useRef(null);
  const noteModeTimerRef = useRef(null);
  const chipAnim = useRef(new Animated.Value(0)).current;
  const chipDismissTimer = useRef(null);
  const scrollViewRef = useRef(null);
  const inFlightRef = useRef(false);
  const spokenGreeting = useRef(false);
  const dismissChips = useCallback(() => {
    if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
    Animated.timing(chipAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setContextChips([]));
  }, [chipAnim]);

  const dismissSuggestions = useCallback(() => {
    Animated.timing(suggestionsAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setSuggestions([]));
  }, [suggestionsAnim]);

  // Dismiss suggestions when user starts typing
  useEffect(() => {
    if (textInput.length > 0 && suggestions.length > 0) {
      dismissSuggestions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput]);

  // Session summary offer — trigger at 10, 20, 30 messages
  useEffect(() => {
    const count = messages.length;
    if (count < 10) return;
    const threshold = Math.floor(count / 10) * 10;
    if (summaryOfferedRef.current.has(threshold)) return;
    summaryOfferedRef.current.add(threshold);
    setShowSummaryBanner(true);
    if (summaryDismissTimer.current) clearTimeout(summaryDismissTimer.current);
    summaryDismissTimer.current = setTimeout(() => {
      setShowSummaryBanner(false);
    }, 30000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const handleSummarize = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const last20 = messages.slice(-20).map(m => ({
        role: m.isUser ? 'user' : 'assistant',
        content: m.text || '',
      }));
      const result = await summarizeSession(last20);
      const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      await addDocument('Session Summary ' + dateStr, result.summary);
      if (summaryDismissTimer.current) clearTimeout(summaryDismissTimer.current);
      setShowSummaryBanner(false);
      setSummaryLoading(false);
      Alert.alert('Summary saved to notes', '', [{ text: 'OK' }]);
    } catch (e) {
      setSummaryLoading(false);
      Alert.alert('Could not summarize', e.message);
    }
  }, [messages]);

  // Extract a name from AI response draft trigger patterns
  const extractDraftRecipient = useCallback((text) => {
    const patterns = [
      /you should (?:message|text|email)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
      /reach out to\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
      /let\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+know/i,
      /send\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+a/i,
    ];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) return m[1];
    }
    return null;
  }, []);

  const computeChips = useCallback((text) => {
    const lower = text.toLowerCase();
    const specific = [];

    // Draft chip — detect when AI suggests messaging someone
    const draftPatterns = [
      /you should (?:message|text|email)\s+/i,
      /reach out to\s+[A-Z]/i,
      /let\s+[A-Z][a-z]+\s+know/i,
      /send\s+[A-Z][a-z]+\s+a\s+(?:message|text|email)/i,
    ];
    const hasDraftTrigger = draftPatterns.some(p => p.test(text));
    if (hasDraftTrigger) {
      const recipient = extractDraftRecipient(text);
      specific.push({
        label: 'Draft?',
        onPress: async () => {
          setDraftLoading(true);
          try {
            const result = await generateDraft({
              type: lower.includes('email') ? 'email' : 'sms',
              recipient: recipient || undefined,
              context: text,
              tone: 'professional but friendly',
            });
            setDraftText(result.draft || '');
            setDraftModal({ recipient: recipient || result.recipient, type: result.type || 'sms' });
          } catch (e) {
            Alert.alert('Draft Error', e.message);
          } finally {
            setDraftLoading(false);
          }
        },
      });
    } else if (lower.includes('remind') || lower.includes('reminder')) {
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
  }, [navigation, extractDraftRecipient]);

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
          personality: parsed.personality || 'casual',
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

      // Inject personalized welcome after onboarding
      const welcomeProfile = route?.params?.welcomeProfile;
      if (welcomeProfile) {
        const { name: uName, role: uRole, priority: uPriority, personality: uPersonality } = welcomeProfile;
        const personalityLines = {
          professional: `I'll keep things sharp and professional.`,
          casual: `Let's keep things relaxed.`,
          direct: `I'll keep it short and to the point.`,
        };
        const personalityLine = personalityLines[uPersonality] || '';
        const welcomeText =
          `Welcome, ${uName}. I'm Captain — your AI assistant. ` +
          `As a ${uRole} focused on ${uPriority}, I've got you covered. ` +
          personalityLine +
          ` Say anything to get started, or ask me what I can do.`;
        const now = Date.now();
        setMessages([{ id: now, text: welcomeText, isUser: false, ts: now }]);
      }

      const ok = await testConnection();
      setConnected(ok);
      if (ok) {
        Promise.allSettled([getBookingsToday(), getWeather()]).then(([bRes, wRes]) => {
          const bookingCount = bRes.status === 'fulfilled' ? (bRes.value.bookings || []).length : 0;
          const weather = wRes.status === 'fulfilled' ? wRes.value : null;
          setContextInfo({ bookingCount, weather });

          // Show weather alert banner if conditions warrant it
          if (
            !weatherAlertDismissed.current &&
            weather?.alert?.hasAlert
          ) {
            setWeatherAlert({ alertText: weather.alert.alertText, severity: weather.alert.severity });
            Animated.timing(weatherAlertAnim, {
              toValue: 44,
              duration: 320,
              useNativeDriver: false,
            }).start();
          }
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
      setIsNoteMode(false);
      if (text.trim() && !inFlightRef.current && !isSpeaking) {
        if (voiceNoteMode) {
          handleVoiceNote(text.trim());
        } else {
          handleSend(text.trim());
        }
      }
      setVoiceNoteMode(false);
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

  const handleVoiceNote = useCallback(async (text) => {
    try {
      const title = text.length > 60 ? text.slice(0, 57) + '...' : text;
      await addDocument(title, text);
      const noteMsg = {
        id: Date.now(),
        text: `Voice note saved: ${text}`,
        isUser: false,
        modelUsed: 'Voice Note',
        isVoiceNote: true,
        ts: Date.now(),
      };
      setMessages(prev => {
        const next = [...prev, noteMsg];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      Vibration.vibrate([0, 40, 60, 40]);
    } catch (e) {
      Alert.alert('Note Error', 'Could not save voice note: ' + e.message);
    }
  }, []);

  const handleMicPressIn = useCallback(async () => {
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
    pressStartRef.current = Date.now();
    setVoiceNoteMode(false);
    setIsNoteMode(false);

    if (noteModeTimerRef.current) clearTimeout(noteModeTimerRef.current);
    noteModeTimerRef.current = setTimeout(() => {
      setIsNoteMode(true);
      Vibration.vibrate([0, 30, 50, 30]);
    }, 800);

    Vibration.vibrate([0, 15, 30, 15]);
    playWakeChime();
    setTranscript('');
    setIsListening(true);
    startListening();
  }, [isListening, isSpeaking]);

  const handleMicPressOut = useCallback(() => {
    if (noteModeTimerRef.current) clearTimeout(noteModeTimerRef.current);
    if (pressStartRef.current !== null) {
      const held = Date.now() - pressStartRef.current;
      pressStartRef.current = null;
      if (held >= 1500) {
        setVoiceNoteMode(true);
      } else {
        setVoiceNoteMode(false);
        setIsNoteMode(false);
      }
    }
  }, []);

  const handleMicPress = handleMicPressIn;

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

  // ── Smart Macros ────────────────────────────────────────────────────────────
  const MACROS = [
    {
      name: 'Morning Mode',
      triggers: ['morning mode', 'start my day'],
      action: async () => {
        const saved = await AsyncStorage.getItem('captain_settings');
        const current = saved ? JSON.parse(saved) : {};
        const updated = { ...current, ambientMode: true, voiceSpeed: 1.0 };
        await AsyncStorage.setItem('captain_settings', JSON.stringify(updated));
        setAppSettings(prev => ({ ...prev, ambientMode: true, voiceSpeed: 1.0 }));
        return { navigate: 'Briefing', confirmText: null };
      },
    },
    {
      name: 'Focus Mode',
      triggers: ['focus mode', 'heads down'],
      action: async () => {
        const saved = await AsyncStorage.getItem('captain_settings');
        const current = saved ? JSON.parse(saved) : {};
        const updated = { ...current, whisperMode: true, ambientMode: false };
        await AsyncStorage.setItem('captain_settings', JSON.stringify(updated));
        setAppSettings(prev => ({ ...prev, whisperMode: true, ambientMode: false }));
        return { confirmText: 'Focus mode on. Voice muted, ambient off.' };
      },
    },
    {
      name: 'Drive Mode',
      triggers: ['drive mode', 'driving'],
      action: async () => {
        const saved = await AsyncStorage.getItem('captain_settings');
        const current = saved ? JSON.parse(saved) : {};
        const updated = { ...current, driveMode: true, ambientMode: true, voiceSpeed: 0.85 };
        await AsyncStorage.setItem('captain_settings', JSON.stringify(updated));
        setAppSettings(prev => ({ ...prev, driveMode: true, ambientMode: true, voiceSpeed: 0.85 }));
        return { confirmText: "Drive mode activated. I'll keep it brief." };
      },
    },
    {
      name: 'End of Day',
      triggers: ['end of day', 'wrap up'],
      action: async () => {
        const saved = await AsyncStorage.getItem('captain_settings');
        const current = saved ? JSON.parse(saved) : {};
        const updated = { ...current, ambientMode: false, driveMode: false };
        await AsyncStorage.setItem('captain_settings', JSON.stringify(updated));
        setAppSettings(prev => ({ ...prev, ambientMode: false, driveMode: false }));
        return { syntheticMessage: 'How did today go? Give me a moment to reflect on my day.' };
      },
    },
    {
      name: 'Status Check',
      triggers: ['status check'],
      action: async () => {
        return { syntheticMessage: 'My daily briefing' };
      },
    },
  ];

  const checkMacro = useCallback((text) => {
    const lower = text.trim().toLowerCase();
    return MACROS.find(m => m.triggers.some(t => lower === t));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Voice-controlled settings interceptor ───────────────────────────────────
  const handleVoiceCommand = useCallback(async (text) => {
    const lower = text.trim().toLowerCase();
    const VOICE_COMMANDS = [
      { match: s => s === 'turn on voice' || s === 'enable voice', setting: { voiceEnabled: true }, confirm: 'Voice enabled.' },
      { match: s => s === 'turn off voice' || s === 'disable voice' || s === 'mute', setting: { voiceEnabled: false }, confirm: 'Voice off, sir.' },
      { match: s => s === 'turn on ambient' || s === 'ambient mode on' || s === 'hands free', setting: { ambientMode: true }, confirm: 'Ambient mode on.' },
      { match: s => s === 'turn off ambient' || s === 'ambient mode off', setting: { ambientMode: false }, confirm: 'Ambient mode off.' },
      { match: s => s === 'drive mode on' || s === 'driving mode' || s === "i'm driving", setting: { driveMode: true }, confirm: 'Drive mode engaged.' },
      { match: s => s === 'drive mode off' || s === "i've arrived" || s === 'not driving', setting: { driveMode: false }, confirm: 'Drive mode off.' },
      { match: s => s === 'voice speed fast' || s === 'speak faster' || s === 'speed up', setting: { voiceSpeed: 1.5 }, confirm: 'Speaking faster.' },
      { match: s => s === 'voice speed slow' || s === 'speak slower' || s === 'slow down', setting: { voiceSpeed: 0.75 }, confirm: 'Slowing down.' },
      { match: s => s === 'voice speed normal' || s === 'normal speed', setting: { voiceSpeed: 1.0 }, confirm: 'Normal speed.' },
      { match: s => s === 'clear chat' || s === 'clear history' || s === 'fresh start', setting: null, confirm: 'Clean slate.', action: 'clearChat' },
      { match: s => s === 'dark mode', setting: null, confirm: 'Dark mode on.', action: 'darkMode' },
      { match: s => s === 'light mode', setting: null, confirm: 'Light mode on.', action: 'lightMode' },
    ];
    const cmd = VOICE_COMMANDS.find(c => c.match(lower));
    if (!cmd) return false;
    if (cmd.action === 'clearChat') {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setMessages([]);
    } else if (cmd.action === 'darkMode' || cmd.action === 'lightMode') {
      try {
        const ctx = require('../context/ThemeContext');
        if (ctx && typeof ctx.toggleTheme === 'function') ctx.toggleTheme();
      } catch {}
    } else if (cmd.setting) {
      const saved = await AsyncStorage.getItem('captain_settings');
      const current = saved ? JSON.parse(saved) : {};
      const updated = { ...current, ...cmd.setting };
      await AsyncStorage.setItem('captain_settings', JSON.stringify(updated));
      setAppSettings(prev => ({ ...prev, ...cmd.setting }));
    }
    const sysMsg = { id: Date.now(), text: cmd.confirm, isUser: false, isSystem: true, ts: Date.now() };
    setMessages(prev => {
      const next = [...prev, sysMsg];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    try {
      const s = await AsyncStorage.getItem('captain_settings');
      const parsed = s ? JSON.parse(s) : {};
      const willSpeak = parsed.voiceEnabled !== false && !parsed.whisperMode && !parsed.meetingMode;
      if (willSpeak) {
        const speed = parsed.voiceSpeed || appSettings.voiceSpeed || 1.0;
        setIsSpeaking(true);
        await speak(cmd.confirm, speed);
        setIsSpeaking(false);
      }
    } catch {}
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings.voiceSpeed]);
  // ────────────────────────────────────────────────────────────────────────────


  const toggleHUD = useCallback(() => {
    if (!hudMode) {
      setHudMode(true);
      hudAnim.setValue(0);
      Animated.timing(hudAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.timing(hudAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setHudMode(false));
    }
  }, [hudMode, hudAnim]);
  const handleSend = useCallback(async (userText, imagePayload = null) => {
    if (inFlightRef.current) return;
    // ── Voice command interceptor (runs before everything else) ─────────────
    if (!imagePayload && userText) {
      const handled = await handleVoiceCommand(userText);
      if (handled) return;
    }


    // ── User-initiated draft detection ───────────────────────────────────────
    if (!imagePayload && userText) {
      const draftUserPatterns = [
        { re: /draft\s+(?:a\s+)?(?:message|text)\s+to\s+([A-Za-z]+(?:\s[A-Za-z]+)?)\s+about\s+(.+)/i, type: 'sms' },
        { re: /write\s+(?:an?\s+)?email\s+to\s+([A-Za-z]+(?:\s[A-Za-z]+)?)\s+about\s+(.+)/i, type: 'email' },
        { re: /write\s+(?:an?\s+)?email\s+to\s+([A-Za-z]+(?:\s[A-Za-z]+)?)/i, type: 'email' },
        { re: /text\s+([A-Za-z]+(?:\s[A-Za-z]+)?)\s+about\s+(.+)/i, type: 'sms' },
        { re: /draft\s+(?:an?\s+)?email\s+to\s+([A-Za-z]+(?:\s[A-Za-z]+)?)\s+about\s+(.+)/i, type: 'email' },
        { re: /draft\s+(?:an?\s+)?email\s+to\s+([A-Za-z]+(?:\s[A-Za-z]+)?)/i, type: 'email' },
      ];
      for (const { re: draftRe, type: draftType } of draftUserPatterns) {
        const draftMatch = userText.match(draftRe);
        if (draftMatch) {
          const draftRecipient = draftMatch[1]?.trim();
          const draftContext = draftMatch[2]?.trim() || userText;
          setDraftLoading(true);
          try {
            const result = await generateDraft({
              type: draftType,
              recipient: draftRecipient,
              context: draftContext,
              tone: 'professional but friendly',
            });
            setDraftText(result.draft || '');
            setDraftModal({ recipient: draftRecipient || result.recipient, type: draftType });
          } catch (e) {
            Alert.alert('Draft Error', e.message);
          } finally {
            setDraftLoading(false);
          }
          return; // don't send to AI — we handled it
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Macro detection (voice shortcuts) ───────────────────────────────────
    if (!imagePayload && userText) {
      const macro = checkMacro(userText);
      if (macro) {
        const result = await macro.action();
        if (result.confirmText) {
          const confirmMsg = { id: Date.now(), text: result.confirmText, isUser: false, modelUsed: 'Macro', ts: Date.now() };
          setMessages(prev => {
            const next = [...prev, confirmMsg];
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
            return next;
          });
          const willSpeak = !appSettings.whisperMode && !appSettings.meetingMode;
          if (willSpeak) {
            try {
              const s = await AsyncStorage.getItem('captain_settings');
              const voiceEnabled = s ? JSON.parse(s).voiceEnabled !== false : true;
              if (voiceEnabled) {
                setIsSpeaking(true);
                await speak(result.confirmText, appSettings.voiceSpeed);
                setIsSpeaking(false);
              }
            } catch {}
          }
          return;
        }
        if (result.navigate) {
          // navigate to briefing tab then fall through to fire briefing message
          try { navigation.navigate(result.navigate); } catch {}
          // fall through intentionally — let briefing trigger handle the message
          userText = 'My daily briefing';
        } else if (result.syntheticMessage) {
          userText = result.syntheticMessage;
          // fall through to send as normal message
        } else {
          return;
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    inFlightRef.current = true;
    lastUserMsgRef.current = userText || '';
    setIsProcessing(true);
    setTranscript('');
    setPendingImage(null);
    setQuickReminder(null);
    setSuggestions([]);
    suggestionsAnim.setValue(0);
    setContextChips([]);
    chipAnim.setValue(0);
    if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
    setNotedFact(null);
    setNotedRelationship(null);
    setSavedContact(null);
    setQueuedFollowup(null);

    const opts = {
      chatMode: activeMode,
      driveMode: appSettings.driveMode || activeMode === 'drive',
      personality: appSettings.personality || 'casual',
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

      // Person / relationship detection — store as typed person memories
      const personPatterns = [
        {
          re: /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+is\s+my\s+(.+)$/i,
          extract: m => ({ name: m[1].trim(), fact: `${m[1].trim()} is Mike's ${m[2].trim()}` }),
        },
        {
          re: /^remember\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(likes?|prefers?|hates?)\s+(.+)$/i,
          extract: m => ({ name: m[1].trim(), fact: `${m[1].trim()} ${m[2].trim()} ${m[3].trim()}` }),
        },
        {
          re: /^note\s+that\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(is|works at|lives in|has|owns)\s+(.+)$/i,
          extract: m => ({ name: m[1].trim(), fact: `${m[1].trim()} ${m[2].trim()} ${m[3].trim()}` }),
        },
      ];
      for (const { re: pre, extract: pextract } of personPatterns) {
        const pmatch = userText.match(pre);
        if (pmatch) {
          const { name, fact: pfact } = pextract(pmatch);
          if (pfact.length > 2) {
            addPersonMemory(name, pfact).catch(() => {});
            setNotedRelationship({ name, label: pfact });
            setTimeout(() => setNotedRelationship(null), 3500);
          }
          break;
        }
      }

      // Contact quick-add detection
      const contactPatterns = [
        /add contact:?\s+(.+?),?\s+(\+?[\d\s\-()+]{7,})/i,
        /save contact:?\s+(.+?),?\s+(\+?[\d\s\-()+]{7,})/i,
        /new contact:?\s+(.+?),?\s+(\+?[\d\s\-()+]{7,})/i,
      ];
      for (const cPat of contactPatterns) {
        const cMatch = userText.match(cPat);
        if (cMatch) {
          const cName = cMatch[1].trim().replace(/,\s*$/, '');
          const cPhone = cMatch[2].trim();
          if (cName.length > 0 && cPhone.length >= 7) {
            addContact(cName, cPhone, '').catch(() => {});
            setSavedContact({ name: cName, phone: cPhone });
            setTimeout(() => setSavedContact(null), 4000);
          }
          break;
        }
      }

      // Follow-up detection
      const followupPatterns = [
        /follow up (?:on|with|about) (.+)/i,
        /check (?:in with|on|back with) (.+)/i,
        /get back to (.+)/i,
        /circle back (?:with|on|to) (.+)/i,
        /i'll follow up/i,
      ];
      for (const fpat of followupPatterns) {
        const fmatch = userText.match(fpat);
        if (fmatch) {
          const fuText = fmatch[1] ? fmatch[1].trim() : userText.trim();
          if (fuText.length > 2) {
            addFollowup(fuText).catch(() => {});
            setQueuedFollowup(fuText);
            setTimeout(() => setQueuedFollowup(null), 4000);
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

    // Recall trigger — inject past conversation context when Mike references previous sessions
    const RECALL_PATTERNS = [/remember when/i, /last time/i, /you mentioned/i, /didn't you say/i, /do you recall/i];
    if (!imagePayload && userText) {
      const isRecallRequest = RECALL_PATTERNS.some(re => re.test(userText));
      if (isRecallRequest) {
        setSearchingMemory(true);
        try {
          const recallData = await recallMemory(userText);
          if (recallData.summary) {
            userText = `[CONVERSATION HISTORY FOR CONTEXT]\n${recallData.summary}\n\n[CURRENT MESSAGE]\n${userText}`;
          }
        } catch {
          // If recall fails, continue with original message
        } finally {
          setSearchingMemory(false);
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
            if (meta.lang && meta.lang !== 'english') {
              setDetectedLang(meta.lang);
            } else {
              setDetectedLang(null);
            }
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
            // Task detection — runs after streaming finishes
            const steps = parseTaskSteps(finalText);
            if (steps.length >= 2) {
              setActiveTasks(prev => ({
                ...prev,
                [captainMsgId]: {
                  id: captainMsgId,
                  steps: steps.map(text => ({ text, done: false })),
                  collapsed: false,
                },
              }));
            }
            // Smart suggestions — fetch AI-generated follow-up chips
            if (finalText.length > 30) {
              setSuggestionsLoading(true);
              getSuggestions(finalText, lastUserMsgRef.current).then(data => {
                if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
                  setSuggestions(data.suggestions);
                  suggestionsAnim.setValue(0);
                  Animated.timing(suggestionsAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
                }
              }).catch(() => {}).finally(() => setSuggestionsLoading(false));
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

  const toggleSearch = useCallback(() => {
    setSearchMode(prev => {
      const next = !prev;
      Animated.timing(searchBarHeight, {
        toValue: next ? 48 : 0,
        duration: 250,
        useNativeDriver: false,
      }).start(() => {
        if (next) searchInputRef.current?.focus();
      });
      if (!next) setSearchQuery('');
      return next;
    });
  }, [searchBarHeight]);

  const closeSearch = useCallback(() => {
    Animated.timing(searchBarHeight, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    setSearchMode(false);
    setSearchQuery('');
  }, [searchBarHeight]);

  const filteredMessages = searchMode && searchQuery.trim()
    ? messages.filter(m => m.text && m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const activeModeObj = CHAT_MODES.find(m => m.key === activeMode);
  const effectiveDrive = appSettings.driveMode || activeMode === 'drive';

  const statusText = appSettings.meetingMode
    ? 'Meeting mode — silent'
    : isListening
    ? (isNoteMode ? 'Note mode — release to save' : 'Listening...')
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
          {detectedLang ? (
            <View style={styles.langBadge}>
              <Text style={styles.langBadgeText}>
                {{ spanish: 'ES', french: 'FR', german: 'DE', portuguese: 'PT' }[detectedLang] || detectedLang.slice(0,2).toUpperCase()}
              </Text>
            </View>
          ) : null}
          {searchMode && searchQuery.trim() ? (
            <View style={styles.searchResultBadge}>
              <Text style={[styles.searchResultText, { color: theme.accent }]}>
                {filteredMessages.length} of {messages.length}
              </Text>
            </View>
          ) : null}
          <Pressable onPress={toggleSearch} style={styles.settingsBtn}>
            <MaterialIcons name="search" size={22} color={searchMode ? theme.accent : theme.fgTertiary} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Actions')} style={styles.settingsBtn}>
            <MaterialIcons name="grid-view" size={22} color={theme.fgTertiary} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
            <MaterialIcons name="settings" size={22} color={theme.accent} />
          </Pressable>
          <Pressable onPress={toggleHUD} style={styles.settingsBtn}>
            <MaterialIcons name="fullscreen" size={22} color={theme.fgTertiary} />
          </Pressable>
        </View>
      </View>

      {/* Weather alert banner */}
      {weatherAlert && (
        <Animated.View
          style={[
            styles.weatherAlertBar,
            {
              height: weatherAlertAnim,
              backgroundColor: weatherAlert.severity === 'high' ? 'rgba(234, 88, 12, 0.12)' : 'rgba(234, 179, 8, 0.10)',
              borderColor: weatherAlert.severity === 'high' ? 'rgba(234, 88, 12, 0.30)' : 'rgba(234, 179, 8, 0.28)',
            },
          ]}
        >
          <MaterialIcons
            name={weatherAlert.severity === 'high' ? 'umbrella' : 'wb-cloudy'}
            size={15}
            color={weatherAlert.severity === 'high' ? '#ea580c' : '#ca8a04'}
          />
          <Text
            style={[styles.weatherAlertText, { color: weatherAlert.severity === 'high' ? '#ea580c' : '#ca8a04' }]}
            numberOfLines={1}
          >
            {weatherAlert.alertText}
          </Text>
          <Pressable
            onPress={() => {
              weatherAlertDismissed.current = true;
              Animated.timing(weatherAlertAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setWeatherAlert(null));
            }}
            style={styles.weatherAlertDismiss}
          >
            <MaterialIcons name="close" size={14} color={weatherAlert.severity === 'high' ? '#ea580c' : '#ca8a04'} />
          </Pressable>
        </Animated.View>
      )}

      {/* Search bar */}
      <Animated.View style={[styles.searchBar, { height: searchBarHeight, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        <MaterialIcons name="search" size={18} color={theme.fgTertiary} style={{ marginLeft: 12 }} />
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { color: theme.fgPrimary }]}
          placeholder="Search conversations..."
          placeholderTextColor={theme.fgTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        <Pressable onPress={closeSearch} style={styles.searchClearBtn}>
          <MaterialIcons name="close" size={16} color={theme.fgTertiary} />
        </Pressable>
      </Animated.View>

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
            <PredictiveSuggestions
              theme={theme}
              disabled={isProcessing}
              onSelect={(label) => {
                setTextInput(label);
                handleSend(label);
              }}
            />
          </View>
        ) : (
          filteredMessages.map((msg) => (
            <View key={msg.id}>
              <ConversationItem
                message={msg.text}
                isUser={msg.isUser}
                isSystem={msg.isSystem}
                interactionId={msg.interactionId}
                modelUsed={msg.modelUsed}
                complexity={msg.complexity}
                onFeedback={handleFeedback}
                isStreaming={msg.id === streamingMsgId}
                timestamp={msg.ts}
                highlightText={searchMode && searchQuery.trim() ? searchQuery : undefined}
                onRerun={(text) => {
                  setTextInput(text);
                  setShowKeyboard(true);
                  setRerunHint(true);
                  setTimeout(() => setRerunHint(false), 3000);
                }}
              />
              {!msg.isUser && activeTasks[msg.id] && (
                <TaskCard
                  task={activeTasks[msg.id]}
                  onToggleStep={(stepIdx) => {
                    setActiveTasks(prev => {
                      const t = prev[msg.id];
                      if (!t) return prev;
                      const newSteps = t.steps.map((s, i) => i === stepIdx ? { ...s, done: !s.done } : s);
                      return { ...prev, [msg.id]: { ...t, steps: newSteps } };
                    });
                  }}
                  onToggleCollapse={() => {
                    setActiveTasks(prev => {
                      const t = prev[msg.id];
                      if (!t) return prev;
                      return { ...prev, [msg.id]: { ...t, collapsed: !t.collapsed } };
                    });
                  }}
                />
              )}
            </View>
          ))
        )}
        {isProcessing && <ThinkingDots color={theme.accent} />}
      </ScrollView>

      {/* Searching memory indicator */}
      {searchingMemory && (
        <View style={styles.searchingMemoryBar}>
          <MaterialIcons name="history" size={14} color="#94a3b8" />
          <Text style={styles.searchingMemoryText}>Searching memory...</Text>
        </View>
      )}

      {/* Noted badge — memory stored */}
      {notedFact && (
        <View style={styles.notedBar}>
          <MaterialIcons name="bookmark-added" size={15} color="#818cf8" />
          <Text style={styles.notedText} numberOfLines={1}>Noted: {notedFact}</Text>
        </View>
      )}

      {/* Relationship noted badge — person memory stored */}
      {notedRelationship && (
        <View style={styles.relationshipBar}>
          <MaterialIcons name="person-add" size={15} color="#34d399" />
          <Text style={styles.relationshipText} numberOfLines={1}>Relationship noted: {notedRelationship.name}</Text>
        </View>
      )}

      {/* Contact saved badge */}
      {savedContact && (
        <View style={styles.savedContactBar}>
          <MaterialIcons name="person-add" size={15} color="#38bdf8" />
          <Text style={styles.savedContactText} numberOfLines={1}>Contact saved: {savedContact.name} {savedContact.phone}</Text>
        </View>
      )}

      {/* Follow-up queued badge */}
      {queuedFollowup && (
        <View style={styles.followupQueuedBar}>
          <MaterialIcons name="update" size={15} color="#4ade80" />
          <Text style={styles.followupQueuedText} numberOfLines={1}>Follow-up queued: {queuedFollowup}</Text>
        </View>
      )}

      {/* Rerun hint — shown after swipe-to-rerun populates the input */}
      {rerunHint && (
        <View style={styles.rerunHintBar}>
          <MaterialIcons name="replay" size={15} color={theme.accent} />
          <Text style={[styles.rerunHintText, { color: theme.accent }]}>Tap send to re-run</Text>
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
        <View style={[styles.transcriptBar, isNoteMode && styles.transcriptBarNote]}>
          <Waveform isActive={isListening} color={isNoteMode ? '#22c55e' : '#ff6b35'} />
          {transcript ? (
            <Text style={[styles.transcriptText, isNoteMode && styles.transcriptTextNote]} numberOfLines={1}>{transcript}</Text>
          ) : (
            <Text style={[styles.transcriptText, { opacity: 0.5 }, isNoteMode && styles.transcriptTextNote]}>
              {isNoteMode ? 'Note mode — speak your note...' : 'Listening...'}
            </Text>
          )}
          {isNoteMode && (
            <MaterialIcons name="note-add" size={16} color="#22c55e" />
          )}
        </View>
      ) : null}

            {/* Live transcription overlay card */}
      <LiveTranscriptCard transcript={transcript} isListening={isListening} />

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

      {/* Smart quick-reply suggestion chips */}
      {(suggestionsLoading || suggestions.length > 0) && (
        <Animated.View style={[sugStyles.row, { opacity: suggestionsLoading ? 0.4 : suggestionsAnim }]}>
          {suggestionsLoading ? (
            [0, 1, 2].map(i => (
              <View key={i} style={[sugStyles.chip, sugStyles.chipPlaceholder]} />
            ))
          ) : (
            suggestions.map((label, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  dismissSuggestions();
                  setShowKeyboard(false);
                  handleSend(label);
                }}
                style={({ pressed }) => [
                  sugStyles.chip,
                  {
                    borderColor: theme.accent,
                    backgroundColor: pressed ? theme.accent + '28' : theme.accent + '12',
                  },
                ]}
              >
                <Text style={[sugStyles.chipText, { color: theme.accent }]} numberOfLines={1}>{label}</Text>
              </Pressable>
            ))
          )}
        </Animated.View>
      )}

      {/* Session summary banner */}
      {showSummaryBanner && (
        <View style={styles.summaryBannerBar}>
          <MaterialIcons name="save" size={15} color="#a78bfa" />
          <Text style={styles.summaryBannerText} numberOfLines={1}>
            {summaryLoading ? 'Summarizing...' : 'Summarize session'}
          </Text>
          {!summaryLoading && (
            <Pressable onPress={handleSummarize} style={styles.summaryBannerBtn}>
              <Text style={styles.summaryBannerBtnText}>Save</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              if (summaryDismissTimer.current) clearTimeout(summaryDismissTimer.current);
              setShowSummaryBanner(false);
            }}
            style={styles.summaryBannerDismiss}
          >
            <MaterialIcons name="close" size={14} color="#a78bfa" />
          </Pressable>
        </View>
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

            <Text style={[styles.statusText, { color: isNoteMode ? '#22c55e' : isListening ? '#ff6b35' : theme.fgTertiary }]}>
              {statusText}
            </Text>

            <View style={styles.controlRow}>
              <Pressable onPress={handleBriefing} disabled={isProcessing} style={[styles.sideBtn, { backgroundColor: theme.sideBtnBg, borderColor: theme.sideBtnBorder }]}>
                <MaterialIcons name="wb-sunny" size={22} color="#ffb347" />
              </Pressable>

              <View style={styles.micWrapper}>
                <HUDPulse active={isListening || isSpeaking} color={isNoteMode ? '#22c55e' : theme.accent} />
                <View style={{ zIndex: 1 }}>
                  <Pressable
                    onPressIn={handleMicPressIn}
                    onPressOut={handleMicPressOut}
                    disabled={isProcessing}
                  >
                    <MicButton
                      onPress={handleMicPress}
                      disabled={isProcessing}
                      isListening={isListening}
                      isSpeaking={isSpeaking}
                      color={isNoteMode ? '#22c55e' : theme.accent}
                    />
                  </Pressable>
                </View>
              </View>

              <Pressable onPress={() => setShowKeyboard(true)} style={[styles.sideBtn, { backgroundColor: theme.sideBtnBg, borderColor: theme.sideBtnBorder }]}>
                <MaterialIcons name="keyboard" size={22} color={theme.fgTertiary} />
              </Pressable>
            </View>

            {!isListening && (
              <Text style={[styles.holdHintText, { color: theme.fgTertiary }]}>
                Hold for note
              </Text>
            )}

            {messages.length > 0 && (
              <Pressable onPress={handleClear} style={styles.clearBtn}>
                <MaterialIcons name="delete-outline" size={14} color={theme.fgTertiary} />
                <Text style={[styles.clearText, { color: theme.fgTertiary }]}>Clear</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* Draft loading indicator */}
      {draftLoading && (
        <View style={draftStyles.loadingBar}>
          <MaterialIcons name="edit" size={15} color="#6366f1" />
          <Text style={draftStyles.loadingText}>Generating draft...</Text>
        </View>
      )}

      {/* Draft modal */}
      <Modal
        visible={!!draftModal}
        animationType="slide"
        transparent
        onRequestClose={() => setDraftModal(null)}
      >
        <View style={draftStyles.overlay}>
          <View style={[draftStyles.sheet, { backgroundColor: theme.bg }]}>
            <View style={draftStyles.sheetHeader}>
              <MaterialIcons name="edit" size={18} color="#6366f1" />
              <Text style={[draftStyles.sheetTitle, { color: theme.fgPrimary }]}>
                {'Draft Message'}{draftModal?.recipient ? ` — ${draftModal.recipient}` : ''}
              </Text>
              <Pressable onPress={() => setDraftModal(null)} style={draftStyles.closeBtn}>
                <MaterialIcons name="close" size={20} color={theme.fgTertiary} />
              </Pressable>
            </View>
            <View style={draftStyles.typeRow}>
              <View style={[draftStyles.typeBadge, { backgroundColor: draftModal?.type === 'email' ? 'rgba(99,102,241,0.15)' : 'rgba(52,211,153,0.15)' }]}>
                <MaterialIcons
                  name={draftModal?.type === 'email' ? 'email' : 'sms'}
                  size={12}
                  color={draftModal?.type === 'email' ? '#6366f1' : '#34d399'}
                />
                <Text style={[draftStyles.typeText, { color: draftModal?.type === 'email' ? '#6366f1' : '#34d399' }]}>
                  {draftModal?.type === 'email' ? 'Email' : 'SMS'}
                </Text>
              </View>
            </View>
            <TextInput
              style={[draftStyles.draftInput, { backgroundColor: theme.inputBg, color: theme.fgPrimary, borderColor: theme.inputBorder }]}
              value={draftText}
              onChangeText={setDraftText}
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
            />
            <View style={draftStyles.actionRow}>
              <Pressable
                style={({ pressed }) => [draftStyles.actionBtn, draftStyles.actionBtnCopy, { opacity: pressed ? 0.7 : 1 }]}
                onPress={async () => {
                  await Clipboard.setStringAsync(draftText);
                  Alert.alert('Copied', 'Draft copied to clipboard');
                }}
              >
                <MaterialIcons name="content-copy" size={16} color="#6366f1" />
                <Text style={draftStyles.actionBtnCopyText}>Copy</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [draftStyles.actionBtn, draftStyles.actionBtnShare, { opacity: pressed ? 0.7 : 1 }]}
                onPress={async () => {
                  try {
                    await Share.share({ message: draftText });
                  } catch (e) {
                    Alert.alert('Share Error', e.message);
                  }
                }}
              >
                <MaterialIcons name="share" size={16} color="#fff" />
                <Text style={draftStyles.actionBtnShareText}>Share</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [draftStyles.actionBtn, draftStyles.actionBtnDismiss, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => setDraftModal(null)}
              >
                <Text style={[draftStyles.actionBtnDismissText, { color: theme.fgTertiary }]}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <StatusBar hidden={hudMode} />

      {/* HUD Mode Overlay */}
      {hudMode && (
        <Animated.View
          style={[
            hudStyles.overlay,
            { opacity: hudAnim },
          ]}
          pointerEvents="box-none"
        >
          {/* Top status row */}
          <View style={hudStyles.topRow}>
            <View style={[hudStyles.connDot, { backgroundColor: connected ? '#4ade80' : '#f87171' }]} />
            <Text style={hudStyles.topText}>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={hudStyles.topText}>
              {isListening ? 'Listening' : isSpeaking ? 'Speaking' : isProcessing ? 'Thinking' : 'Standby'}
            </Text>
            <Pressable onPress={toggleHUD} style={hudStyles.closeBtn}>
              <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          {/* Center pulse rings */}
          <View style={hudStyles.centerArea}>
            <View style={hudStyles.ringsWrapper}>
              <HUDPulse active={isListening || isSpeaking} color={isNoteMode ? '#22c55e' : theme.accent} />
            </View>

            {/* Live transcription */}
            <Text style={hudStyles.transcriptText} numberOfLines={4}>
              {isListening
                ? (transcript && transcript.trim() ? transcript : 'Listening...')
                : ''}
            </Text>

            {/* Last Captain response */}
            {(() => {
              const lastAssistant = [...messages].reverse().find(m => !m.isUser && m.text);
              return lastAssistant ? (
                <Text style={hudStyles.captainText} numberOfLines={2}>
                  {lastAssistant.text}
                </Text>
              ) : null;
            })()}
          </View>

          {/* Bottom mic button */}
          <View style={hudStyles.bottomArea}>
            <Pressable
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              disabled={isProcessing}
              style={[
                hudStyles.hudMicBtn,
                {
                  backgroundColor: isListening
                    ? (isNoteMode ? '#22c55e' : theme.accent)
                    : isSpeaking
                    ? theme.accent + 'cc'
                    : 'rgba(255,255,255,0.1)',
                  borderColor: isListening || isSpeaking ? theme.accent : 'rgba(255,255,255,0.25)',
                },
              ]}
            >
              <MaterialIcons
                name={isSpeaking ? 'volume-up' : isListening ? 'mic' : 'mic-none'}
                size={34}
                color={isListening || isSpeaking ? '#fff' : 'rgba(255,255,255,0.7)'}
              />
            </Pressable>
            <Text style={hudStyles.micHint}>
              {isProcessing ? 'Processing...' : isListening ? 'Tap to stop' : isSpeaking ? 'Tap to stop' : 'Tap to speak'}
            </Text>
          </View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}


const draftStyles = StyleSheet.create({
  loadingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  loadingText: { color: '#6366f1', fontSize: 13, fontStyle: 'italic' },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    minHeight: 360,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  sheetTitle: {
    flex: 1, fontSize: 16, fontWeight: '700',
  },
  closeBtn: { padding: 4 },
  typeRow: { marginBottom: 10 },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, alignSelf: 'flex-start',
  },
  typeText: { fontSize: 11, fontWeight: '700' },
  draftInput: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, lineHeight: 22,
    minHeight: 140,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  actionBtnCopy: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)',
    backgroundColor: 'rgba(99,102,241,0.1)', justifyContent: 'center',
  },
  actionBtnCopyText: { color: '#6366f1', fontSize: 14, fontWeight: '600' },
  actionBtnShare: {
    flex: 1, backgroundColor: '#6366f1', justifyContent: 'center',
  },
  actionBtnShareText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actionBtnDismiss: {
    paddingHorizontal: 12, justifyContent: 'center',
  },
  actionBtnDismissText: { fontSize: 14 },
});

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
  langBadge: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
    backgroundColor: 'rgba(99,102,241,0.14)',
    borderColor: 'rgba(99,102,241,0.35)',
  },
  langBadgeText: { fontSize: 11, fontWeight: '700', color: '#818cf8', letterSpacing: 0.5 },
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
  searchingMemoryBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.06)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  searchingMemoryText: { color: '#94a3b8', fontSize: 12, fontStyle: 'italic' },
  notedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.2)',
  },
  notedText: { flex: 1, color: '#818cf8', fontSize: 12, fontStyle: 'italic' },
  relationshipBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.2)',
  },
  relationshipText: { flex: 1, color: '#34d399', fontSize: 12, fontStyle: 'italic' },
  savedContactBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  savedContactText: { flex: 1, color: '#38bdf8', fontSize: 12, fontStyle: 'italic' },
  followupQueuedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  followupQueuedText: { flex: 1, color: '#4ade80', fontSize: 12, fontStyle: 'italic' },
  rerunHintBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  rerunHintText: { fontSize: 12, fontWeight: '500' },
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
  holdHintText: { fontSize: 10, marginTop: 8, opacity: 0.6 },
  transcriptBarNote: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.20)',
  },
  transcriptTextNote: { color: '#22c55e' },
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 0,
    height: '100%',
  },
  searchClearBtn: {
    padding: 10,
  },
  searchResultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  searchResultText: {
    fontSize: 11,
    fontWeight: '600',
  },
  weatherAlertBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  weatherAlertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  weatherAlertDismiss: {
    padding: 4,
  },
});

const taskStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
    overflow: 'hidden',
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    width: '100%',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  headerText: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  completeBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.30)',
  },
  completeBadgeText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
  },
  stepsContainer: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  stepText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
  },
  stepDone: {
    color: '#475569',
    textDecorationLine: 'line-through',
  },
  summaryBannerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 36,
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.22)',
  },
  summaryBannerText: { flex: 1, color: '#a78bfa', fontSize: 13, fontStyle: 'italic' },
  summaryBannerBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  summaryBannerBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  summaryBannerDismiss: { padding: 2 },
});

const sugStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 200,
  },
  chipPlaceholder: {
    width: 100,
    height: 32,
    backgroundColor: 'rgba(128,128,128,0.15)',
    borderColor: 'rgba(128,128,128,0.2)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

const hudStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    backgroundColor: '#080c12',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingBottom: 52,
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  topText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '500',
  },
  closeBtn: {
    marginLeft: 'auto',
    padding: 8,
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 28,
  },
  ringsWrapper: {
    width: 240,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ scale: 3 }],
  },
  transcriptText: {
    color: '#ffffff',
    fontSize: 20,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 30,
    paddingHorizontal: 16,
    minHeight: 32,
  },
  captainText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  bottomArea: {
    alignItems: 'center',
    gap: 14,
  },
  hudMicBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
});