import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { theme } from '@/lib/theme';

export type OrbMode = 'idle' | 'listening' | 'speaking';

const SIZE = 200;
const COLORS = [theme.orbIdle, theme.orbListening, theme.orbSpeaking];

/**
 * The single expressive orb — the whole design system.
 *
 * @param mode   idle | listening | speaking (drives colour + behaviour)
 * @param level  0..1 audio level shared value (mic input, or agent output while speaking)
 */
export function Orb({ mode, level }: { mode: OrbMode; level: SharedValue<number> }) {
  // Continuous gentle breathing used when idle.
  const breath = useSharedValue(0);
  // 0 = idle, 1 = listening, 2 = speaking — animated for smooth colour/behaviour transitions.
  const phase = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [breath]);

  useEffect(() => {
    const target = mode === 'idle' ? 0 : mode === 'listening' ? 1 : 2;
    phase.value = withTiming(target, { duration: 450, easing: Easing.out(Easing.ease) });
  }, [mode, phase]);

  // Lightly smoothed level so the orb glides rather than jitters.
  const smooth = useDerivedValue(() => level.value, [level]);

  const coreStyle = useAnimatedStyle(() => {
    const breathing = interpolate(breath.value, [0, 1], [0.95, 1.05]);
    const reactive = 1 + smooth.value * 0.5;
    // Blend from breathing (idle) into level-reactive (active) as phase rises.
    const active = Math.min(phase.value, 1);
    const scale = breathing * (1 - active) + reactive * active;
    const backgroundColor = interpolateColor(phase.value, [0, 1, 2], COLORS);
    return { transform: [{ scale }], backgroundColor };
  });

  const ring1Style = useAnimatedStyle(() => {
    const active = Math.min(phase.value, 1);
    const scale = 1 + smooth.value * 0.9 * active + 0.08 * active;
    const opacity = (0.35 - smooth.value * 0.15) * active;
    const borderColor = interpolateColor(phase.value, [0, 1, 2], COLORS);
    return { transform: [{ scale }], opacity, borderColor };
  });

  const ring2Style = useAnimatedStyle(() => {
    const active = Math.min(phase.value, 1);
    const scale = 1 + smooth.value * 1.5 * active + 0.18 * active;
    const opacity = (0.18 - smooth.value * 0.08) * active;
    const borderColor = interpolateColor(phase.value, [0, 1, 2], COLORS);
    return { transform: [{ scale }], opacity, borderColor };
  });

  const glowStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(phase.value, [0, 1, 2], COLORS);
    const opacity = interpolate(phase.value, [0, 1, 2], [0.12, 0.2, 0.28]);
    return { backgroundColor, opacity };
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.ring, ring2Style]} />
      <Animated.View style={[styles.ring, ring1Style]} />
      <Animated.View style={[styles.core, coreStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE * 2, height: SIZE * 2, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: SIZE * 1.7,
    height: SIZE * 1.7,
    borderRadius: SIZE,
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
  core: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    // soft elevation/shadow for depth (web + native)
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
