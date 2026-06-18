import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import {
  getBookingsToday,
  getBookingsUpcoming,
  getReminders,
  addReminder,
  deleteReminder,
  getExpenseSummary,
  addExpense,
  searchContacts,
  getMemoryFacts,
  getDailySummary,
  getWeather,
  addDocument,
  getDocuments,
  getBirthdays,
  getBookmarks,
} from '../services/api';

function Card({ icon, label, color, children, onPress, collapsible }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(!collapsible);
  return (
    <View style={[styles.card, { backgroundColor: theme.sectionBg }]}>
      <Pressable
        onPress={collapsible ? () => setOpen(o => !o) : onPress}
        style={styles.cardHeader}
      >
        <View style={[styles.cardIcon, { backgroundColor: (color || theme.accent) + '18' }]}>
          <MaterialIcons name={icon} size={18} color={color || theme.accent} />
        </View>
        <Text style={[styles.cardLabel, { color: theme.fgPrimary }]}>{label}</Text>
        {collapsible && (
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={theme.fgTertiary} />
        )}
      </Pressable>
      {open && children}
    </View>
  );
}

export default function ActionsScreen({ navigation }) {
  const { theme } = useTheme();
  const [bookings, setBookings] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [expenses, setExpenses] = useState(null);
  const [contacts, setContacts] = useState({ business: [], personal: [] });
  const [facts, setFacts] = useState({});
  const [summary, setSummary] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [birthdays, setBirthdays] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('other');
  const [contactQ, setContactQ] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const EXPENSE_CATS = ['food', 'fuel', 'supplies', 'marketing', 'other'];

  const loadAll = useCallback(async () => {
    const results = await Promise.allSettled([
      getBookingsToday(),
      getReminders(),
      getExpenseSummary(),
      getMemoryFacts(),
      getWeather(),
      getBookingsUpcoming(7),
      getDocuments(),
      getBirthdays(),
      getBookmarks(),
    ]);

    if (results[0].status === 'fulfilled') setBookings(results[0].value.bookings || []);
    if (results[1].status === 'fulfilled') setReminders(results[1].value.reminders || []);
    if (results[2].status === 'fulfilled') setExpenses(results[2].value);
    if (results[3].status === 'fulfilled') setFacts(results[3].value.facts || {});
    if (results[4].status === 'fulfilled') setWeather(results[4].value);
    if (results[5].status === 'fulfilled') setUpcoming(results[5].value.bookings || []);
    if (results[6].status === 'fulfilled') setNotes(results[6].value.documents || []);
    if (results[7].status === 'fulfilled') setBirthdays(results[7].value.birthdays || []);
    if (results[8].status === 'fulfilled') setBookmarks(results[8].value.bookmarks || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleContactSearch = useCallback(async () => {
    if (!contactQ.trim()) return;
    try {
      const data = await searchContacts(contactQ.trim());
      setContacts(data);
    } catch {}
  }, [contactQ]);

  const handleAddReminder = useCallback(async () => {
    if (!newReminder.trim()) return;
    try {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await addReminder(newReminder.trim(), tomorrow);
      setNewReminder('');
      const data = await getReminders();
      setReminders(data.reminders || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, [newReminder]);

  const handleDeleteReminder = useCallback(async (id) => {
    try {
      const data = await deleteReminder(id);
      setReminders(data.reminders || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  const handleSummary = useCallback(async () => {
    try {
      const data = await getDailySummary();
      setSummary(data);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim()) return;
    try {
      const title = `Note — ${new Date().toLocaleDateString()}`;
      await addDocument(title, newNote.trim());
      setNewNote('');
      const data = await getDocuments();
      setNotes(data.documents || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, [newNote]);

  const handleAddExpense = useCallback(async () => {
    const amt = parseFloat(expenseAmount);
    if (!amt || isNaN(amt)) return;
    try {
      await addExpense(amt, expenseCategory, '');
      setExpenseAmount('');
      const data = await getExpenseSummary();
      setExpenses(data);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, [expenseAmount, expenseCategory]);

  const s = (color) => [styles.section, { backgroundColor: theme.sectionBg }];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
    >
      {/* Weather */}
      {weather && (
        <View style={[styles.weatherCard, { backgroundColor: theme.sectionBg }]}>
          <MaterialIcons
            name={weather.is_day ? 'wb-sunny' : 'nights-stay'}
            size={28}
            color={weather.is_day ? '#fbbf24' : '#a78bfa'}
          />
          <View style={styles.weatherMain}>
            <Text style={[styles.weatherTemp, { color: theme.fgPrimary }]}>{weather.temp}°C</Text>
            <Text style={[styles.weatherCond, { color: theme.fgTertiary }]}>{weather.condition}</Text>
          </View>
          <Text style={[styles.weatherWind, { color: theme.fgTertiary }]}>{weather.windspeed} km/h</Text>
        </View>
      )}

      {/* Today's Schedule */}
      <Card icon="event" label="Today's Schedule" color="#38bdf8" collapsible>
        {bookings.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>No bookings today</Text>
        ) : (
          bookings.map((b, i) => (
            <View key={i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
              <Text style={[styles.listMain, { color: theme.fgSecondary }]}>{b.service || b.name || 'Booking'}</Text>
              <Text style={[styles.listSub, { color: theme.fgTertiary }]}>{b.time || ''}</Text>
            </View>
          ))
        )}
      </Card>

      {/* Reminders */}
      <Card icon="alarm" label="Reminders" color="#fb923c" collapsible>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.reminderInput, { backgroundColor: theme.inputBg, color: theme.fgPrimary, borderColor: theme.inputBorder }]}
            placeholder="Add reminder..."
            placeholderTextColor={theme.fgTertiary}
            value={newReminder}
            onChangeText={setNewReminder}
            onSubmitEditing={handleAddReminder}
            returnKeyType="done"
          />
          <Pressable onPress={handleAddReminder} style={[styles.addBtn, { backgroundColor: theme.accent }]}>
            <MaterialIcons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
        {reminders.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>No reminders set</Text>
        ) : (
          reminders.slice(0, 8).map((r, i) => (
            <View key={r.id || i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
              <MaterialIcons name="circle" size={7} color="#fb923c" style={{ marginTop: 7, marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.listMain, { color: theme.fgSecondary }]}>{r.text}</Text>
                {r.trigger_at && (
                  <Text style={[styles.listSub, { color: theme.fgTertiary }]}>
                    {new Date(r.trigger_at).toLocaleString()}
                  </Text>
                )}
              </View>
              {r.id && (
                <Pressable onPress={() => handleDeleteReminder(r.id)} style={styles.deleteBtn} hitSlop={8}>
                  <MaterialIcons name="close" size={14} color={theme.fgTertiary} />
                </Pressable>
              )}
            </View>
          ))
        )}
      </Card>

      {/* Contacts */}
      <Card icon="contacts" label="Contacts" color="#a78bfa" collapsible>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.reminderInput, { backgroundColor: theme.inputBg, color: theme.fgPrimary, borderColor: theme.inputBorder }]}
            placeholder="Search name or phone..."
            placeholderTextColor={theme.fgTertiary}
            value={contactQ}
            onChangeText={setContactQ}
            onSubmitEditing={handleContactSearch}
            returnKeyType="search"
          />
          <Pressable onPress={handleContactSearch} style={[styles.addBtn, { backgroundColor: '#a78bfa' }]}>
            <MaterialIcons name="search" size={20} color="#fff" />
          </Pressable>
        </View>
        {[...(contacts.personal || []), ...(contacts.business || [])].slice(0, 6).map((c, i) => (
          <View key={i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
            <MaterialIcons name="person" size={16} color={theme.fgTertiary} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.listMain, { color: theme.fgSecondary }]}>{c.name}</Text>
              {c.phone && <Text style={[styles.listSub, { color: theme.fgTertiary }]}>{c.phone}</Text>}
            </View>
            {c.phone && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)} hitSlop={8} style={styles.contactAction}>
                  <MaterialIcons name="call" size={14} color="#4ade80" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL(`sms:${c.phone}`)} hitSlop={8} style={styles.contactAction}>
                  <MaterialIcons name="message" size={14} color="#38bdf8" />
                </Pressable>
              </View>
            )}
          </View>
        ))}
        {contacts.personal.length === 0 && contacts.business.length === 0 && contactQ ? (
          <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>No contacts found</Text>
        ) : null}
      </Card>

      {/* Expenses */}
      <Card icon="receipt" label="Expenses" color="#34d399" collapsible>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.reminderInput, { backgroundColor: theme.inputBg, color: theme.fgPrimary, borderColor: theme.inputBorder, flex: 0.45 }]}
            placeholder="$0.00"
            placeholderTextColor={theme.fgTertiary}
            value={expenseAmount}
            onChangeText={setExpenseAmount}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={handleAddExpense}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
            {EXPENSE_CATS.map(cat => (
              <Pressable
                key={cat}
                onPress={() => setExpenseCategory(cat)}
                style={[styles.catChip, { borderColor: expenseCategory === cat ? '#34d399' : theme.divider, backgroundColor: expenseCategory === cat ? '#34d39918' : 'transparent' }]}
              >
                <Text style={[styles.catChipText, { color: expenseCategory === cat ? '#34d399' : theme.fgTertiary }]}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={handleAddExpense} style={[styles.addBtn, { backgroundColor: '#34d399' }]}>
            <MaterialIcons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
        {expenses && (
          <>
            <View style={styles.expenseGrid}>
              {Object.entries(expenses.by_category || {}).slice(0, 6).map(([cat, amt]) => (
                <View key={cat} style={[styles.expenseTile, { backgroundColor: theme.inputBg }]}>
                  <Text style={[styles.expenseAmt, { color: '#34d399' }]}>${Number(amt).toFixed(0)}</Text>
                  <Text style={[styles.expenseCat, { color: theme.fgTertiary }]}>{cat}</Text>
                </View>
              ))}
            </View>
            {expenses.total != null && (
              <View style={[styles.expenseTotal, { borderTopColor: theme.divider }]}>
                <Text style={[styles.listSub, { color: theme.fgTertiary }]}>Total this month</Text>
                <Text style={[styles.listMain, { color: theme.fgPrimary }]}>${Number(expenses.total).toFixed(2)}</Text>
              </View>
            )}
          </>
        )}
        {!expenses && (
          <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>No expenses tracked yet</Text>
        )}
      </Card>

      {/* Upcoming Bookings */}
      {upcoming.length > 0 && (
        <Card icon="calendar-today" label="Upcoming (7 days)" color="#38bdf8" collapsible>
          {upcoming.slice(0, 5).map((b, i) => (
            <View key={i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
              <MaterialIcons name="event" size={14} color="#38bdf8" style={{ marginTop: 2, marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.listMain, { color: theme.fgSecondary }]}>{b.service || b.name || 'Booking'}</Text>
                <Text style={[styles.listSub, { color: theme.fgTertiary }]}>{b.date || b.time || ''}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Quick Notes */}
      <Card icon="edit-note" label="Quick Notes" color="#a78bfa" collapsible>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.reminderInput, { backgroundColor: theme.inputBg, color: theme.fgPrimary, borderColor: theme.inputBorder }]}
            placeholder="Jot a note..."
            placeholderTextColor={theme.fgTertiary}
            value={newNote}
            onChangeText={setNewNote}
            onSubmitEditing={handleAddNote}
            returnKeyType="done"
          />
          <Pressable onPress={handleAddNote} style={[styles.addBtn, { backgroundColor: '#a78bfa' }]}>
            <MaterialIcons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
        {notes.slice(0, 5).map((n, i) => (
          <View key={i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
            <MaterialIcons name="sticky-note-2" size={14} color="#a78bfa" style={{ marginTop: 2, marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.listMain, { color: theme.fgSecondary }]} numberOfLines={2}>{n.content || n.title}</Text>
              <Text style={[styles.listSub, { color: theme.fgTertiary }]}>{n.title}</Text>
            </View>
          </View>
        ))}
        {notes.length === 0 && (
          <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>No notes yet</Text>
        )}
      </Card>

      {/* Daily Summary */}
      <Card icon="summarize" label="Daily Summary" color="#f472b6" collapsible>
        {summary ? (
          <Text style={[styles.summaryText, { color: theme.fgSecondary }]}>{summary.summary || summary.text || JSON.stringify(summary)}</Text>
        ) : (
          <Pressable onPress={handleSummary} style={[styles.generateBtn, { borderColor: theme.accent + '40', backgroundColor: theme.accent + '10' }]}>
            <MaterialIcons name="auto-awesome" size={16} color={theme.accent} />
            <Text style={[styles.generateBtnText, { color: theme.accent }]}>Generate Today's Summary</Text>
          </Pressable>
        )}
      </Card>

      {/* Birthdays */}
      {birthdays.length > 0 && (
        <Card icon="cake" label="Upcoming Birthdays" color="#f472b6" collapsible>
          {birthdays.slice(0, 5).map((b, i) => (
            <View key={i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
              <MaterialIcons name="cake" size={14} color="#f472b6" style={{ marginTop: 2, marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.listMain, { color: theme.fgSecondary }]}>{b.name}</Text>
                <Text style={[styles.listSub, { color: theme.fgTertiary }]}>{b.date}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Saved Bookmarks */}
      {bookmarks.length > 0 && (
        <Card icon="bookmark" label="Saved" color="#38bdf8" collapsible>
          {bookmarks.slice(0, 5).map((b, i) => (
            <View key={b.id || i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
              <MaterialIcons name="bookmark" size={14} color="#38bdf8" style={{ marginTop: 2, marginRight: 8 }} />
              <Text style={[styles.listMain, { color: theme.fgSecondary, flex: 1 }]} numberOfLines={2}>{b.text}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* What Captain Knows */}
      <Card icon="psychology" label="What Captain Knows" color="#fbbf24" collapsible>
        {Object.keys(facts).length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>
            Captain hasn't learned much yet. Have more conversations.
          </Text>
        ) : (
          Object.entries(facts).map(([category, items]) => (
            <View key={category} style={styles.factGroup}>
              <Text style={[styles.factCategory, { color: '#fbbf24' }]}>{category.toUpperCase()}</Text>
              {(items || []).map((item, i) => (
                <Text key={i} style={[styles.factItem, { color: theme.fgSecondary }]}>
                  {item.key}: {item.value}
                </Text>
              ))}
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { borderRadius: 16, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16,
  },
  cardIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  listRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listMain: { fontSize: 14, fontWeight: '500' },
  listSub: { fontSize: 12, marginTop: 2 },
  emptyText: { fontSize: 13, paddingHorizontal: 16, paddingBottom: 14 },
  inputRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  reminderInput: {
    flex: 1, height: 40, borderRadius: 10,
    paddingHorizontal: 12, fontSize: 14, borderWidth: 1,
  },
  addBtn: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  expenseGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  expenseTile: {
    width: '30%', padding: 10, borderRadius: 10, alignItems: 'center',
  },
  expenseAmt: { fontSize: 16, fontWeight: '700' },
  expenseCat: { fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  expenseTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryText: { fontSize: 14, lineHeight: 22, padding: 16, paddingTop: 0 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 16, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1,
  },
  generateBtnText: { fontSize: 14, fontWeight: '600' },
  factGroup: { paddingHorizontal: 16, paddingBottom: 12 },
  factCategory: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  factItem: { fontSize: 13, lineHeight: 20 },
  section: { borderRadius: 16, padding: 0 },
  catChip: {
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center',
  },
  catChipText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  weatherCard: {
    borderRadius: 16, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 16,
  },
  weatherMain: { flex: 1 },
  weatherTemp: { fontSize: 28, fontWeight: '700' },
  weatherCond: { fontSize: 13, marginTop: 2 },
  weatherWind: { fontSize: 13 },
  deleteBtn: { padding: 6 },
  contactAction: { padding: 6 },
});
