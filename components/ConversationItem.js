import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function ConversationItem({ message, isUser, onFeedback, interactionId, modelUsed }) {
  return (
    <View style={[styles.container, isUser ? styles.userMessage : styles.captainMessage]}>
      <View style={styles.contentContainer}>
        <Text style={styles.label}>{isUser ? 'You' : 'Captain'}</Text>
        <Text style={styles.messageText}>{message}</Text>
        {!isUser && modelUsed ? (
          <Text style={styles.modelTag}>via {modelUsed}</Text>
        ) : null}
      </View>

      {!isUser && interactionId != null && (
        <View style={styles.feedbackContainer}>
          <Pressable
            onPress={() => onFeedback(interactionId, true)}
            style={styles.feedbackButton}
          >
            <MaterialIcons name="thumb-up" size={16} color="#4CAF50" />
          </Pressable>
          <Pressable
            onPress={() => onFeedback(interactionId, false)}
            style={styles.feedbackButton}
          >
            <MaterialIcons name="thumb-down" size={16} color="#f44336" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    marginHorizontal: 12,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userMessage: {
    backgroundColor: '#e3f2fd',
    borderTopRightRadius: 0,
    marginLeft: 40,
  },
  captainMessage: {
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 0,
    marginRight: 40,
  },
  contentContainer: {
    flex: 1,
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
    fontSize: 13,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  modelTag: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
  feedbackContainer: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  feedbackButton: {
    padding: 6,
    marginLeft: 4,
  },
});
