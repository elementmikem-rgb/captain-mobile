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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import {
  getBookingsToday,
  getBookingsUpcoming,
  getReminders,
  addReminder,
  deleteReminder,
  getExpenseSummary,
  getExpenses,
  addExpense,
  searchContacts,
  getContacts,
  getMemoryFacts,
  getDailySummary,
  getWeather,
  addDocument,
  getDocuments,
  getBirthdays,
  getBookmarks,
  getFollowups,
  deleteFollowup,
  getKnowledge,
  deleteKnowledgeEntry,
} from '../services/api';

let Calendar = null;
try { Calendar = require('expo-calendar'); } catch {}

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
  const [expenseList, setExpenseList] = useState([]);
  const [contacts, setContacts] = useState({ business: [], personal: [] });
  const [facts, setFacts] = useState({});
  const [summary, setSummary] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [birthdays, setBirthdays] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [kb, setKb] = useState([]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('other');
  const [contactQ, setContactQ] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState([]);

  const EXPENSE_CATS = ['food', 'fuel', 'supplies', 'marketing', 'other'];

  const loadAll = useCallback(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      getExpenses(thirtyDaysAgo, null),
      getContacts(),
      getFollowups(),
      getKnowledge(),
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
    if (results[9].status === 'fulfilled') setExpenseList(results[9].value.expenses || []);
    if (results[10].status === 'fulfilled') setContacts(results[10].value || { business: [], personal: [] });
    if (results[11].status === 'fulfilled') setFollowups(results[11].value.followups || []);
    if (results[12].status === 'fulfilled') setKb(results[12].value.entries || []);
    setLoading(false);
  }, []);

  const loadCalendarEvents = useCallback(async () => {
    try {
      const s = await AsyncStorage.getItem('captain_settings');
      const parsed = s ? JSON.parse(s) : {};
      if (!parsed.calendarEnabled || !Calendar) return;
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') return;
      const allCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const calendarIds = allCalendars.map(c => c.id);
      if (calendarIds.length === 0) return;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const events = await Calendar.getEventsAsync(calendarIds, todayStart, todayEnd);
      setCalendarEvents(events.map(e => ({
        title: e.title || '',
        startDate: e.startDate ? new Date(e.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        endDate: e.endDate ? new Date(e.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        location: e.location || '',
      })));
    } catch {}
  }, []);

  useEffect(() => { loadAll(); loadCalendarEvents(); }, [loadAll, loadCalendarEvents]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAll(), loadCalendarEvents()]);
    setRefreshing(false);
  }, [loadAll, loadCalendarEvents]);

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

  const handleDeleteFollowup = useCallback(async (id) => {
    try {
      const data = await deleteFollowup(id);
      setFollowups(data.followups || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  const handleDeleteKbEntry = useCallback(async (id) => {
    try {
      const data = await deleteKnowledgeEntry(id);
      setKb(data.entries || []);
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
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [summaryData, listData] = await Promise.all([
        getExpenseSummary(),
        getExpenses(thirtyDaysAgo, null),
      ]);
      setExpenses(summaryData);
      setExpenseList(listData.expenses || []);
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

      {/* Today's Calendar */}
      {calendarEvents.length > 0 && (
        <Card icon="today" label="Today's Calendar" color="#818cf8" collapsible>
          {calendarEvents.map((e, i) => (
            <View key={i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listMain, { color: theme.fgSecondary }]}>{e.title}</Text>
                {(e.startDate || e.endDate) && (
                  <Text style={[styles.listSub, { color: theme.fgTertiary }]}>
                    {e.startDate}{e.endDate ? ' - ' + e.endDate : ''}
                  </Text>
                )}
                {e.location ? (
                  <Text style={[styles.listSub, { color: theme.fgTertiary }]} numberOfLines={1}>{e.location}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
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
          reminders.slice(0, 8).map((r, i) => {
            const isBlock = r.duration != null && r.duration > 0;
            // Bar width: 15min=20%, 30min=40%, 60min=60%, 120min=80%, 240min+=100%
            const barPct = isBlock ? Math.min(100, Math.round((r.duration / 240) * 100)) : 0;
            const durationLabel = isBlock
              ? r.duration >= 60
                ? `${r.duration / 60 === Math.floor(r.duration / 60) ? r.duration / 60 : (r.duration / 60).toFixed(1)} hr block`
                : `${r.duration} min block`
              : null;
            return (
              <View key={r.id || i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
                <MaterialIcons
                  name={isBlock ? 'access-time' : 'circle'}
                  size={isBlock ? 14 : 7}
                  color={isBlock ? '#60a5fa' : '#fb923c'}
                  style={{ marginTop: isBlock ? 4 : 7, marginRight: 8 }}
                />
                <View style={{ flex: 1 }}>
                  {isBlock && (
                    <Text style={[styles.listSub, { color: '#60a5fa', marginBottom: 3 }]}>
                      [{durationLabel}] {r.text}
                    </Text>
                  )}
                  {!isBlock && (
                    <Text style={[styles.listMain, { color: theme.fgSecondary }]}>{r.text}</Text>
                  )}
                  {isBlock && (
                    <View style={styles.durationBarTrack}>
                      <View style={[styles.durationBar, { width: `${barPct}%` }]} />
                    </View>
                  )}
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
            );
          })
        )}
      </Card>

      {/* Follow-Ups */}
      {followups.filter(f => !f.done).length > 0 && (
        <Card icon="update" label="Follow-Ups" color="#4ade80" collapsible>
          {followups.filter(f => !f.done).map((f, i) => (
            <View key={f.id || i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
              <MaterialIcons name="circle" size={7} color="#4ade80" style={{ marginTop: 7, marginRight: 8 }} />
              <Text style={[styles.listMain, { color: theme.fgSecondary, flex: 1 }]}>{f.text}</Text>
              {f.id && (
                <Pressable onPress={() => handleDeleteFollowup(f.id)} style={styles.deleteBtn} hitSlop={8}>
                  <MaterialIcons name="check" size={16} color="#4ade80" />
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      )}

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
        {[...(contacts.personal || []), ...(contacts.business || [])].slice(0, 10).map((c, i) => (
          <View key={c.phone || i} style={[styles.listRow, { borderBottomColor: theme.divider }]}>
            <MaterialIcons name="person" size={16} color={theme.fgTertiary} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.listMain, { color: theme.fgSecondary }]}>{c.name || c.caller_name}</Text>
              {(c.phone || c.caller_number) && (
                <Text style={[styles.listSub, { color: theme.fgTertiary }]}>{c.phone || c.caller_number}</Text>
              )}
              {c.notes ? <Text style={[styles.listSub, { color: theme.fgTertiary }]} numberOfLines={1}>{c.notes}</Text> : null}
            </View>
            {(c.phone || c.caller_number) && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable onPress={() => Linking.openURL(`tel:${c.phone || c.caller_number}`)} hitSlop={8} style={styles.contactAction}>
                  <MaterialIcons name="call" size={16} color="#4ade80" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL(`sms:${c.phone || c.caller_number}`)} hitSlop={8} style={styles.contactAction}>
                  <MaterialIcons name="sms" size={16} color="#38bdf8" />
                </Pressable>
              </View>
            )}
          </View>
        ))}
        {contacts.personal.length === 0 && contacts.business.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>
            {contactQ ? 'No contacts found' : 'No contacts yet. Say "Add contact: Name, phone" to Captain.'}
          </Text>
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

      {/* Expense Analytics */}
      <Card icon="bar-chart" label="Expense Analytics" color="#34d399" collapsible>
        {(() => {
          const CAT_COLORS = {
            food: '#f97316',
            fuel: '#3b82f6',
            supplies: '#8b5cf6',
            marketing: '#ec4899',
            other: '#6b7280',
          };

          const now = Date.now();
          const weekMs = 7 * 24 * 60 * 60 * 1000;
          const todayStr = new Date(now).toISOString().slice(0, 10);
          const weekAgoStr = new Date(now - weekMs).toISOString().slice(0, 10);
          const monthStr = new Date(now).toISOString().slice(0, 7); // 'YYYY-MM'

          const weekTotal = expenseList
            .filter(e => e.date >= weekAgoStr && e.date <= todayStr)
            .reduce((s, e) => s + Number(e.amount), 0);
          const monthTotal = expenseList
            .filter(e => (e.date || '').startsWith(monthStr))
            .reduce((s, e) => s + Number(e.amount), 0);
          const allTotal = expenseList.reduce((s, e) => s + Number(e.amount), 0);

          const grouped = {};
          for (const e of expenseList) {
            const cat = e.category || 'other';
            grouped[cat] = (grouped[cat] || 0) + Number(e.amount);
          }
          const cats = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
          const maxAmt = cats.length > 0 ? cats[0][1] : 1;

          return (
            <View style={styles.analyticsWrap}>
              {/* Summary chips */}
              <View style={styles.analyticsChips}>
                <View style={[styles.analyticsChip, { backgroundColor: theme.inputBg }]}>
                  <Text style={[styles.analyticsChipVal, { color: theme.fgPrimary }]}>${weekTotal.toFixed(0)}</Text>
                  <Text style={[styles.analyticsChipLabel, { color: theme.fgTertiary }]}>This Week</Text>
                </View>
                <View style={[styles.analyticsChip, { backgroundColor: theme.inputBg }]}>
                  <Text style={[styles.analyticsChipVal, { color: theme.fgPrimary }]}>${monthTotal.toFixed(0)}</Text>
                  <Text style={[styles.analyticsChipLabel, { color: theme.fgTertiary }]}>This Month</Text>
                </View>
                <View style={[styles.analyticsChip, { backgroundColor: theme.inputBg }]}>
                  <Text style={[styles.analyticsChipVal, { color: theme.fgPrimary }]}>${allTotal.toFixed(0)}</Text>
                  <Text style={[styles.analyticsChipLabel, { color: theme.fgTertiary }]}>All Time</Text>
                </View>
              </View>

              {/* Bar chart */}
              {cats.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.fgTertiary }]}>No expenses yet</Text>
              ) : (
                <>
                  {cats.map(([cat, amt]) => {
                    const barColor = CAT_COLORS[cat] || CAT_COLORS.other;
                    const pct = (amt / maxAmt) * 100;
                    return (
                      <View key={cat} style={styles.analyticsRow}>
                        <Text style={[styles.analyticsCatLabel, { color: theme.fgTertiary }]}>{cat}</Text>
                        <View style={styles.analyticsBarTrack}>
                          <View
                            style={[
                              styles.analyticsBar,
                              { width: `${pct}%`, backgroundColor: barColor },
                            ]}
                          />
                        </View>
                        <Text style={[styles.analyticsAmt, { color: theme.fgPrimary }]}>${amt.toFixed(0)}</Text>
                      </View>
                    );
                  })}
                  <View style={[styles.analyticsTotalRow, { borderTopColor: theme.divider }]}>
                    <Text style={[styles.listSub, { color: theme.fgTertiary }]}>Total this month</Text>
                    <Text style={[styles.analyticsChipVal, { color: '#34d399' }]}>${monthTotal.toFixed(2)}</Text>
                  </View>
                </>
              )}
            </View>
          );
        })()}
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
            <Pressable
              onPress={() => navigation.navigate('Chat', { readText: n.content || n.title || '' })}
              hitSlop={8}
              style={styles.readBtn}
            >
              <MaterialIcons name="volume-up" size={16} color="#a78bfa" />
            </Pressable>
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

      {/* Knowledge Base */}
      {kb.length > 0 && (
        <Card icon="library-books" label="Knowledge Base" color="#a78bfa" collapsible>
          {kb.slice(0, 20).map((entry) => (
            <Pressable
              key={entry.id}
              onLongPress={() => {
                Alert.alert(
                  'Delete entry?',
                  entry.title,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => handleDeleteKbEntry(entry.id) },
                  ]
                );
              }}
              style={[styles.listRow, { borderBottomColor: theme.divider }]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Text style={[styles.listMain, { color: theme.fgSecondary, flex: 1 }]} numberOfLines={1}>
                    {entry.title}
                  </Text>
                  <View style={[styles.kbCategoryChip, { borderColor: '#a78bfa40' }]}>
                    <Text style={[styles.kbCategoryText, { color: '#a78bfa' }]}>{entry.category}</Text>
                  </View>
                </View>
                <Text style={[styles.listSub, { color: theme.fgTertiary }]} numberOfLines={2}>
                  {(entry.content || '').slice(0, 60)}
                </Text>
              </View>
            </Pressable>
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
  readBtn: { padding: 6, marginLeft: 4 },
  durationBarTrack: {
    height: 6, borderRadius: 3, width: '100%',
    backgroundColor: 'rgba(96, 165, 250, 0.15)', overflow: 'hidden',
    marginVertical: 4,
  },
  durationBar: {
    height: '100%', borderRadius: 3, backgroundColor: '#60a5fa',
  },
  analyticsWrap: { paddingHorizontal: 16, paddingBottom: 14 },
  analyticsChips: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  analyticsChip: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  analyticsChipVal: { fontSize: 16, fontWeight: '700' },
  analyticsChipLabel: { fontSize: 10, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  analyticsRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8,
  },
  analyticsCatLabel: {
    width: 64, fontSize: 11, fontWeight: '600', textTransform: 'capitalize',
  },
  analyticsBarTrack: {
    flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(128,128,128,0.15)', overflow: 'hidden',
  },
  analyticsBar: {
    height: '100%', borderRadius: 5,
  },
  analyticsAmt: {
    width: 44, fontSize: 12, fontWeight: '600', textAlign: 'right',
  },
  analyticsTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  kbCategoryChip: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1,
  },
  kbCategoryText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
});
