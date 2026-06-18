import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';
import ActionsScreen from './screens/ActionsScreen';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { theme, isDark } = useTheme();

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
