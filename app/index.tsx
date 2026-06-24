import VoiceScreen from '@/components/voice/voice';

/**
 * The entire signed-in experience: one animated orb.
 *
 * `@/components/voice/voice` resolves per platform via Metro:
 *   - voice.web.tsx    → @elevenlabs/react        (browser)
 *   - voice.native.tsx → @elevenlabs/react-native (iOS / Android)
 *   - voice.tsx        → fallback so the import always resolves
 * Keeping the SDK split there means native modules never enter the web bundle.
 */
export default function Index() {
  return <VoiceScreen />;
}
