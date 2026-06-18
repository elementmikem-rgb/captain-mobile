import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
let LocalAuthentication = null;
try { LocalAuthentication = require('expo-local-authentication'); } catch {}
import { MaterialIcons } from '@expo/vector-icons';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';
import ActionsScreen from './screens/ActionsScreen';
import InsightsScreen from './screens/InsightsScreen';
import ActivityLogScreen from './screens/ActivityLogScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import SearchScreen from './screens/SearchScreen';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const Stack = createNativeStackNavigator();

const SETTINGS_KEY = 'captain_settings';

function LockScreen({ onUnlock, biometricType, authUnavailable }) {
  const { theme } = useTheme();
  const [authFailed, setAuthFailed] = useState(false);

  const typeLabel =
    LocalAuthentication && biometricType === LocalAuthentication.AuthenticationType?.FACIAL_RECOGNITION
      ? 'Face ID'
      : LocalAuthentication && biometricType === LocalAuthentication.AuthenticationType?.FINGERPRINT
      ? 'Touch ID / Fingerprint'
      : 'Biometrics';

  const handleUnlock = useCallback(async () => {
    setAuthFailed(false);
    try {
      const result = await LocalAuthentication?.authenticateAsync({
        promptMessage: 'Unlock Captain',
        fallbackLabel: 'Use passcode',
      });
      if (result.success) {
        onUnlock();
      } else {
        setAuthFailed(true);
      }
    } catch {
      setAuthFailed(true);
    }
  }, [onUnlock]);

  return (
    <View style={[lockStyles.container, { backgroundColor: '#0a0a0f' }]}>
      <View style={[lockStyles.iconCircle, { borderColor: theme.accent }]}>
        <MaterialIcons name="security" size={40} color={theme.accent} />
      </View>
      <Text style={lockStyles.title}>Captain is locked</Text>
      <Text style={[lockStyles.subtitle, { color: theme.accent + 'cc' }]}>{typeLabel}</Text>
      {authUnavailable && (
        <Text style={lockStyles.errorText}>Biometrics unavailable on this device. Disable Biometric Lock in Settings to proceed.</Text>
      )}
      {authFailed && !authUnavailable && (
        <Text style={lockStyles.errorText}>Authentication failed. Try again.</Text>
      )}
      <Pressable
        onPress={handleUnlock}
        style={[lockStyles.unlockBtn, { backgroundColor: theme.accent }]}
      >
        <MaterialIcons name="fingerprint" size={20} color="#000" />
        <Text style={lockStyles.unlockText}>Unlock</Text>
      </Pressable>
      <Text style={lockStyles.version}>Version 2.2.0</Text>
    </View>
  );
}

const lockStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 13,
    color: '#f87171',
    fontWeight: '500',
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  unlockText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  version: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: '#444',
    fontWeight: '500',
  },
});

function AppNavigator() {
  const { theme, isDark } = useTheme();
  const [onboardingDone, setOnboardingDone] = useState(null); // null = loading
  const [isLocked, setIsLocked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState(null);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  // Attempt biometric authentication
  const authenticate = useCallback(async () => {
    if (!LocalAuthentication) {
      // Module unavailable — leave locked, LockScreen shows retry
      setAuthUnavailable(true);
      return;
    }
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Captain',
        fallbackLabel: 'Use passcode',
      });
      if (result.success) {
        setIsLocked(false);
      }
      // On failure we leave isLocked = true; LockScreen shows retry button
    } catch {
      // Leave locked; user can tap Unlock to retry
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Load onboarding status
      const onboarding = await AsyncStorage.getItem('captain_onboarding_complete');
      setOnboardingDone(onboarding === 'true');

      // Load biometric setting
      try {
        const saved = await AsyncStorage.getItem(SETTINGS_KEY);
        const settings = saved ? JSON.parse(saved) : {};
        const enabled = settings.biometricLock === true && LocalAuthentication != null;
        setBiometricEnabled(enabled);

        if (enabled) {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          if (hasHardware && isEnrolled) {
            const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
            if (types.length > 0) setBiometricType(types[0]);
            setIsLocked(true);
            authenticate();
          }
        }
      } catch {
        // Biometric setup failed silently — app opens normally
      }
    })();
  }, [authenticate]);

  // Lock when app goes to background, re-authenticate on foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'background' && biometricEnabled) {
        setIsLocked(true);
      }

      if (
        (prev === 'background' || prev === 'inactive') &&
        nextState === 'active' &&
        biometricEnabled
      ) {
        // Will be locked already from the background handler above
        authenticate();
      }
    });
    return () => subscription.remove();
  }, [biometricEnabled, authenticate]);

  // Wait until we know onboarding status before rendering the navigator
  // to avoid a flash of the wrong screen
  if (onboardingDone === null) return null;

  // Show lock screen if locked
  if (isLocked) {
    return <LockScreen onUnlock={authenticate} biometricType={biometricType} authUnavailable={authUnavailable} />;
  }

  const navTheme = {
    ...(isDark ? NavDarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? NavDarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
      card: theme.bg,
      text: theme.fgPrimary,
      border: theme.divider,
      primary: theme.accent,
    },
  };

  return (
    <>
      <StatusBar style={theme.statusBar} />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator>
          {!onboardingDone ? (
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ headerShown: false }}
            />
          ) : null}
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              title: 'Settings',
              headerStyle: { backgroundColor: theme.bg },
              headerTintColor: theme.fgPrimary,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="Actions"
            component={ActionsScreen}
            options={{
              title: 'Quick Actions',
              headerStyle: { backgroundColor: theme.bg },
              headerTintColor: theme.fgPrimary,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="Insights"
            component={InsightsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ActivityLog"
            component={ActivityLogScreen}
            options={{
              title: "Captain's Log",
              headerStyle: { backgroundColor: theme.bg },
              headerTintColor: theme.fgPrimary,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}
