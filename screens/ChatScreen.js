import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConversationItem from '../components/ConversationItem';
import { sendMessage, sendFeedback, testConnection, getBriefing, registerPushToken } from '../services/api';
import {
  requestPermissions,
  startListening,
  stopListening,
  speak,
  cancelSpeech,
  useSpeechRecognitionEvent,
} from '../services/voice';

const STORAGE_KEY = 'captain_messages';

export default function ChatScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastModelUsed, setLastModelUsed] = useState('');
  const [transcript, setTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
      const ok = await testConnection();
      if (!ok) {
        Alert.alert(
          'Connection Error',
          'Cannot reach Captain backend. Check Settings.',
          [{ text: 'Settings', onPress: () => navigation.navigate('Settings') }]
        );
      }
      try {
        const Notifications = require('expo-notifications');
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          await registerPushToken(tokenData.data);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript || '';
    setTranscript(text);
    if (event.isFinal) {
      setIsListening(false);
      if (text.trim()) handleSend(text.trim());
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
    setTranscript('');
    setIsListening(true);
    startListening();
  }, [isListening, isSpeaking]);

  const handleSend = useCallback(async (userText) => {
    setIsProcessing(true);
    setTranscript('');

    const userMsg = { id: Date.now(), text: userText, isUser: true };
    const updated = [...messages, userMsg];
    setMessages(updated);

    try {
      const data = await sendMessage(userText);
      const captainMsg = {
        id: Date.now() + 1,
        text: data.response,
        isUser: false,
        interactionId: data.interaction_id,
        modelUsed: data.model_used,
        complexity: data.complexity,
      };
      const final = [...updated, captainMsg];
      setMessages(final);
      setLastModelUsed(data.model_used || '');
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(final));

      setIsSpeaking(true);
      await speak(data.response);
      setIsSpeaking(false);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  }, [messages]);

  const handleFeedback = useCallback(async (interactionId, helpful) => {
    try {
      await sendFeedback(interactionId, helpful);
    } catch {}
  }, []);

  const handleBriefing = useCallback(async () => {
    setIsProcessing(true);
    try {
      const hour = new Date().getHours();
      const type = hour < 15 ? 'morning' : 'evening';
      const data = await getBriefing(type);
      const briefingMsg = {
        id: Date.now(),
        text: data.text,
        isUser: false,
        modelUsed: 'Briefing',
      };
      const updated = [...messages, briefingMsg];
      setMessages(updated);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setIsSpeaking(true);
      await speak(data.text);
      setIsSpeaking(false);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  }, [messages]);

  const handleTextSend = useCallback(() => {
    const text = textInput.trim();
    if (!text || isProcessing) return;
    setTextInput('');
    handleSend(text);
  }, [textInput, isProcessing, handleSend]);

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

  const statusText = isListening
    ? 'Listening...'
    : isProcessing
    ? 'Thinking...'
    : isSpeaking
    ? 'Speaking...'
    : 'Tap to speak';

  const micBg = isListening
    ? '#ff6b35'
    : isSpeaking
    ? '#8b5cf6'
    : '#6c9cff';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Captain</Text>
          {lastModelUsed ? (
            <Text style={styles.subtitle}>{lastModelUsed}</Text>
          ) : null}
        </View>
        <Pressable onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
          <MaterialIcons name="settings" size={22} color="#6c9cff" />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.conversation}
        contentContainerStyle={styles.conversationContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialIcons name="assistant" size={48} color="#6c9cff" />
            </View>
            <Text style={styles.emptyTitle}>Hey Mike</Text>
            <Text style={styles.emptyText}>Speak or type to start a conversation</Text>
            <Pressable onPress={handleBriefing} disabled={isProcessing} style={styles.emptyBriefingBtn}>
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
            />
          ))
        )}
        {isProcessing && (
          <View style={styles.thinkingRow}>
            <View style={styles.thinkingDot} />
            <View style={[styles.thinkingDot, { opacity: 0.6 }]} />
            <View style={[styles.thinkingDot, { opacity: 0.3 }]} />
          </View>
        )}
      </ScrollView>

      {transcript ? (
        <View style={styles.transcriptBar}>
          <MaterialIcons name="mic" size={14} color="#ff6b35" />
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      ) : null}

      <View style={styles.controls}>
        {showKeyboard ? (
          <View style={styles.inputRow}>
            <Pressable onPress={() => setShowKeyboard(false)} style={styles.inputSideBtn}>
              <MaterialIcons name="mic" size={22} color="#6c9cff" />
            </Pressable>
            <TextInput
              style={styles.textInput}
              placeholder="Message Captain..."
              placeholderTextColor="#555"
              value={textInput}
              onChangeText={setTextInput}
              onSubmitEditing={handleTextSend}
              returnKeyType="send"
              autoFocus
              editable={!isProcessing}
            />
            <Pressable onPress={handleTextSend} disabled={!textInput.trim() || isProcessing} style={styles.sendBtn}>
              <MaterialIcons name="send" size={20} color={textInput.trim() ? '#6c9cff' : '#333'} />
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.statusText}>{statusText}</Text>
            <View style={styles.controlRow}>
              <Pressable onPress={handleBriefing} disabled={isProcessing} style={styles.sideBtn}>
                <MaterialIcons name="wb-sunny" size={22} color="#ffb347" />
              </Pressable>

              <Pressable
                onPress={handleMicPress}
                style={[styles.micButton, { backgroundColor: micBg }]}
              >
                <MaterialIcons
                  name={isSpeaking ? 'stop' : isListening ? 'mic' : 'mic-none'}
                  size={36}
                  color="#fff"
                />
              </Pressable>

              <Pressable onPress={() => setShowKeyboard(true)} style={styles.sideBtn}>
                <MaterialIcons name="keyboard" size={22} color="#666" />
              </Pressable>
            </View>
            {messages.length > 0 && (
              <Pressable onPress={handleClear} style={styles.clearBtn}>
                <MaterialIcons name="delete-outline" size={14} color="#555" />
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0e17' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#6c9cff', marginTop: 2 },
  settingsBtn: { padding: 8 },
  conversation: { flex: 1 },
  conversationContent: { paddingVertical: 8, flexGrow: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(108, 156, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 22, fontWeight: '600', color: '#fff', marginBottom: 8 },
  emptyText: { fontSize: 15, color: '#666', textAlign: 'center' },
  emptyBriefingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 179, 71, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 71, 0.2)',
  },
  emptyBriefingText: { fontSize: 14, color: '#ffb347', fontWeight: '500' },
  thinkingRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  thinkingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6c9cff',
  },
  transcriptBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.15)',
  },
  transcriptText: { color: '#ff6b35', fontSize: 14, flex: 1 },
  controls: {
    alignItems: 'center',
    paddingBottom: 36,
    paddingTop: 16,
  },
  statusText: { fontSize: 13, color: '#555', marginBottom: 16, fontWeight: '500' },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#6c9cff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearText: { color: '#555', fontSize: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 12,
  },
  inputSideBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(108, 156, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    paddingHorizontal: 18,
    color: '#ffffff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
