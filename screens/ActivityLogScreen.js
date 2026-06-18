import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

// ── Type config ────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  notification:  { icon: 'notifications',       color: '#60a5fa', label: 'Notification' },
  summary:       { icon: 'description',          color: '#a78bfa', label: 'Summary' },
  reminder:      { icon: 'alarm',                color: '#fbbf24', label: 'Reminder' },
  memory:        { icon: 'psychology',           color: '#34d399', label: 'Memory' },
  weather_alert: { icon: 'cloud',                color: '#f97316', label: 'Weather Alert' },
  morning_brief: { icon: 'wb-sunny',             color: '#fbbf24', label: 'Morning Brief' },
  followup:      { icon: 'arrow-forward-ios',    color: '#60a5fa', label: 'Follow-up' },
};

const DEFAULT_TYPE = { icon: 'info', color: '#94a3b8', label: 'Activity' };

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getDayLabel(isoString) {
  const entry = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const entryDay = entry.toDateString();
  if (entryDay === today.toDateString()) return 'Today';
  if (entryDay === yesterday.toDateString()) return 'Yesterday';
  return entry.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupByDay(entries) {
  const groups = [];
  let currentDay = null;

  for (const entry of entries) {
    const dayLabel = getDayLabel(entry.ts);
    if (dayLabel !== currentDay) {
      currentDay = dayLabel;
      groups.push({ type: 'header', id: `header-${dayLabel}`, label: dayLabel });
    }
    groups.push({ type: 'entry', ...entry });
  }

  return groups;
}

// ── Components ─────────────────────────────────────────────────────────────────

function EntryCard({ item, theme }) {
  const cfg = TYPE_CONFIG[item.type] || DEFAULT_TYPE;
  return (
    <View style={[styles.card, { backgroundColor: theme.sectionBg, borderColor: theme.divider }]}>
      <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1a' }]}>
        <MaterialIcons name={cfg.icon} size={18} color={cfg.color} />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardDesc, { color: theme.fgSecondary }]} numberOfLines={3}>
          {item.description}
        </Text>
        <View style={styles.cardMeta}>
          <Text style={[styles.cardType, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={[styles.cardTime, { color: theme.fgTertiary }]}>{formatTime(item.ts)}</Text>
        </View>
      </View>
    </View>
  );
}

function DayHeader({ label, theme }) {
  return (
    <View style={styles.dayHeaderRow}>
      <Text style={[styles.dayHeaderText, { color: theme.accent }]}>{label}</Text>
      <View style={[styles.dayHeaderLine, { backgroundColor: theme.divider }]} />
    </View>
  );
}

function EmptyState({ theme }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.sectionBg }]}>
        <MaterialIcons name="auto-awesome" size={36} color={theme.fgTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.fgSecondary }]}>No activity recorded yet.</Text>
      <Text style={[styles.emptySubtitle, { color: theme.fgTertiary }]}>
        Captain will log what he does proactively here.
      </Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function ActivityLogScreen() {
  const { theme } = useTheme();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchLog = useCallback(async () => {
    try {
      const [url, key] = await Promise.all([
        AsyncStorage.getItem('captain_api_url'),
        AsyncStorage.getItem('captain_api_key'),
      ]);
      const baseUrl = url || 'https://callova.live/captain';
      const apiKey = key || '';
      const res = await fetch(`${baseUrl}/api/activity?limit=50`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await fetchLog();
    setLoading(false);
  }, [fetchLog]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLog();
    setRefreshing(false);
  }, [fetchLog]);

  useEffect(() => { load(); }, [load]);

  const listData = groupByDay(entries);

  const renderItem = ({ item }) => {
    if (item.type === 'header') return <DayHeader label={item.label} theme={theme} />;
    return <EntryCard item={item} theme={theme} />;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={32} color="#f87171" />
          <Text style={[styles.errorText, { color: '#f87171' }]}>{error}</Text>
          <Pressable onPress={load} style={[styles.retryBtn, { borderColor: theme.accent + '40', backgroundColor: theme.accent + '12' }]}>
            <Text style={[styles.retryText, { color: theme.accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            listData.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={<EmptyState theme={theme} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  list: { padding: 16, paddingBottom: 40, gap: 4 },
  listEmpty: { flex: 1 },

  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    flexShrink: 0,
  },
  dayHeaderLine: { flex: 1, height: 1 },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 4 },
  cardDesc: { fontSize: 14, lineHeight: 20 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardType: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTime: { fontSize: 12 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  errorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, marginTop: 4,
  },
  retryText: { fontWeight: '600', fontSize: 14 },
});
