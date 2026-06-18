import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

const MESSAGES_KEY = 'captain_messages';

const STOP_WORDS = new Set([
  'i', 'the', 'a', 'is', 'my', 'me', 'it', 'to', 'and', 'of', 'in',
  'for', 'that', 'you', 'can', 'be', 'was', 'are', 'on', 'at', 'do',
  'have', 'had', 'has', 'with', 'this', 'but', 'or', 'an', 'not', 'what',
  'so', 'up', 'how', 'its', 'no', 'if', 'we', 'by', 'as', 'get', 'just',
  'from', 'will', 'about', 'there', 'your', 'all', 'they', 'their', 'when',
]);

function StatCard({ icon, label, value, color, subtitle }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.sectionBg }]}>
      <View style={[styles.statIcon, { backgroundColor: (color || theme.accent) + '18' }]}>
        <MaterialIcons name={icon} size={20} color={color || theme.accent} />
      </View>
      <Text style={[styles.statValue, { color: theme.fgPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.fgTertiary }]}>{label}</Text>
      {subtitle ? (
        <Text style={[styles.statSub, { color: color || theme.accent }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

function SectionHeader({ title, icon, color }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <MaterialIcons name={icon} size={14} color={color || theme.accent} />
      <Text style={[styles.sectionHeaderText, { color: color || theme.accent }]}>{title}</Text>
    </View>
  );
}

function computeInsights(messages) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let messagesToday = 0;
  let totalPairs = 0;

  // hour buckets 0–23
  const hourCounts = new Array(24).fill(0);

  // streak: collect unique day strings for days with messages
  const daySet = new Set();

  // word freq from last 50 user messages
  const wordFreq = {};
  const userMessages = messages.filter(m => m.role === 'user');
  const last50 = userMessages.slice(-50);

  for (const msg of messages) {
    const ts = msg.ts ? new Date(msg.ts).getTime() : 0;
    if (!ts) continue;

    if (ts >= todayStart) messagesToday++;

    if (msg.role === 'user') {
      const d = new Date(ts);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      daySet.add(dayKey);
      hourCounts[d.getHours()]++;
    }

    if (msg.role === 'assistant') totalPairs++;
  }

  // streak calc: consecutive days ending today (Pacific-ish — device local time)
  let streak = 0;
  const check = new Date(now);
  check.setHours(0, 0, 0, 0);
  while (true) {
    const key = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
    if (daySet.has(key)) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else {
      break;
    }
  }

  // most active hour
  const maxCount = Math.max(...hourCounts, 1);
  const mostActiveHour = hourCounts.indexOf(maxCount);

  // top topics from last 50 user messages
  for (const msg of last50) {
    const words = (msg.content || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }

  const topTopics = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    messagesToday,
    totalPairs,
    streak,
    hourCounts,
    maxCount,
    mostActiveHour,
    topTopics,
  };
}

function formatHour(h) {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

export default function InsightsScreen({ navigation }) {
  const { theme } = useTheme();
  const [insights, setInsights] = useState(null);
  const [memoriesCount, setMemoriesCount] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MESSAGES_KEY);
      const messages = raw ? JSON.parse(raw) : [];
      const computed = computeInsights(Array.isArray(messages) ? messages : []);
      setInsights(computed);
    } catch {
      setInsights(computeInsights([]));
    }

    // fetch memory count from API
    try {
      const apiUrl = await AsyncStorage.getItem('captain_api_url');
      const apiKey = await AsyncStorage.getItem('captain_api_key');
      const base = apiUrl || 'https://callova.live/captain';
      const key = apiKey || '';
      const res = await fetch(`${base}/api/memory`, {
        headers: { 'X-API-Key': key },
      });
      const data = await res.json();
      const items = data.memories || data.results || data || [];
      setMemoriesCount(Array.isArray(items) ? items.length : 0);
    } catch {
      setMemoriesCount(0);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const accent = theme.accent;

  // Bar chart: show every-other label to avoid crowding (12 ticks)
  const BAR_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={accent} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={theme.fgPrimary} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={[styles.titleMain, { color: theme.fgPrimary }]}>Intelligence Report</Text>
          <Text style={[styles.titleSub, { color: theme.fgTertiary }]}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        <View style={[styles.headBadge, { backgroundColor: accent + '18' }]}>
          <MaterialIcons name="insights" size={18} color={accent} />
        </View>
      </View>

      {/* Stat grid */}
      <View style={styles.statGrid}>
        <StatCard
          icon="chat"
          label="Messages Today"
          value={insights ? String(insights.messagesToday) : '—'}
          color="#38bdf8"
        />
        <StatCard
          icon="forum"
          label="Total Exchanges"
          value={insights ? String(insights.totalPairs) : '—'}
          color="#a78bfa"
        />
        <StatCard
          icon="memory"
          label="Memories Saved"
          value={memoriesCount !== null ? String(memoriesCount) : '—'}
          color="#34d399"
        />
        <StatCard
          icon="local-fire-department"
          label="Day Streak"
          value={insights ? String(insights.streak) : '—'}
          color="#fb923c"
          subtitle={insights && insights.streak > 0 ? (insights.streak === 1 ? 'day' : 'days') : null}
        />
      </View>

      {/* Histogram */}
      <View style={[styles.card, { backgroundColor: theme.sectionBg }]}>
        <SectionHeader title="Most Active Hour" icon="bar-chart" color="#f472b6" />
        {insights ? (
          <>
            <View style={styles.histogram}>
              {insights.hourCounts.map((count, h) => {
                const pct = insights.maxCount > 0 ? count / insights.maxCount : 0;
                const isActive = h === insights.mostActiveHour && count > 0;
                return (
                  <View key={h} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.max(pct * 100, count > 0 ? 4 : 0)}%`,
                            backgroundColor: isActive
                              ? '#f472b6'
                              : accent + (count > 0 ? '80' : '20'),
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            {/* x-axis labels — every 2 hours */}
            <View style={styles.histLabels}>
              {BAR_HOURS.map(h => (
                <Text key={h} style={[styles.histLabel, { color: theme.fgTertiary }]}>
                  {formatHour(h)}
                </Text>
              ))}
            </View>
            {insights.maxCount > 0 && (
              <Text style={[styles.histNote, { color: theme.fgTertiary }]}>
                Peak: {formatHour(insights.mostActiveHour).replace('a', ' AM').replace('p', ' PM')} — {insights.maxCount} {insights.maxCount === 1 ? 'message' : 'messages'}
              </Text>
            )}
            {insights.maxCount === 0 && (
              <Text style={[styles.histNote, { color: theme.fgTertiary }]}>No message data yet</Text>
            )}
          </>
        ) : (
          <Text style={[styles.placeholderText, { color: theme.fgTertiary }]}>Loading...</Text>
        )}
      </View>

      {/* Top Topics */}
      <View style={[styles.card, { backgroundColor: theme.sectionBg }]}>
        <SectionHeader title="Top Topics" icon="label" color="#fbbf24" />
        {insights && insights.topTopics.length > 0 ? (
          <View style={styles.pillRow}>
            {insights.topTopics.map((word, i) => {
              const pillColors = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'];
              const c = pillColors[i % pillColors.length];
              return (
                <View
                  key={word}
                  style={[styles.pill, { backgroundColor: c + '18', borderColor: c + '40' }]}
                >
                  <Text style={[styles.pillText, { color: c }]}>{word}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.placeholderText, { color: theme.fgTertiary }]}>
            {insights ? 'Have more conversations to surface topics.' : 'Loading...'}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 14 },

  /* Header */
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 4, paddingBottom: 8,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  titleBlock: { flex: 1 },
  titleMain: { fontSize: 20, fontWeight: '700', letterSpacing: 0.3 },
  titleSub: { fontSize: 12, marginTop: 2 },
  headBadge: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },

  /* Stat grid */
  statGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  statCard: {
    width: '47.5%', borderRadius: 16, padding: 16,
    alignItems: 'flex-start', gap: 6,
  },
  statIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: { fontSize: 28, fontWeight: '700', lineHeight: 32 },
  statLabel: { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  statSub: { fontSize: 11, fontWeight: '600' },

  /* Generic card */
  card: { borderRadius: 16, padding: 16, gap: 12 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4,
  },
  sectionHeaderText: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1,
  },

  /* Histogram */
  histogram: {
    flexDirection: 'row', alignItems: 'flex-end',
    height: 72, gap: 2,
  },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { flex: 1, justifyContent: 'flex-end' },
  barFill: { borderRadius: 3, width: '100%' },
  histLabels: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 4,
  },
  histLabel: { fontSize: 9, width: 20, textAlign: 'center' },
  histNote: { fontSize: 11, textAlign: 'center', marginTop: 2 },

  /* Pills */
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },

  placeholderText: { fontSize: 13, paddingVertical: 4 },
});
