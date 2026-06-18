import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const BAR_COUNT = 7;

export default function Waveform({ isActive, color }) {
  const heights = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(4))
  ).current;

  useEffect(() => {
    if (!isActive) {
      heights.forEach(h =>
        Animated.timing(h, { toValue: 4, duration: 200, useNativeDriver: false }).start()
      );
      return;
    }

    const intervals = heights.map((h, i) => {
      const animate = () => {
        const target = 6 + Math.random() * 22;
        Animated.timing(h, {
          toValue: target,
          duration: 100 + Math.random() * 120,
          useNativeDriver: false,
        }).start(({ finished }) => { if (finished && isActive) animate(); });
      };
      const delay = setTimeout(animate, i * 60);
      return delay;
    });

    return () => intervals.forEach(clearTimeout);
  }, [isActive]);

  return (
    <View style={styles.container}>
      {heights.map((h, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: h,
              backgroundColor: color,
              opacity: isActive ? 1 : 0.3,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 32,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
});
