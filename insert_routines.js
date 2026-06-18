const fs = require('fs');
let c = fs.readFileSync('screens/ChatScreen.js', 'utf8');

const SEARCH = '  // ── Reading Mode helpers';
const insertPoint = c.indexOf(SEARCH);
if (insertPoint === -1) { console.error('marker not found'); process.exit(1); }

const routineCode = `  // ── Built-in Routines ─────────────────────────────────────────────────────────
  const BUILT_IN_ROUTINES = [
    {
      name: 'MORNING',
      triggers: ['morning routine', 'start my morning', 'good morning captain'],
      announce: (name) => \`Good morning\${name ? ', ' + name : ''}. Starting your morning routine.\`,
      steps: [
        async (addMsg) => {
          addMsg('Fetching your morning briefing...');
          try {
            const data = await getRoutineBriefing();
            const parts = [];
            if (data.weatherSummary) parts.push(\`Weather: \${data.weatherSummary}\`);
            parts.push(\`\${data.bookingCount} booking\${data.bookingCount !== 1 ? 's' : ''} today\`);
            if (data.reminderCount > 0) parts.push(\`\${data.reminderCount} reminder\${data.reminderCount !== 1 ? 's' : ''} pending\`);
            const summary = parts.join('. ');
            addMsg(\`Briefing: \${summary}\`);
            await speak(summary, 1.0);
          } catch {
            addMsg('Could not fetch briefing. Continuing...');
          }
        },
        async (addMsg) => {
          addMsg('Checking for urgent messages...');
          await speak('Do you have any urgent messages you need to address this morning?', 1.0);
        },
        async (addMsg, setChips) => {
          addMsg('Morning routine complete.');
          setChips(['Add reminder', 'Check expenses', 'Set intention']);
        },
      ],
    },
    {
      name: 'EVENING',
      triggers: ['evening routine', 'wrap up my day', 'end of day captain'],
      announce: () => 'Wrapping up your day.',
      steps: [
        async (addMsg) => {
          addMsg('Fetching your day summary...');
          try {
            const data = await getRoutineBriefing();
            const bookingText = \`\${data.bookingCount} booking\${data.bookingCount !== 1 ? 's' : ''} today\`;
            const summary = \`Here is your day summary. \${bookingText}.\`;
            addMsg(summary);
            await speak(summary, 1.0);
          } catch {
            addMsg('Could not fetch day summary. Continuing...');
          }
        },
        async (addMsg) => {
          addMsg('Thinking about tomorrow...');
          await speak('What should you focus on tomorrow? Think about your top priority.', 1.0);
        },
        async (addMsg) => {
          addMsg('Evening routine complete. Save a session summary?');
          await speak('Would you like me to save a session summary for today?', 1.0);
        },
      ],
    },
    {
      name: 'FOCUS',
      triggers: ['focus routine', 'deep work mode', 'i need to focus'],
      announce: () => 'Entering focus mode.',
      steps: [
        async (addMsg) => {
          addMsg('Enabling whisper mode, disabling ambient mode...');
          const saved = await AsyncStorage.getItem('captain_settings');
          const current = saved ? JSON.parse(saved) : {};
          const updated = { ...current, whisperMode: true, ambientMode: false };
          await AsyncStorage.setItem('captain_settings', JSON.stringify(updated));
          setAppSettings(prev => ({ ...prev, whisperMode: true, ambientMode: false }));
        },
        async (addMsg) => {
          addMsg("Focus mode on. I'll only interrupt for urgent items.");
          await speak("Focus mode on. I'll only interrupt for urgent items.", 1.0);
        },
        async (addMsg, setChips) => {
          addMsg('Set a focus timer? Say a duration.');
          setChips(['25 min timer', '45 min timer', '60 min timer']);
        },
      ],
    },
    {
      name: 'TRAVEL',
      triggers: ['travel mode', "i'm traveling", 'heading out'],
      announce: () => 'Travel mode on.',
      steps: [
        async (addMsg) => {
          addMsg('Enabling travel mode...');
          const saved = await AsyncStorage.getItem('captain_settings');
          const current = saved ? JSON.parse(saved) : {};
          const updated = { ...current, driveMode: true, ambientMode: true };
          await AsyncStorage.setItem('captain_settings', JSON.stringify(updated));
          setAppSettings(prev => ({ ...prev, driveMode: true, ambientMode: true }));
        },
        async (addMsg) => {
          addMsg('Fetching weather...');
          try {
            const data = await getRoutineBriefing();
            const weatherText = data.weatherSummary
              ? \`Weather today: \${data.weatherSummary}.\`
              : 'Weather unavailable.';
            const bookingText = \`You have \${data.bookingCount} booking\${data.bookingCount !== 1 ? 's' : ''} today.\`;
            const travelBrief = \`Travel mode on. \${weatherText} \${bookingText}\`;
            addMsg(travelBrief);
            await speak(travelBrief, 0.9);
          } catch {
            addMsg('Weather unavailable. Travel mode active.');
            await speak('Travel mode on. Have a safe trip.', 0.9);
          }
        },
        async (addMsg) => {
          addMsg('Travel mode active. Drive safe.');
        },
      ],
    },
  ];

  const checkRoutine = useCallback((text) => {
    const lower = text.trim().toLowerCase();
    return BUILT_IN_ROUTINES.find(r => r.triggers.some(t => lower === t || lower.startsWith(t)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeRoutine = useCallback(async (routine) => {
    let userName = null;
    try {
      const s = await AsyncStorage.getItem('captain_onboarding_profile');
      const parsed = s ? JSON.parse(s) : {};
      userName = parsed.name || null;
    } catch {}

    const announce = routine.announce(userName);

    setActiveRoutine({ name: routine.name, step: 0, totalSteps: routine.steps.length });
    routineBannerAnim.setValue(0);
    Animated.timing(routineBannerAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    const announceMsg = {
      id: Date.now(),
      text: \`[\${routine.name} ROUTINE] \${announce}\`,
      isUser: false,
      isSystem: true,
      ts: Date.now(),
    };
    setMessages(prev => {
      const next = [...prev, announceMsg];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    await speak(announce, 1.0);

    const addStepMsg = (text) => {
      const msg = {
        id: Date.now() + Math.random(),
        text: \`  \${text}\`,
        isUser: false,
        isSystem: true,
        ts: Date.now(),
      };
      setMessages(prev => {
        const next = [...prev, msg];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    };

    const setRoutineChips = (labels) => {
      const chips = labels.map(label => ({
        label,
        onPress: () => handleSend(label),
      }));
      setContextChips(chips);
      chipAnim.setValue(0);
      Animated.timing(chipAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    };

    for (let i = 0; i < routine.steps.length; i++) {
      setActiveRoutine({ name: routine.name, step: i + 1, totalSteps: routine.steps.length });
      try {
        await routine.steps[i](addStepMsg, setRoutineChips);
      } catch (e) {
        addStepMsg(\`Step error: \${e.message}\`);
      }
      if (i < routine.steps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    Animated.timing(routineBannerAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setActiveRoutine(null);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineBannerAnim, chipAnim]);
  // ─────────────────────────────────────────────────────────────────────────────

  `;

const newC = c.slice(0, insertPoint) + routineCode + c.slice(insertPoint);
fs.writeFileSync('screens/ChatScreen.js', newC, 'utf8');
console.log('Routines inserted. File size:', newC.length);
