import React, { useEffect, useRef } from 'react';
import { View, Pressable, Animated, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function MicButton({ onPress, disabled, isListening, isSpeaking, color }) {
  const s0 = useRef(new Animated.Value(1)).current;
  const s1 = useRef(new Animated.Value(1)).current;
  const s2 = useRef(new Animated.Value(1)).current;
  const o0 = useRef(new Animated.Value(0)).current;
  const o1 = useRef(new Animated.Value(0)).current;
  const o2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isListening) {
      [s0, s1, s2].forEach(s => s.setValue(1));
      [o0, o1, o2].forEach(o => o.setValue(0));
      return;
    }

    o0.setValue(0.5); o1.setValue(0.5); o2.setValue(0.5);

    const makeLoop = (scale, opacity, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, { toValue: 2.4, duration: 1200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );

    const a0 = makeLoop(s0, o0, 0);
    const a1 = makeLoop(s1, o1, 400);
    const a2 = makeLoop(s2, o2, 800);
    a0.start(); a1.start(); a2.start();
    return () => { a0.stop(); a1.stop(); a2.stop(); };
  }, [isListening]);

  const btnColor = isListening ? '#ff6b35' : isSpeaking ? '#8b5cf6' : color;

  return (
    <View style={styles.wrapper}>
      {[[s0, o0], [s1, o1], [s2, o2]].map(([scale, opacity], i) => (
        <Animated.View
          key={i}
          style={[styles.ring, { borderColor: btnColor, opacity, transform: [{ scale }] }]}
        />
      ))}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.btn, { backgroundColor: btnColor, shadowColor: btnColor }]}
      >
        <MaterialIcons
          name={isSpeaking ? 'stop' : isListening ? 'mic' : 'mic-none'}
          size={36}
          color="#fff"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 1.5,
  },
  btn: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
});
