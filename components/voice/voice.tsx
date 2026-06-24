import { useSharedValue } from 'react-native-reanimated';
import { VoiceLayout } from './VoiceLayout';

/**
 * Platform fallback so `import '@/components/voice/voice'` always resolves.
 * At runtime Metro picks voice.web.tsx (browser) or voice.native.tsx (iOS/Android);
 * this file only renders if a future platform has neither.
 */
export default function VoiceScreen() {
  const level = useSharedValue(0);
  return (
    <VoiceLayout
      mode="idle"
      level={level}
      status="disconnected"
      busy={false}
      startDisabled
      error="Voice isn't supported on this platform yet."
      onStart={() => {}}
      onStop={() => {}}
    />
  );
}
