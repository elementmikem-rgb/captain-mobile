import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addMemory } from '../services/api';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 4;

const ROLES = [
  { key: 'Business Owner', icon: 'business-center' },
  { key: 'Freelancer',     icon: 'laptop' },
  { key: 'Professional',   icon: 'work' },
  { key: 'Other',          icon: 'person' },
];

const PRIORITIES = [
  { key: 'Bookings & Scheduling', icon: 'event' },
  { key: 'Tasks & Reminders',     icon: 'checklist' },
  { key: 'Quick Questions',       icon: 'chat-bubble-outline' },
];

const PERSONALITIES = [
  {
    key: 'professional',
    icon: 'business-center',
    label: 'Professional',
    example: '"Understood, sir. I\'ll handle that."',
  },
  {
    key: 'casual',
    icon: 'chat-bubble-outline',
    label: 'Casual',
    example: '"Got it! On it."',
  },
  {
    key: 'direct',
    icon: 'flash-on',
    label: 'Direct',
    example: '"Done."',
  },
];

export default function OnboardingScreen({ navigation }) {
  const { theme } = useTheme();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [priority, setPriority] = useState('');
  const [personality, setPersonality] = useState('');
  const [saving, setSaving] = useState(false);

  // Slide animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateToStep = (nextStep) => {
    const direction = nextStep > step ? 1 : -1;
    // Slide out current
    Animated.timing(slideAnim, {
      toValue: -direction * SCREEN_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      // Reset to right/left off-screen, then slide in
      slideAnim.setValue(direction * SCREEN_WIDTH);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    });
  };

  const canAdvance = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return role !== '';
    if (step === 2) return priority !== '';
    if (step === 3) return personality !== '';
    return false;
  };

  const handleContinue = async () => {
    if (!canAdvance()) return;

    if (step < TOTAL_STEPS - 1) {
      animateToStep(step + 1);
      return;
    }

    // Final step — save and complete
    setSaving(true);
    try {
      const profile = {
        name: name.trim(),
        role,
        priority,
        personality,
      };

      // Persist completion flag and profile
      await AsyncStorage.multiSet([
        ['captain_onboarding_complete', 'true'],
        ['captain_user_profile', JSON.stringify(profile)],
      ]);

      // Save personality setting so SettingsScreen reflects it
      const existingSettingsRaw = await AsyncStorage.getItem('captain_settings');
      const existingSettings = existingSettingsRaw ? JSON.parse(existingSettingsRaw) : {};
      await AsyncStorage.setItem(
        'captain_settings',
        JSON.stringify({ ...existingSettings, personality }),
      );

      // Push full profile to Captain backend
      try {
        const apiUrl = (await AsyncStorage.getItem('captain_api_url')) || 'https://callova.live/captain';
        const apiKey = (await AsyncStorage.getItem('captain_api_key')) || '';
        await fetch(`${apiUrl}/api/onboarding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify(profile),
        });
      } catch {
        // Non-fatal — backend sync can fail if unreachable during setup
      }

      // Also store as a single memory fact for conversational recall
      try {
        await addMemory(
          `My name is ${profile.name}, I am a ${profile.role}. My top priority is ${profile.priority}.`,
        );
      } catch {}

      // Navigate — pass profile so ChatScreen can inject a personalized welcome
      navigation.replace('Chat', { welcomeProfile: profile });
    } catch (e) {
      setSaving(false);
      // Let the user try again
    }
  };

  const StepDots = () => (
    <View style={styles.dotsRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor:
                i === step
                  ? theme.accent
                  : i < step
                  ? theme.accent + '55'
                  : theme.divider,
              width: i === step ? 20 : 8,
            },
          ]}
        />
      ))}
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.heading, { color: theme.fgPrimary }]}>
              What should I call you?
            </Text>
            <TextInput
              style={[
                styles.nameInput,
                {
                  color: theme.fgPrimary,
                  borderColor: name ? theme.accent : theme.inputBorder,
                  backgroundColor: theme.inputBg,
                },
              ]}
              placeholder="Your first name"
              placeholderTextColor={theme.fgTertiary}
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
            <Text style={[styles.subtext, { color: theme.fgTertiary }]}>
              I'll remember this for our conversations.
            </Text>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.heading, { color: theme.fgPrimary }]}>
              What do you do?
            </Text>
            <View style={styles.grid2x2}>
              {ROLES.map((r) => {
                const active = role === r.key;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => setRole(r.key)}
                    style={[
                      styles.card,
                      {
                        borderColor: active ? theme.accent : theme.divider,
                        backgroundColor: active
                          ? theme.accent + '18'
                          : theme.sectionBg,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={r.icon}
                      size={28}
                      color={active ? theme.accent : theme.fgTertiary}
                    />
                    <Text
                      style={[
                        styles.cardLabel,
                        { color: active ? theme.accent : theme.fgSecondary },
                      ]}
                    >
                      {r.key}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.subtext, { color: theme.fgTertiary }]}>
              I'll tailor my responses to help you best.
            </Text>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.heading, { color: theme.fgPrimary }]}>
              What matters most to you?
            </Text>
            <View style={styles.listOptions}>
              {PRIORITIES.map((p) => {
                const active = priority === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPriority(p.key)}
                    style={[
                      styles.listCard,
                      {
                        borderColor: active ? theme.accent : theme.divider,
                        backgroundColor: active
                          ? theme.accent + '18'
                          : theme.sectionBg,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.listIconWrap,
                        {
                          backgroundColor: active
                            ? theme.accent + '22'
                            : theme.inputBg,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={p.icon}
                        size={22}
                        color={active ? theme.accent : theme.fgTertiary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.listCardLabel,
                        { color: active ? theme.accent : theme.fgSecondary },
                      ]}
                    >
                      {p.key}
                    </Text>
                    {active && (
                      <MaterialIcons
                        name="check-circle"
                        size={20}
                        color={theme.accent}
                        style={styles.listCheck}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.subtext, { color: theme.fgTertiary }]}>
              I'll focus on what you need.
            </Text>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.heading, { color: theme.fgPrimary }]}>
              How should I sound?
            </Text>
            <View style={styles.listOptions}>
              {PERSONALITIES.map((p) => {
                const active = personality === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPersonality(p.key)}
                    style={[
                      styles.listCard,
                      {
                        borderColor: active ? theme.accent : theme.divider,
                        backgroundColor: active
                          ? theme.accent + '18'
                          : theme.sectionBg,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.listIconWrap,
                        {
                          backgroundColor: active
                            ? theme.accent + '22'
                            : theme.inputBg,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={p.icon}
                        size={22}
                        color={active ? theme.accent : theme.fgTertiary}
                      />
                    </View>
                    <View style={styles.personalityTextWrap}>
                      <Text
                        style={[
                          styles.listCardLabel,
                          { color: active ? theme.accent : theme.fgSecondary },
                        ]}
                      >
                        {p.label}
                      </Text>
                      <Text
                        style={[
                          styles.personalityExample,
                          { color: theme.fgTertiary },
                        ]}
                      >
                        {p.example}
                      </Text>
                    </View>
                    {active && (
                      <MaterialIcons
                        name="check-circle"
                        size={20}
                        color={theme.accent}
                        style={styles.listCheck}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.subtext, { color: theme.fgTertiary }]}>
              You can change this any time in Settings.
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  const isLastStep = step === TOTAL_STEPS - 1;
  const ready = canAdvance();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Step dots */}
        <StepDots />

        {/* Sliding content */}
        <Animated.View
          style={[
            styles.slideWrapper,
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          {renderStep()}
        </Animated.View>

        {/* Continue / Let's Go button */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleContinue}
            disabled={!ready || saving}
            style={[
              styles.continueBtn,
              {
                backgroundColor: ready ? theme.accent : theme.divider,
                opacity: saving ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.continueBtnText,
                { color: ready ? '#fff' : theme.fgTertiary },
              ]}
            >
              {saving ? 'Setting up...' : isLastStep ? "Let's Go" : 'Continue'}
            </Text>
            {!saving && (
              <MaterialIcons
                name={isLastStep ? 'send' : 'arrow-forward'}
                size={18}
                color={ready ? '#fff' : theme.fgTertiary}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 20,
    paddingBottom: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },

  slideWrapper: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },

  stepContent: {
    alignItems: 'center',
    gap: 24,
  },

  heading: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 36,
  },

  nameInput: {
    width: '100%',
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderRadius: 16,
  },

  subtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // 2x2 grid for roles
  grid2x2: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  card: {
    width: '46%',
    aspectRatio: 1.1,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Vertical list options (priorities + personalities)
  listOptions: {
    width: '100%',
    gap: 10,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  listIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listCardLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  listCheck: {
    flexShrink: 0,
  },

  personalityTextWrap: {
    flex: 1,
    gap: 2,
  },
  personalityExample: {
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Footer button
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 36,
    paddingTop: 16,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
