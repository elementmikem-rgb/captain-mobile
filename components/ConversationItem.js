import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Animated, StyleSheet, Pressable, Alert, PanResponder, Image } from 'react-native';
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

// --- Card detection helpers ---

function extractLine(text, label) {
  const re = new RegExp(label + '[:\\s]+(.+)', 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function detectWeatherCard(msg) {
  if (!msg.includes('Temperature:') || !msg.includes('Condition:')) return null;
  const temp = extractLine(msg, 'Temperature');
  const condition = extractLine(msg, 'Condition');
  const wind = extractLine(msg, 'Wind');
  if (!temp || !condition) return null;
  return { type: 'weather', temp, condition, wind };
}

function detectExpenseCard(msg) {
  const isExpense = /Expense logged:|Added expense:/i.test(msg);
  if (!isExpense) return null;
  const amount = msg.match(/\$[\d,]+(\.\d{2})?/);
  const category = extractLine(msg, 'Category');
  const description = extractLine(msg, 'Description') || extractLine(msg, 'For');
  return { type: 'expense', amount: amount ? amount[0] : null, category, description };
}

function detectReminderCard(msg) {
  if (!/Reminder set:|I've set a reminder|I have set a reminder/i.test(msg)) return null;
  const timeMatch = msg.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
  const dateMatch = msg.match(/\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
  const reminderText = msg.replace(/Reminder set:|I've set a reminder|I have set a reminder/gi, '').replace(/\./g, '').trim();
  return { type: 'reminder', text: reminderText, time: timeMatch ? timeMatch[0] : null, date: dateMatch ? dateMatch[0] : null };
}

function detectBookingCard(msg) {
  const hasBooking = /booking/i.test(msg);
  const timeMatch = msg.match(/\b\d{1,2}:\d{2}\s*(?:am|pm)?/i);
  if (!hasBooking || !timeMatch) return null;
  const nameMatch = msg.match(/(?:for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  return { type: 'booking', time: timeMatch[0], customer: nameMatch ? nameMatch[1] : null };
}

function detectCard(msg) {
  if (!msg || typeof msg !== 'string') return null;
  return (
    detectWeatherCard(msg) ||
    detectExpenseCard(msg) ||
    detectReminderCard(msg) ||
    detectBookingCard(msg) ||
    null
  );
}

function weatherEmoji(condition) {
  const c = condition.toLowerCase();
  if (/sunny|clear/.test(c)) return '';
  if (/cloud|overcast/.test(c)) return '';
  if (/rain|shower|drizzle/.test(c)) return '';
  if (/snow|blizzard/.test(c)) return '';
  if (/thunder|storm/.test(c)) return '';
  if (/fog|mist/.test(c)) return '';
  if (/wind/.test(c)) return '';
  return '';
}

// --- Card render components ---

function WeatherCard({ data, theme }) {
  return (
    <View style={cardStyles.weatherCard}>
      <View style={cardStyles.weatherTop}>
        <Text style={cardStyles.weatherEmoji}>{weatherEmoji(data.condition)}</Text>
        <Text style={cardStyles.weatherTemp}>{data.temp}</Text>
      </View>
      <Text style={cardStyles.weatherCondition}>{data.condition}</Text>
      {data.wind ? (
        <Text style={cardStyles.weatherWind}>Wind: {data.wind}</Text>
      ) : null}
    </View>
  );
}

function ExpenseCard({ data, theme }) {
  return (
    <View style={cardStyles.expenseCard}>
      <View style={cardStyles.expenseRow}>
        <MaterialIcons name="receipt" size={22} color="#4ade80" />
        {data.amount ? (
          <Text style={cardStyles.expenseAmount}>{data.amount}</Text>
        ) : null}
      </View>
      {data.category ? (
        <View style={cardStyles.categoryChip}>
          <Text style={cardStyles.categoryText}>{data.category}</Text>
        </View>
      ) : null}
      {data.description ? (
        <Text style={cardStyles.expenseDesc}>{data.description}</Text>
      ) : null}
    </View>
  );
}

function ReminderCard({ data, theme }) {
  return (
    <View style={cardStyles.reminderCard}>
      <MaterialIcons name="alarm" size={28} color="#fbbf24" style={cardStyles.reminderIcon} />
      <Text style={cardStyles.reminderText}>{data.text}</Text>
      {(data.time || data.date) ? (
        <Text style={cardStyles.reminderDue}>
          {[data.date, data.time].filter(Boolean).join(' at ')}
        </Text>
      ) : null}
    </View>
  );
}

function BookingCard({ data, theme }) {
  return (
    <View style={cardStyles.bookingCard}>
      <View style={cardStyles.bookingRow}>
        <MaterialIcons name="event" size={26} color="#818cf8" />
        <View style={cardStyles.bookingInfo}>
          {data.customer ? (
            <Text style={cardStyles.bookingCustomer}>{data.customer}</Text>
          ) : null}
          <Text style={cardStyles.bookingTime}>{data.time}</Text>
        </View>
      </View>
    </View>
  );
}

function HighlightedText({ text, highlight, style }) {
  if (!highlight || !highlight.trim() || !text) {
    return <Text style={style}>{text}</Text>;
  }
  const lower = text.toLowerCase();
  const lowerHighlight = highlight.toLowerCase();
  const parts = [];
  let cursor = 0;
  let idx = lower.indexOf(lowerHighlight, cursor);
  while (idx !== -1) {
    if (idx > cursor) {
      parts.push({ text: text.slice(cursor, idx), match: false });
    }
    parts.push({ text: text.slice(idx, idx + highlight.length), match: true });
    cursor = idx + highlight.length;
    idx = lower.indexOf(lowerHighlight, cursor);
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.match ? (
          <Text key={i} style={{ backgroundColor: '#fbbf2440', color: '#fbbf24' }}>
            {part.text}
          </Text>
        ) : (
          <Text key={i}>{part.text}</Text>
        )
      )}
    </Text>
  );
}

export default function ConversationItem({ message, isUser, onFeedback, interactionId, modelUsed, complexity, confidence, isStreaming, timestamp, onRerun, highlightText, isSystem, imageUri, thinkingLabel }) {
  const { theme } = useTheme();
  const [feedbackGiven, setFeedbackGiven] = useState(null);
  const [copied, setCopied] = useState(false);
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  // System messages render as a centered pill — no bubble, no feedback
  if (isSystem) {
    return (
      <View style={systemStyles.row}>
        <View style={systemStyles.pill}>
          <MaterialIcons name="settings" size={11} color="#64748b" style={{ marginRight: 5 }} />
          <Text style={systemStyles.text}>{message}</Text>
          {timestamp ? (
            <Text style={systemStyles.time}>{formatTime(timestamp)}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal swipes left on user messages
        return isUser && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx < -5;
      },
      onPanResponderGrant: () => {
        translateX.setOffset(0);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow leftward drag, clamp at -90
        const clamped = Math.max(-90, Math.min(0, gestureState.dx));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateX.flattenOffset();
        const triggered = gestureState.dx < -50;
        // Spring back to 0
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
        if (triggered && onRerun) {
          onRerun(message);
        }
      },
      onPanResponderTerminate: () => {
        translateX.flattenOffset();
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
      },
    })
  ).current;

  const rerunIconOpacity = translateX.interpolate({
    inputRange: [-60, -20, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  const rerunIconScale = translateX.interpolate({
    inputRange: [-60, -20, 0],
    outputRange: [1, 0.7, 0.5],
    extrapolate: 'clamp',
  });

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

  const card = !isUser ? detectCard(message) : null;

  return (
    <View style={styles.swipeRow} {...(isUser ? panResponder.panHandlers : {})}>
      {/* Replay icon revealed behind the bubble as user swipes left */}
      {isUser && (
        <Animated.View
          style={[
            styles.rerunIconWrap,
            {
              opacity: rerunIconOpacity,
              transform: [{ scale: rerunIconScale }],
            },
          ]}
          pointerEvents="none"
        >
          <MaterialIcons name="replay" size={22} color={theme.accent} />
        </Animated.View>
      )}

      <Animated.View style={isUser ? { transform: [{ translateX }] } : undefined}>
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={[
            styles.container,
            isUser
              ? [styles.userMessage, { backgroundColor: theme.userBubble }]
              : [
                  styles.captainMessage,
                  card ? styles.cardContainer : null,
                  !card ? { backgroundColor: theme.captainBubble, borderColor: theme.captainBorder } : null,
                ],
          ]}
        >
          {copied && (
            <View style={styles.copiedBadge}>
              <Text style={styles.copiedText}>Saved</Text>
            </View>
          )}
          {card ? (
            <>
              {card.type === 'weather' && <WeatherCard data={card} theme={theme} />}
              {card.type === 'expense' && <ExpenseCard data={card} theme={theme} />}
              {card.type === 'reminder' && <ReminderCard data={card} theme={theme} />}
              {card.type === 'booking' && <BookingCard data={card} theme={theme} />}
            </>
          ) : (
            <View style={styles.messageContent}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.inlineImage} resizeMode="cover" />
              ) : null}
              {thinkingLabel && !message ? (
                <Text style={[styles.thinkingLabel, { color: theme.fgTertiary }]}>{thinkingLabel}</Text>
              ) : (
                <HighlightedText
                  text={message}
                  highlight={highlightText}
                  style={[styles.messageText, { color: isUser ? '#fff' : theme.fgSecondary }]}
                />
              )}
              {isStreaming && !isUser && !thinkingLabel && (
                <Animated.Text style={[styles.cursor, { color: theme.accent, opacity: cursorOpacity }]}>
                  │
                </Animated.Text>
              )}
            </View>
          )}

          {timestamp ? (
            <Text style={[styles.timestamp, { color: isUser ? 'rgba(255,255,255,0.45)' : theme.fgTertiary }]}>
              {formatTime(timestamp)}
            </Text>
          ) : null}

          {!isUser && (modelUsed || complexity || confidence === 'medium' || confidence === 'low') ? (
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
              {confidence === 'medium' ? (
                <View style={styles.confidenceBadgeMedium}>
                  <Text style={styles.confidenceSymbolMedium}>~</Text>
                  <Text style={styles.confidenceTextMedium}>Estimated</Text>
                </View>
              ) : null}
              {confidence === 'low' ? (
                <View style={styles.confidenceBadgeLow}>
                  <Text style={styles.confidenceSymbolLow}>?</Text>
                  <Text style={styles.confidenceTextLow}>Uncertain</Text>
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  rerunIconWrap: {
    position: 'absolute',
    right: 8,
    zIndex: 0,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    marginVertical: 4,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: 'transparent',
    zIndex: 1,
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
  confidenceBadgeMedium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  confidenceSymbolMedium: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    lineHeight: 14,
  },
  confidenceTextMedium: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94a3b8',
    letterSpacing: 0.3,
  },
  confidenceBadgeLow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  confidenceSymbolLow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fbbf24',
    lineHeight: 14,
  },
  confidenceTextLow: {
    fontSize: 10,
    fontWeight: '500',
    color: '#fbbf24',
    letterSpacing: 0.3,
  },
  cardContainer: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  inlineImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginBottom: 6,
  },
  thinkingLabel: {
    fontSize: 13,
    fontStyle: 'italic',
    opacity: 0.6,
  },
});

const systemStyles = StyleSheet.create({
  row: {
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(100,116,139,0.10)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.18)',
  },
  text: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  time: {
    color: '#475569',
    fontSize: 10,
    marginLeft: 8,
  },
});

const cardStyles = StyleSheet.create({
  // Weather card
  weatherCard: {
    backgroundColor: 'rgba(56, 112, 200, 0.18)',
    borderRadius: 16,
    padding: 16,
    minWidth: 180,
  },
  weatherTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  weatherEmoji: {
    fontSize: 36,
  },
  weatherTemp: {
    fontSize: 32,
    fontWeight: '700',
    color: '#e0eaff',
  },
  weatherCondition: {
    fontSize: 15,
    color: '#c7d7f7',
    fontWeight: '500',
    marginBottom: 4,
  },
  weatherWind: {
    fontSize: 12,
    color: '#a0b4d8',
    marginTop: 2,
  },

  // Expense card
  expenseCard: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.25)',
    minWidth: 160,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4ade80',
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4ade80',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expenseDesc: {
    fontSize: 13,
    color: '#a7c5a7',
  },

  // Reminder card
  reminderCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    minWidth: 180,
    alignItems: 'flex-start',
  },
  reminderIcon: {
    marginBottom: 6,
  },
  reminderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fde68a',
    marginBottom: 4,
    flexShrink: 1,
  },
  reminderDue: {
    fontSize: 12,
    color: '#d4a908',
    marginTop: 2,
  },

  // Booking card
  bookingCard: {
    backgroundColor: 'rgba(129, 140, 248, 0.1)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
    minWidth: 180,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookingInfo: {
    flexShrink: 1,
  },
  bookingCustomer: {
    fontSize: 15,
    fontWeight: '700',
    color: '#c7d2fe',
    marginBottom: 2,
  },
  bookingTime: {
    fontSize: 13,
    color: '#a5b4fc',
    fontWeight: '500',
  },
});
