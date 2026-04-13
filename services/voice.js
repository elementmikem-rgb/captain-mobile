import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

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

export async function speak(text) {
  return new Promise((resolve) => {
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.9,
      onDone: resolve,
      onStopped: resolve,
      onError: resolve,
    });
  });
}

export function cancelSpeech() {
  Speech.stop();
}

export { useSpeechRecognitionEvent };
