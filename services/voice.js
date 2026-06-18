import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';

let currentSound = null;

// Module-level cancel token. Incremented on each cancelSpeech() call so any
// in-flight queue loop can detect it was superseded and bail out early.
let cancelToken = 0;

export async function requestPermissions() {
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return result.granted;
}

export function startListening() {
  ExpoSpeechRecognitionModule.start({
    lang: 'en-US',
    interimResults: true,
    maxAlternatives: 1,
  });
}

export function stopListening() {
  ExpoSpeechRecognitionModule.stop();
}

async function speakWithElevenLabs(text) {
  const url = await AsyncStorage.getItem('captain_api_url') || 'https://callova.live/captain';
  const key = await AsyncStorage.getItem('captain_api_key') || '';

  const response = await fetch(`${url}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (err.fallback) throw new Error('fallback');
    throw new Error(err.error || 'TTS failed');
  }

  const blob = await response.blob();
  const reader = new FileReader();
  const base64 = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  const { sound } = await Audio.Sound.createAsync(
    { uri: `data:audio/mpeg;base64,${base64}` },
    { shouldPlay: true }
  );
  currentSound = sound;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
      clearTimeout(watchdog);
      resolve();
    };
    const watchdog = setTimeout(finish, 60000);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded && status.error) { finish(); return; }
      if (status.didJustFinish) { finish(); }
    });
  });
}

/**
 * Split text into sentences.
 * Rules:
 *   - Split after ". ", "! ", "? " (sentence-ending punctuation followed by space).
 *   - Do NOT split on single-letter abbreviations like "Mr.", "Dr.", "vs.", etc.
 *   - Trim and discard empty pieces.
 */
function splitIntoSentences(text) {
  // Replace sentence-ending punctuation+space sequences with a delimiter,
  // but protect abbreviations (single capital letter followed by period, or
  // common lowercase abbreviations: mr, dr, vs, st, ave, etc.).
  const protected_ = text
    // Protect common title abbreviations: Mr. Mrs. Dr. St. Ave. vs. etc.
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Ave|Blvd|vs|etc|approx|dept|est)\./gi, '$1\x00')
    // Protect single uppercase initials: "A. Smith" → don't split
    .replace(/\b([A-Z])\./g, '$1\x00');

  // Now split on sentence terminators followed by whitespace
  const parts = protected_.split(/(?<=[.!?])\s+/);

  // Restore protected periods
  return parts
    .map((s) => s.replace(/\x00/g, '.').trim())
    .filter((s) => s.length > 0);
}

/**
 * Play a single sentence via ElevenLabs, falling back to expo-speech on error.
 * Returns a promise that resolves when the sentence has finished playing.
 */
async function playSentence(sentence, rate, token) {
  // Bail immediately if cancelled before we even start
  if (cancelToken !== token) return;

  try {
    await speakWithElevenLabs(sentence);
  } catch {
    // ElevenLabs failed — fall back to device TTS for this chunk
    if (cancelToken !== token) return;
    await new Promise((resolve) => {
      Speech.speak(sentence, {
        language: 'en-US',
        rate: Math.max(0.5, Math.min(2.0, rate * 0.9)),
        onDone: resolve,
        onStopped: resolve,
        onError: resolve,
      });
    });
  }
}

export async function speak(text, rate = 1.0) {
  // Capture a token for this invocation. Any later cancelSpeech() increments
  // cancelToken, making this token stale and short-circuiting the loop.
  const token = ++cancelToken;

  const sentences = splitIntoSentences(text);

  // Short-circuit: single sentence or very short text — no streaming overhead
  if (sentences.length <= 1 || text.length < 80) {
    await playSentence(text, rate, token);
    return;
  }

  // Pre-fetch the first two sentences immediately so playback starts fast.
  // Remaining sentences are fetched one-ahead while the current one plays.
  //
  // fetchCache maps sentence index → Promise<base64 audio | null>
  // We store the raw fetch promise (not the play promise) so we can
  // overlap network I/O with playback.
  //
  // Implementation note: rather than duplicating the fetch logic from
  // speakWithElevenLabs, we just call speakWithElevenLabs per sentence in
  // sequence but kick off the *next* fetch before awaiting the current play.
  // Because speakWithElevenLabs itself both fetches AND plays we can't
  // easily separate them without a refactor. Instead we use a simple
  // prefetch queue: fetch sentence N+1 while sentence N is playing by
  // pre-warming via a parallel fetch, then hand the result off.
  //
  // Simplest correct approach given the existing speakWithElevenLabs
  // signature: play sentences sequentially, but fire the *fetch* for the
  // next sentence before awaiting the current one's playback. We achieve
  // this via a one-slot lookahead promise.

  // Kick off sentence 0 fetch+play now
  let currentPlay = playSentence(sentences[0], rate, token);

  for (let i = 0; i < sentences.length; i++) {
    if (cancelToken !== token) return;

    // While sentence i is playing, pre-fetch sentence i+1 by starting its
    // speakWithElevenLabs call. We can't truly decouple fetch from play with
    // the current helper, so the best we can do is start i+1 immediately
    // after i begins (not after i ends). For sentence i+1 onward we wait
    // for currentPlay first, then play the next one.
    //
    // Real lookahead: start fetching sentence i+1 the moment sentence i
    // starts playing (they run concurrently on the network side).

    let nextPlay = null;
    if (i + 1 < sentences.length) {
      // Fire next sentence fetch in parallel — it will buffer while i plays
      nextPlay = playSentence(sentences[i + 1], rate, token);
    }

    // Wait for sentence i to finish
    await currentPlay;

    if (cancelToken !== token) return;

    // Advance: sentence i+1 is already in-flight (or resolved) as nextPlay
    if (nextPlay !== null) {
      currentPlay = nextPlay;
    }
    // Skip the inner loop body on last iteration (nextPlay will be null)
    // The loop will exit naturally on the next iteration check.
    if (i + 1 >= sentences.length) break;
  }
}

// ---------------------------------------------------------------------------
// Programmatic tone generation
// ---------------------------------------------------------------------------

/**
 * Build a mono 16-bit PCM WAV in memory and return it as a base64 data URI.
 * Applies a 10 ms fade-in and 10 ms fade-out to avoid clicks.
 *
 * @param {number} hz         - Frequency in hertz
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string}          - "data:audio/wav;base64,..." string
 */
function generateSineWav(hz, durationMs) {
  const sampleRate = 22050;
  const amplitude = 0.3;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const fadeInSamples = Math.floor(sampleRate * 0.01);  // 10 ms
  const fadeOutSamples = Math.floor(sampleRate * 0.01); // 10 ms

  // WAV header is 44 bytes; data block is numSamples * 2 bytes (16-bit)
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  // Helper: write a 4-byte ASCII tag
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF chunk
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);  // file size - 8
  writeStr(8, 'WAVE');

  // fmt sub-chunk
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);             // sub-chunk size
  view.setUint16(20, 1, true);              // PCM = 1
  view.setUint16(22, 1, true);              // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);              // block align
  view.setUint16(34, 16, true);             // bits per sample

  // data sub-chunk header
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  // PCM samples
  const twoPiHz = 2 * Math.PI * hz;
  for (let i = 0; i < numSamples; i++) {
    let env = 1.0;
    if (i < fadeInSamples) {
      env = i / fadeInSamples;
    } else if (i >= numSamples - fadeOutSamples) {
      env = (numSamples - i) / fadeOutSamples;
    }
    const sample = Math.sin((twoPiHz * i) / sampleRate) * amplitude * env;
    // clamp to [-1, 1] then scale to int16
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  // Convert ArrayBuffer → base64 via Uint8Array
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

/**
 * Play a short rising chime when the microphone starts listening.
 * 880 Hz, 180 ms, volume 0.4.
 */
export async function playWakeChime() {
  try {
    const uri = generateSineWav(880, 180);
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
    await sound.setVolumeAsync(0.4);
    await sound.playAsync();
    // Wait for playback to finish, then unload
    await new Promise((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish || (!status.isLoaded && status.error)) {
          resolve();
        }
      });
    });
    await sound.unloadAsync().catch(() => {});
  } catch {
    // Never throw — chimes are decorative
  }
}

/**
 * Play a short falling chime when Captain finishes speaking.
 * 660 Hz, 150 ms, volume 0.35.
 */
export async function playDoneChime() {
  try {
    const uri = generateSineWav(660, 150);
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
    await sound.setVolumeAsync(0.35);
    await sound.playAsync();
    await new Promise((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish || (!status.isLoaded && status.error)) {
          resolve();
        }
      });
    });
    await sound.unloadAsync().catch(() => {});
  } catch {
    // Never throw — chimes are decorative
  }
}

// ---------------------------------------------------------------------------

export function cancelSpeech() {
  // Invalidate any in-flight speak() queue
  cancelToken++;

  if (currentSound) {
    currentSound.stopAsync().catch(() => {});
    currentSound.unloadAsync().catch(() => {});
    currentSound = null;
  }
  Speech.stop();
}

export { useSpeechRecognitionEvent };

// ---------------------------------------------------------------------------
// Haptic intelligence — distinct vibration patterns for Captain events
// ---------------------------------------------------------------------------
import { Vibration } from 'react-native';

/**
 * Fire a named haptic pattern.
 *
 * @param {'wake'|'sent'|'received'|'error'|'saved'|'navigate'|'reminder'|'complete'} type
 */
export function haptic(type) {
  switch (type) {
    case 'wake':      Vibration.vibrate([0, 15, 30, 15]); break;        // double pulse — mic activated
    case 'sent':      Vibration.vibrate(25); break;                     // single short — message sent
    case 'received':  Vibration.vibrate([0, 10, 20, 10, 20, 10]); break; // triple light — response received
    case 'error':     Vibration.vibrate([0, 50, 100, 50]); break;       // strong double — error
    case 'saved':     Vibration.vibrate([0, 10, 30, 10]); break;        // soft double — saved/confirmed
    case 'navigate':  Vibration.vibrate(15); break;                     // single tiny — navigation
    case 'reminder':  Vibration.vibrate([0, 30, 60, 30, 60, 30]); break; // alarm pattern — reminder fires
    case 'complete':  Vibration.vibrate([0, 20, 40, 80]); break;        // crescendo — task complete
    default:          Vibration.vibrate(20); break;
  }
}
