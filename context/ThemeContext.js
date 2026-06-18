import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'captain_theme';

export const PALETTE = {
  blue:    { label: 'Blue',    accent: '#5a8aff', darkBg: '#070b12', lightBg: '#f0f4ff' },
  emerald: { label: 'Emerald', accent: '#22c77a', darkBg: '#060e0a', lightBg: '#edfaf4' },
  violet:  { label: 'Violet',  accent: '#8b5cf6', darkBg: '#08060f', lightBg: '#f4f0ff' },
  amber:   { label: 'Amber',   accent: '#d97706', darkBg: '#0e0900', lightBg: '#fffbf0' },
  rose:    { label: 'Rose',    accent: '#e11d48', darkBg: '#0f0608', lightBg: '#fff0f2' },
  jarvis:  {
    label: 'HUD',
    accent: '#00d4ff',
    darkBg: '#080c12',
    lightBg: '#e8f4ff',
    // Dark-mode overrides for the cinematic Jarvis HUD look
    dark: {
      cardBg:         '#0d1520',
      sectionBg:      '#0d1520',
      userBubble:     '#0d2657',
      captainBubble:  '#0a1628',
      captainBorder:  '#00d4ff40',
      fgPrimary:      '#e0f4ff',
      fgSecondary:    '#a8d4e8',
      fgTertiary:     '#3a6070',
      divider:        'rgba(0,212,255,0.08)',
      inputBg:        '#0a1628',
      inputBorder:    'rgba(0,212,255,0.25)',
      sideBtnBg:      'rgba(0,212,255,0.06)',
      sideBtnBorder:  'rgba(0,212,255,0.15)',
      switchTrackOn:  '#00d4ff40',
      switchTrackOff: '#0d1a2a',
      switchThumbOff: '#1d4ed8',
    },
  },
};

function buildTheme(colorKey, isDark) {
  const p = PALETTE[colorKey] || PALETTE.blue;
  if (isDark) {
    const o = p.dark || {};
    return {
      bg:             p.darkBg,
      cardBg:         o.cardBg         ?? p.accent + '12',
      sectionBg:      o.sectionBg      ?? '#111827',
      accent:         p.accent,
      userBubble:     o.userBubble     ?? p.accent,
      captainBubble:  o.captainBubble  ?? p.accent + '12',
      captainBorder:  o.captainBorder  ?? p.accent + '20',
      fgPrimary:      o.fgPrimary      ?? '#ffffff',
      fgSecondary:    o.fgSecondary    ?? '#e8e8e8',
      fgTertiary:     o.fgTertiary     ?? '#555555',
      divider:        o.divider        ?? 'rgba(255,255,255,0.07)',
      inputBg:        o.inputBg        ?? 'rgba(255,255,255,0.04)',
      inputBorder:    o.inputBorder    ?? 'rgba(255,255,255,0.1)',
      sideBtnBg:      o.sideBtnBg      ?? 'rgba(255,255,255,0.05)',
      sideBtnBorder:  o.sideBtnBorder  ?? 'rgba(255,255,255,0.07)',
      statusBar: 'light',
      switchTrackOn:  o.switchTrackOn  ?? p.accent + '40',
      switchThumbOn:  p.accent,
      switchTrackOff: o.switchTrackOff ?? '#1e293b',
      switchThumbOff: o.switchThumbOff ?? '#555',
    };
  } else {
    return {
      bg: p.lightBg,
      cardBg: '#ffffff',
      sectionBg: '#ffffff',
      accent: p.accent,
      userBubble: p.accent,
      captainBubble: '#ffffff',
      captainBorder: p.accent + '25',
      fgPrimary: '#0a0a0a',
      fgSecondary: '#1a1a1a',
      fgTertiary: '#888888',
      divider: 'rgba(0,0,0,0.07)',
      inputBg: 'rgba(0,0,0,0.04)',
      inputBorder: 'rgba(0,0,0,0.12)',
      sideBtnBg: 'rgba(0,0,0,0.05)',
      sideBtnBorder: 'rgba(0,0,0,0.07)',
      statusBar: 'dark',
      switchTrackOn: p.accent + '40',
      switchThumbOn: p.accent,
      switchTrackOff: '#d1d5db',
      switchThumbOff: '#9ca3af',
    };
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [colorKey, setColorKeyState] = useState('blue');
  const [mode, setModeState] = useState('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (!val) return;
      try {
        const saved = JSON.parse(val);
        if (saved.colorKey && PALETTE[saved.colorKey]) setColorKeyState(saved.colorKey);
        if (saved.mode) setModeState(saved.mode);
      } catch {}
    });
  }, []);

  const isDark = mode === 'auto' ? systemScheme !== 'light' : mode === 'dark';
  const theme = buildTheme(colorKey, isDark);

  const setColorKey = async (key) => {
    setColorKeyState(key);
    await AsyncStorage.setItem(THEME_KEY, JSON.stringify({ colorKey: key, mode }));
  };

  const setMode = async (m) => {
    setModeState(m);
    await AsyncStorage.setItem(THEME_KEY, JSON.stringify({ colorKey, mode: m }));
  };

  return (
    <ThemeContext.Provider value={{ theme, colorKey, mode, setColorKey, setMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
