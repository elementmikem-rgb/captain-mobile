import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Animated, StyleSheet, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { addBookmark } from '../services/api';

const COMPLEXITY_COLORS = {
  simple: '#4ade80',
  complex: '#fbbf24',
  deep: '#f472b6',
};

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ConversationItem({ message, isUser, onFeedback, interactionId, modelUsed, complexity, isStreaming, timestamp }) {
  const { theme } = useTheme();
  const [feedbackGiven, setFeedbackGiven] = useState(null);
  const [copied, setCopied] = useState(false);
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  const handleLongPress = useCallback(() => {
    Alert.alert('Message', undefined, [
      {
        text: 'Copy',
        onPress: async () => {
          await Clipboard.setStringAsync(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        },
      },
      ...(!isUser ? [{
        text: 'Save to Bookmarks',
        onPress: async () => {
          try {
            await addBookmark(message, 'captain');
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        },
      }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [message, isUser]);

  useEffect(() => {
    if (!isStreaming) { cursorOpacity.setValue(0); return; }
    cursorOpacity.setValue(1);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isStreaming]);

  const handleFeedback = (helpful) => {
    setFeedbackGiven(helpful);
    onFeedback(interactionId, helpful);
  };

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={[
        styles.container,
        isUser
          ? [styles.userMessage, { backgroundColor: theme.userBubble }]
          : [styles.captainMessage, { backgroundColor: theme.captainBubble, borderColor: theme.captainBorder }],
      ]}
    >
      {copied && (
        <View style={styles.copiedBadge}>
          <Text style={styles.copiedText}>Saved</Text>
        </View>
      )}
      <View style={styles.messageContent}>
        <Text style={[styles.messageText, { color: isUser ? '#fff' : theme.fgSecondary }]}>
          {message}
        </Text>
        {isStreaming && !isUser && (
          <Animated.Text style={[styles.cursor, { color: theme.accent, opacity: cursorOpacity }]}>
            │
          </Animated.Text>
        )}
      </View>

      {timestamp ? (
        <Text style={[styles.timestamp, { color: isUser ? 'rgba(255,255,255,0.45)' : theme.fgTertiary }]}>
          {formatTime(timestamp)}
        </Text>
      ) : null}

      {!isUser && (modelUsed || complexity) ? (
        <View style={styles.metaRow}>
          {modelUsed ? (
            <Text style={[styles.modelTag, { color: theme.fgTertiary }]}>{modelUsed}</Text>
          ) : null}
          {complexity ? (
            <View style={[styles.complexityBadge, { backgroundColor: (COMPLEXITY_COLORS[complexity] || '#666') + '18' }]}>
              <Text style={[styles.complexityText, { color: COMPLEXITY_COLORS[complexity] || '#666' }]}>
                {complexity}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {!isUser && interactionId != null && (
        <View style={styles.feedbackRow}>
          <Pressable
            onPress={() => handleFeedback(true)}
            style={[styles.feedbackBtn, feedbackGiven === true && styles.feedbackActive]}
          >
            <MaterialIcons
              name="thumb-up"
              size={14}
              color={feedbackGiven === true ? '#4ade80' : theme.fgTertiary}
            />
          </Pressable>
          <Pressable
            onPress={() => handleFeedback(false)}
            style={[styles.feedbackBtn, feedbackGiven === false && styles.feedbackActiveBad]}
          >
            <MaterialIcons
              name="thumb-down"
              size={14}
              color={feedbackGiven === false ? '#f87171' : theme.fgTertiary}
            />
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  copiedBadge: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    zIndex: 10,
  },
  copiedText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  userMessage: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 5,
    borderWidth: 0,
  },
  captainMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5,
  },
  messageContent: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  cursor: { fontSize: 15, lineHeight: 22, marginLeft: 1 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  modelTag: {
    fontSize: 11,
  },
  complexityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  complexityText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  feedbackBtn: {
    padding: 6,
    borderRadius: 8,
  },
  feedbackActive: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  feedbackActiveBad: {
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
  },
});
