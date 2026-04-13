import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConversationItem from '../components/ConversationItem';
import { sendMessage, sendFeedback, testConnection } from '../services/api';
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

  const handleClear = useCallback(() => {
    Alert.alert('Clear History', 'Clear all conversation history?', [
      { text: 'Cancel' },
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
    ? 'Processing...'
    : isSpeaking
    ? 'Speaking...'
    : 'Ready';

  const micColor = isListening
    ? '#ff9800'
    : isSpeaking
    ? '#9C27B0'
    : isProcessing
    ? '#2196F3'
    : '#2196F3';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Captain</Text>
        <Pressable onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
          <MaterialIcons name="settings" size={24} color="#2196F3" />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.conversation}
        contentContainerStyle={styles.conversationContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="mic" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Tap the mic to start talking to Captain</Text>
          </View>
        ) : (
          messages.map((msg) => (
            <ConversationItem
              key={msg.id}
              message={msg.text}
              isUser={msg.isUser}
              interactionId={msg.interactionId}
              modelUsed={msg.modelUsed}
              onFeedback={handleFeedback}
            />
          ))
        )}
        {isProcessing && (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color="#2196F3" />
            <Text style={styles.thinkingText}>Captain is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {transcript ? (
        <View style={styles.transcriptBar}>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      ) : null}

      <View style={styles.controls}>
        <Text style={[styles.statusText, { color: micColor }]}>{statusText}</Text>

        <Pressable
          onPress={handleMicPress}
          style={[styles.micButton, { backgroundColor: micColor }]}
        >
          <MaterialIcons
            name={isSpeaking ? 'stop' : 'mic'}
            size={32}
            color="white"
          />
        </Pressable>

        {lastModelUsed ? (
          <Text style={styles.modelText}>Using {lastModelUsed}</Text>
        ) : null}

        {messages.length > 0 && (
          <Pressable onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear History</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  settingsBtn: { padding: 8 },
  conversation: { flex: 1 },
  conversationContent: { paddingVertical: 8 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 120 },
  emptyText: { marginTop: 16, fontSize: 16, color: '#999', textAlign: 'center' },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  thinkingText: { marginLeft: 8, color: '#666', fontStyle: 'italic' },
  transcriptBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff3e0',
    borderTopWidth: 1,
    borderTopColor: '#ffe0b2',
  },
  transcriptText: { color: '#e65100', fontStyle: 'italic' },
  controls: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  statusText: { fontSize: 14, marginBottom: 12, fontWeight: '600' },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  modelText: { marginTop: 8, fontSize: 12, color: '#999', fontStyle: 'italic' },
  clearBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f5f5f5', borderRadius: 8 },
  clearText: { color: '#666', fontSize: 14 },
});
