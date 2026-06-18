import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';
import ActionsScreen from './screens/ActionsScreen';
import InsightsScreen from './screens/InsightsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { theme, isDark } = useTheme();
  const [onboardingDone, setOnboardingDone] = useState(null); // null = loading

  useEffect(() => {
    AsyncStorage.getItem('captain_onboarding_complete').then((val) => {
      setOnboardingDone(val === 'true');
    });
  }, []);

  // Wait until we know onboarding status before rendering the navigator
  // to avoid a flash of the wrong screen
  if (onboardingDone === null) return null;

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
