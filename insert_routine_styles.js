const fs = require('fs');
let c = fs.readFileSync('screens/ChatScreen.js', 'utf8');

const SEARCH = `const dictationStyles = StyleSheet.create({`;

const INSERT = `const routineStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(96, 165, 250, 0.25)',
  },
  bannerTitle: {
    flex: 1,
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  bannerStep: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '500',
  },
});

`;

if (!c.includes(SEARCH)) { console.error('SEARCH not found'); process.exit(1); }
c = c.replace(SEARCH, INSERT + SEARCH);
fs.writeFileSync('screens/ChatScreen.js', c, 'utf8');
console.log('routineStyles inserted. File size:', c.length);
