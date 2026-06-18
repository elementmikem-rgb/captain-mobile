import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { getDocuments, getMemories, getContacts, getExpenses } from '../services/api';

const STORAGE_KEY = 'captain_messages';

// ── Source config ────────────────────────────────────────────────────────────
const SOURCES = [
  { key: 'messages',  label: 'Messages',  icon: 'chat-bubble-outline', color: '#6366f1' },
  { key: 'notes',     label: 'Notes',     icon: 'description',         color: '#10b981' },
  { key: 'memories',  label: 'Memories',  icon: 'lightbulb-outline',   color: '#f59e0b' },
  { key: 'contacts',  label: 'Contacts',  icon: 'person-outline',      color: '#3b82f6' },
  { key: 'expenses',  label: 'Expenses',  icon: 'credit-card',         color: '#ec4899' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function snippet(text, query, maxLen = 100) {
  if (!text) return '';
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) {
    return text.slice(0, maxLen) + (text.length > maxLen ? '...' : '');
  }
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 60);
  const raw = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
  return raw;
}

function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── HighlightText ─────────────────────────────────────────────────────────────
function HighlightText({ text, query, style, highlightStyle }) {
  if (!query || !text) return <Text style={style}>{text}</Text>;
  const q = query.toLowerCase();
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const lower = remaining.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) {
      parts.push(<Text key={key++} style={style}>{remaining}</Text>);
      break;
    }
    if (idx > 0) {
      parts.push(<Text key={key++} style={style}>{remaining.slice(0, idx)}</Text>);
    }
    parts.push(
      <Text key={key++} style={[style, highlightStyle]}>
        {remaining.slice(idx, idx + query.length)}
      </Text>
    );
    remaining = remaining.slice(idx + query.length);
  }

  return <Text>{parts}</Text>;
}

// ── ResultRow ────────────────────────────────────────────────────────────────
function ResultRow({ item, query, theme, onPress }) {
  const src = SOURCES.find(s => s.key === item.source);
  if (!src) return null;

  const snip = snippet(item.text, query);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.accent + '14' : theme.sectionBg,
          borderBottomColor: theme.divider,
        },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: src.color + '1a' }]}>
        <MaterialIcons name={src.icon} size={18} color={src.color} />
      </View>
      <View style={styles.rowBody}>
        <HighlightText
          text={snip}
          query={query}
          style={[styles.rowText, { color: theme.fgSecondary }]}
          highlightStyle={styles.highlight}
          numberOfLines={2}
        />
        {item.subtitle ? (
          <Text style={[styles.rowSub, { color: theme.fgTertiary }]} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      {item.ts ? (
        <Text style={[styles.rowTs, { color: theme.fgTertiary }]}>{formatTs(item.ts)}</Text>
      ) : null}
    </Pressable>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ sourceKey, count, theme }) {
  const src = SOURCES.find(s => s.key === sourceKey);
  if (!src) return null;
  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme.bg, borderBottomColor: theme.divider }]}>
      <MaterialIcons name={src.icon} size={14} color={src.color} />
      <Text style={[styles.sectionLabel, { color: src.color }]}>{src.label}</Text>
      <Text style={[styles.sectionCount, { color: theme.fgTertiary }]}>{count}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SearchScreen({ navigation }) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);   // flat list with type='header'|'result'
  const [searching, setSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sourceCount, setSourceCount] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const runSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults([]);
      setTotalCount(0);
      setSourceCount(0);
      setSearching(false);
      return;
    }

    setSearching(true);
    const lower = q.toLowerCase();

    const [messagesRaw, docsRaw, memoriesRaw, contactsRaw, expensesRaw] = await Promise.allSettled([
      // 1. Messages from AsyncStorage
      AsyncStorage.getItem(STORAGE_KEY).then(raw => {
        if (!raw) return [];
        const msgs = JSON.parse(raw);
        return msgs
          .filter(m => m.isUser && m.text && m.text.toLowerCase().includes(lower))
          .map(m => ({
            id: 'msg_' + m.id,
            source: 'messages',
            text: m.text,
            ts: m.ts,
          }));
      }),

      // 2. Notes/Documents
      getDocuments().then(data => {
        const docs = data.documents || [];
        return docs
          .filter(d => {
            const title = (d.title || '').toLowerCase();
            const content = (d.content || '').toLowerCase();
            return title.includes(lower) || content.includes(lower);
          })
          .map(d => ({
            id: 'doc_' + (d.id || d._id || Math.random()),
            source: 'notes',
            text: d.content || d.title || '',
            subtitle: d.title || '',
            ts: d.created_at || d.createdAt || null,
          }));
      }),

      // 3. Memories
      getMemories().then(data => {
        const mems = data.memories || data.facts || [];
        return mems
          .filter(m => {
            const fact = (m.fact || m.text || '').toLowerCase();
            return fact.includes(lower);
          })
          .map(m => ({
            id: 'mem_' + (m.id || m._id || Math.random()),
            source: 'memories',
            text: m.fact || m.text || '',
            ts: m.created_at || m.createdAt || null,
          }));
      }),

      // 4. Contacts
      getContacts().then(data => {
        const contacts = data.contacts || [];
        return contacts
          .filter(c => {
            const name = (c.name || '').toLowerCase();
            const notes = (c.notes || '').toLowerCase();
            return name.includes(lower) || notes.includes(lower);
          })
          .map(c => ({
            id: 'contact_' + (c.id || c._id || Math.random()),
            source: 'contacts',
            text: c.name || '',
            subtitle: c.phone ? c.phone + (c.notes ? '  •  ' + c.notes : '') : (c.notes || ''),
            ts: c.created_at || c.createdAt || null,
          }));
      }),

      // 5. Expenses
      getExpenses().then(data => {
        const expenses = data.expenses || [];
        return expenses
          .filter(e => {
            const desc = (e.description || '').toLowerCase();
            const cat = (e.category || '').toLowerCase();
            return desc.includes(lower) || cat.includes(lower);
          })
          .map(e => ({
            id: 'exp_' + (e.id || e._id || Math.random()),
            source: 'expenses',
            text: e.description || e.category || '',
            subtitle: e.amount ? '$' + Number(e.amount).toFixed(2) + (e.category ? '  •  ' + e.category : '') : (e.category || ''),
            ts: e.date || e.created_at || e.createdAt || null,
          }));
      }),
    ]);

    // Collect results by source
    const bySource = {
      messages:  messagesRaw.status  === 'fulfilled' ? messagesRaw.value  : [],
      notes:     docsRaw.status      === 'fulfilled' ? docsRaw.value      : [],
      memories:  memoriesRaw.status  === 'fulfilled' ? memoriesRaw.value  : [],
      contacts:  contactsRaw.status  === 'fulfilled' ? contactsRaw.value  : [],
      expenses:  expensesRaw.status  === 'fulfilled' ? expensesRaw.value  : [],
    };

    // Build flat list with section headers
    const flat = [];
    let total = 0;
    let srcCount = 0;

    for (const src of SOURCES) {
      const items = bySource[src.key] || [];
      if (items.length === 0) continue;
      srcCount++;
      total += items.length;
      flat.push({ type: 'header', source: src.key, count: items.length, id: 'hdr_' + src.key });
      items.forEach(item => flat.push({ ...item, type: 'result' }));
    }

    setResults(flat);
    setTotalCount(total);
    setSourceCount(srcCount);
    setSearching(false);
  }, []);

  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setResults([]);
      setTotalCount(0);
      setSourceCount(0);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => runSearch(text), 300);
  }, [runSearch]);

  const handleResultPress = useCallback((item) => {
    if (item.source === 'messages') {
      navigation.navigate('Chat');
    } else if (item.source === 'notes') {
      navigation.navigate('Actions');
    }
    // contacts, memories, expenses: no deep-link target yet
  }, [navigation]);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'header') {
      return <SectionHeader sourceKey={item.source} count={item.count} theme={theme} />;
    }
    return (
      <ResultRow
        item={item}
        query={query}
        theme={theme}
        onPress={() => handleResultPress(item)}
      />
    );
  }, [query, theme, handleResultPress]);

  const isEmpty = query.trim().length >= 2 && !searching && results.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBar === 'light' ? 'light-content' : 'dark-content'} />

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: theme.bg, borderBottomColor: theme.divider }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={theme.fgPrimary} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.fgPrimary }]}
          placeholder="Search everything..."
          placeholderTextColor={theme.fgTertiary}
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searching ? (
          <ActivityIndicator size="small" color={theme.accent} style={styles.spinner} />
        ) : query.length > 0 ? (
          <Pressable onPress={() => { setQuery(''); setResults([]); setTotalCount(0); setSourceCount(0); }} hitSlop={8}>
            <MaterialIcons name="close" size={20} color={theme.fgTertiary} />
          </Pressable>
        ) : null}
      </View>

      {/* ── Summary bar ── */}
      {totalCount > 0 && !searching ? (
        <View style={[styles.summaryBar, { backgroundColor: theme.sectionBg, borderBottomColor: theme.divider }]}>
          <Text style={[styles.summaryText, { color: theme.fgTertiary }]}>
            {totalCount} {totalCount === 1 ? 'result' : 'results'} across {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
          </Text>
        </View>
      ) : null}

      {/* ── Results list ── */}
      {!isEmpty ? (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={results.length === 0 ? styles.emptyFlex : undefined}
        />
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="search-off" size={48} color={theme.fgTertiary} style={{ opacity: 0.4 }} />
          <Text style={[styles.emptyTitle, { color: theme.fgSecondary }]}>No results</Text>
          <Text style={[styles.emptySubtitle, { color: theme.fgTertiary }]}>
            Nothing matched "{query}"
          </Text>
        </View>
      )}

      {/* ── Idle state ── */}
      {query.trim().length < 2 && !searching ? (
        <View style={styles.idleState}>
          <MaterialIcons name="search" size={52} color={theme.fgTertiary} style={{ opacity: 0.25 }} />
          <Text style={[styles.idleText, { color: theme.fgTertiary }]}>
            Messages, notes, memories, contacts, expenses
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  backBtn: { padding: 4 },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  spinner: { marginRight: 2 },

  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '500',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '600',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: { flex: 1 },
  rowText: { fontSize: 14, lineHeight: 20 },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowTs: { fontSize: 11, flexShrink: 0, marginLeft: 4 },

  highlight: {
    backgroundColor: '#fef08a',
    color: '#1c1917',
    borderRadius: 2,
  },

  emptyFlex: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { fontSize: 14 },

  idleState: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 60,
    pointerEvents: 'none',
  },
  idleText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
