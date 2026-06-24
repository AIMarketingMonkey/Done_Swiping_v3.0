import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SharedValue } from 'react-native-reanimated';
import { Orb, type OrbMode } from '@/components/Orb';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export type VoiceStatus = 'disconnected' | 'connecting' | 'connected';

export type VoiceLayoutProps = {
  mode: OrbMode;
  level: SharedValue<number>;
  status: VoiceStatus;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  /** Optional override for the fallback platform. */
  startDisabled?: boolean;
};

/**
 * The whole signed-in screen: an orb, a single control, a text status (for
 * accessibility), and a quiet sign-out. No other chrome.
 */
export function VoiceLayout({
  mode,
  level,
  status,
  busy,
  error,
  onStart,
  onStop,
  startDisabled,
}: VoiceLayoutProps) {
  const insets = useSafeAreaInsets();
  const connected = status === 'connected';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => supabase.auth.signOut()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        <Orb mode={mode} level={level} />
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {statusLabel(mode, status, busy)}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Pressable
        style={[styles.cta, connected && styles.ctaStop, (busy || startDisabled) && styles.ctaDisabled]}
        onPress={connected ? onStop : onStart}
        disabled={busy || (!connected && startDisabled)}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>
          {connected ? 'End conversation' : busy ? 'Connecting…' : 'Start talking'}
        </Text>
      </Pressable>
    </View>
  );
}

function statusLabel(mode: OrbMode, status: VoiceStatus, busy: boolean): string {
  if (busy && status !== 'connected') return 'Connecting…';
  if (status !== 'connected') return "Tap start whenever you're ready.";
  if (mode === 'speaking') return 'Speaking…';
  return 'Listening…';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 24 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  signOut: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  status: { color: theme.textMuted, fontSize: 16, marginTop: 24 },
  error: { color: theme.danger, fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 16, lineHeight: 20 },
  cta: {
    backgroundColor: theme.primary,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    alignSelf: 'center',
    minWidth: 220,
  },
  ctaStop: { backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: theme.text, fontSize: 16, fontWeight: '700' },
});
