import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const COMPLEXITY_COLORS = {
  simple: '#4ade80',
  complex: '#fbbf24',
  deep: '#f472b6',
};

export default function ConversationItem({ message, isUser, onFeedback, interactionId, modelUsed, complexity }) {
  const [feedbackGiven, setFeedbackGiven] = useState(null);

  const handleFeedback = (helpful) => {
    setFeedbackGiven(helpful);
    onFeedback(interactionId, helpful);
  };

  return (
    <View style={[styles.container, isUser ? styles.userMessage : styles.captainMessage]}>
      <Text style={[styles.messageText, isUser && styles.userText]}>{message}</Text>

      {!isUser && (modelUsed || complexity) ? (
        <View style={styles.metaRow}>
          {modelUsed ? (
            <Text style={styles.modelTag}>{modelUsed}</Text>
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
              color={feedbackGiven === true ? '#4ade80' : '#444'}
            />
          </Pressable>
          <Pressable
            onPress={() => handleFeedback(false)}
            style={[styles.feedbackBtn, feedbackGiven === false && styles.feedbackActiveBad]}
          >
            <MaterialIcons
              name="thumb-down"
              size={14}
              color={feedbackGiven === false ? '#f87171' : '#444'}
            />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    maxWidth: '85%',
  },
  userMessage: {
    backgroundColor: '#6c9cff',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  captainMessage: {
    backgroundColor: '#151b2b',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#ddd',
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  modelTag: {
    fontSize: 11,
    color: '#555',
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
