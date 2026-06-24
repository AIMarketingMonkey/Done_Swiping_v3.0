/**
 * A tiny shared palette so the orb, auth screen and controls stay consistent.
 * Calm, dark, minimal — the orb is the design system.
 */
export const theme = {
  bg: '#0B0B12',
  surface: '#15151F',
  surfaceMuted: '#1E1E2B',
  border: '#2A2A3A',
  text: '#F4F4F8',
  textMuted: '#9A9AB0',
  primary: '#7C5CFF',
  danger: '#FF6B6B',

  // Orb states (also referenced in components/Orb.tsx)
  orbIdle: '#3A8DFF',
  orbListening: '#FF6B8A',
  orbSpeaking: '#7C5CFF',
} as const;
