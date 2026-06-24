import { Alert } from 'react-native';

/**
 * Cross-platform notification helper (native implementation).
 *
 * Why this exists: `Alert.alert` is a no-op on web. Navigation and critical
 * messaging must never depend on it. Use inline messages for anything that
 * gates a flow; use `notify` only for incidental, non-blocking feedback.
 *
 * The web counterpart lives in `dialog.web.ts` (Metro picks it for web).
 */
export function notify(title: string, message?: string) {
  Alert.alert(title, message);
}
