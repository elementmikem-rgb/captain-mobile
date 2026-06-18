const fs = require('fs');
let c = fs.readFileSync('screens/ChatScreen.js', 'utf8');

const SEARCH = `      {/* Weather alert banner */}
      {weatherAlert && (`;

const REPLACE = `      {/* Routine active banner */}
      {activeRoutine && (
        <Animated.View style={[routineStyles.banner, { opacity: routineBannerAnim }]}>
          <MaterialIcons name="play-circle-filled" size={15} color="#60a5fa" />
          <Text style={routineStyles.bannerTitle}>{activeRoutine.name} ROUTINE</Text>
          <Text style={routineStyles.bannerStep}>
            Step {activeRoutine.step}/{activeRoutine.totalSteps}
          </Text>
        </Animated.View>
      )}

      {/* Weather alert banner */}
      {weatherAlert && (`;

if (!c.includes(SEARCH)) { console.error('SEARCH not found'); process.exit(1); }
c = c.replace(SEARCH, REPLACE);
fs.writeFileSync('screens/ChatScreen.js', c, 'utf8');
console.log('Routine banner JSX inserted. File size:', c.length);
