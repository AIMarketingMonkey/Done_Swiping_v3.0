import { useConversation } from '@elevenlabs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { OrbMode } from '@/components/Orb';
import { callEdge } from '@/lib/edge';
import { VoiceLayout, type VoiceStatus } from './VoiceLayout';

type TokenResponse = { signedUrl: string; userId: string };

/**
 * Web voice screen.
 *
 * VERIFY AT BUILD TIME (the SDK moves): the exact `useConversation` surface —
 * `status` values, `isSpeaking`, `getInputVolume()` / `getOutputVolume()` (0..1),
 * and `startSession({ signedUrl, dynamicVariables })`. See SETUP.md.
 */
export default function VoiceScreen() {
  const level = useSharedValue(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  const conversation = useConversation({
    onConnect: () => setError(null),
    onDisconnect: () => {
      level.value = 0;
    },
    onError: (e: unknown) => setError(messageFor(e)),
  });

  const status = mapStatus(conversation.status);
  const isSpeaking = conversation.isSpeaking;
  const mode: OrbMode = status === 'connected' ? (isSpeaking ? 'speaking' : 'listening') : 'idle';

  // Drive the orb from live audio levels each frame.
  const tick = useCallback(() => {
    let v = 0;
    try {
      const read = isSpeaking ? conversation.getOutputVolume : conversation.getInputVolume;
      if (typeof read === 'function') v = read.call(conversation) ?? 0;
    } catch {
      v = 0;
    }
    // Exponential smoothing so the orb glides.
    level.value = level.value * 0.7 + Math.min(1, Math.max(0, v)) * 0.3;
    rafRef.current = requestAnimationFrame(tick);
  }, [conversation, isSpeaking, level]);

  useEffect(() => {
    if (status === 'connected') {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [status, tick]);

  const onStart = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // Ask for the mic up front so we can show a clear message if it's blocked.
      await navigator.mediaDevices.getUserMedia({ audio: true });
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

function mapStatus(status: string): VoiceStatus {
  if (status === 'connected') return 'connected';
  if (status === 'connecting') return 'connecting';
  return 'disconnected';
}

function messageFor(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is needed to talk. Please allow it and try again.';
  }
  if (name === 'NotFoundError') return 'No microphone was found on this device.';
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return msg || 'Could not start the conversation. Please try again.';
}
