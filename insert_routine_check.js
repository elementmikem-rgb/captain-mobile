const fs = require('fs');
let c = fs.readFileSync('screens/ChatScreen.js', 'utf8');

const SEARCH = `    // ── Macro detection (voice shortcuts) ───────────────────────────────────
    if (!imagePayload && userText) {
      const macro = checkMacro(userText);`;

const REPLACE = `    // ── Routine detection (runs before macro check) ────────────────────────
    if (!imagePayload && userText) {
      const routine = checkRoutine(userText);
      if (routine) {
        // Don't show the user message for routine triggers — announce msg is added by executeRoutine
        inFlightRef.current = false;
        setIsProcessing(false);
        executeRoutine(routine);
        return;
      }
    }

    // ── Macro detection (voice shortcuts) ───────────────────────────────────
    if (!imagePayload && userText) {
      const macro = checkMacro(userText);`;

if (!c.includes(SEARCH)) { console.error('SEARCH not found'); process.exit(1); }
c = c.replace(SEARCH, REPLACE);
fs.writeFileSync('screens/ChatScreen.js', c, 'utf8');
console.log('Routine check inserted into handleSend. File size:', c.length);
