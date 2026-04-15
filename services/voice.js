import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';

let currentSound = null;

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
  const key = await AsyncStorage.getItem('captain_api_key') || 'Ml2znOnV_iylluaiXn-9Me8JIHVP0eu95yw-V6koqlI';

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
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        sound.unloadAsync();
        currentSound = null;
        resolve();
      }
    });
  });
}

export async function speak(text) {
  try {
    await speakWithElevenLabs(text);
  } catch {
    await new Promise((resolve) => {
      Speech.speak(text, {
        language: 'en-US',
        rate: 0.9,
        onDone: resolve,
        onStopped: resolve,
        onError: resolve,
      });
    });
  }
}

export function cancelSpeech() {
  if (currentSound) {
    currentSound.stopAsync().catch(() => {});
    currentSound.unloadAsync().catch(() => {});
    currentSound = null;
  }
  Speech.stop();
}

export { useSpeechRecognitionEvent };
