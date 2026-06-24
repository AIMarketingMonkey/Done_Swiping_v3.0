// @ts-ignore — installed during native setup (see SETUP.md → "Enable native voice").
// Kept out of package.json by default so the web path installs cleanly; this file
// never enters the web bundle (Metro resolves voice.web.tsx for web).
import { useConversation } from '@elevenlabs/react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { OrbMode } from '@/components/Orb';
import { callEdge } from '@/lib/edge';
import { VoiceLayout, type VoiceStatus } from './VoiceLayout';

type TokenResponse = { signedUrl: string; userId: string };

/**
 * Native (iOS / Android) voice screen.
 *
 * VERIFY AT BUILD TIME (the SDK moves): the `@elevenlabs/react-native`
 * `useConversation` surface — `status`, `isSpeaking`, `startSession(...)`, and
 * whether input/output volume getters exist. If they don't, we fall back to a
 * gentle synthetic pulse so the orb still reacts to who's talking. See SETUP.md.
 */
export default function VoiceScreen() {
  const level = useSharedValue(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseRef = useRef(0);

  const conversation = useConversation({
    onConnect: () => setError(null),
    onDisconnect: () => {
      level.value = 0;
    },
    onError: (e: unknown) => setError(messageFor(e)),
  });

  const status = mapStatus(conversation.status);
  const isSpeaking = !!conversation.isSpeaking;
  const mode: OrbMode = status === 'connected' ? (isSpeaking ? 'speaking' : 'listening') : 'idle';

  useEffect(() => {
    if (status === 'connected' && timerRef.current == null) {
      timerRef.current = setInterval(() => {
        let v: number | null = null;
        try {
          const read = isSpeaking ? conversation.getOutputVolume : conversation.getInputVolume;
          if (typeof read === 'function') v = read.call(conversation) ?? null;
        } catch {
          v = null;
        }
        if (v == null) {
          // Synthetic fallback: a soft pulse keyed to who is speaking.
          pulseRef.current += 0.25;
          const base = isSpeaking ? 0.45 : 0.2;
          v = base + Math.abs(Math.sin(pulseRef.current)) * 0.2;
        }
        level.value = level.value * 0.7 + Math.min(1, Math.max(0, v)) * 0.3;
      }, 50);
    }
    return () => {
      if (timerRef.current != null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, isSpeaking, conversation, level]);

  const onStart = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await ensureMicPermission();
      const { signedUrl, userId } = await callEdge<TokenResponse>('voice-token');
      await conversation.startSession({ signedUrl, dynamicVariables: { user_id: userId } });
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }, [conversation]);

  const onStop = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch {
      // ignore — disconnect handler resets state
    }
  }, [conversation]);

  return (
    <VoiceLayout
      mode={mode}
      level={level}
      status={status}
      busy={busy || status === 'connecting'}
      error={error}
      onStart={onStart}
      onStop={onStop}
    />
  );
}

async function ensureMicPermission() {
  // iOS surfaces the prompt via NSMicrophoneUsageDescription (app.json) when the
  // SDK opens the mic. Android needs an explicit runtime request.
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Microphone access is needed to talk. Please allow it in Settings and try again.');
    }
  }
}

function mapStatus(status: string): VoiceStatus {
  if (status === 'connected') return 'connected';
  if (status === 'connecting') return 'connecting';
  return 'disconnected';
}

function messageFor(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return msg || 'Could not start the conversation. Please try again.';
}
