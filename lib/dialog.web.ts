/**
 * Cross-platform notification helper (web implementation).
 * Mirrors the signature of `dialog.ts`; Metro resolves this file on web.
 */
export function notify(title: string, message?: string) {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message ? `${title}\n\n${message}` : title);
  }
}
