import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

type Mode = 'signUp' | 'signIn';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function SignInScreen() {
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signUp';
  const emailValid = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= MIN_PASSWORD;
  const canSubmit = emailValid && passwordValid && (!isSignUp || ageConfirmed) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;

        // Record the 18+ self-attestation. The profile row is created by the
        // on-signup trigger, so this is an UPDATE keyed on the new user id.
        const userId = data.user?.id;
        if (userId) {
          await supabase
            .from('profiles')
            .update({ age_confirmed_at: new Date().toISOString() })
            .eq('user_id', userId);
        }

        // With email confirmation OFF (MVP), signUp returns a live session and
        // the root navigator redirects straight to the orb. If a project still
        // has confirmation ON, there is no session yet — tell the user plainly.
        if (!data.session) {
          setError('Check your email to confirm your account, then sign in.');
          setMode('signIn');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
      // On success a session change fires and app/_layout.tsx redirects to '/'.
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.brand}>Done Swiping</Text>
          <Text style={styles.tagline}>No swiping. Just a conversation.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            editable={!submitting}
          />

          <Text style={[styles.label, styles.labelSpacing]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              editable={!submitting}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={10}
              style={styles.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          {isSignUp ? (
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setAgeConfirmed((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ageConfirmed }}
            >
              <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
                {ageConfirmed ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxLabel}>I confirm I'm 18 or over</Text>
            </Pressable>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={styles.submitText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.switchMode}
            onPress={() => {
              setMode(isSignUp ? 'signIn' : 'signUp');
              setError(null);
            }}
            disabled={submitting}
          >
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? Sign in' : "New here? Create an account"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function messageFor(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(raw)) return 'That email and password don’t match.';
  if (/already registered|already exists/i.test(raw)) return 'That email is already registered. Try signing in.';
  if (/password/i.test(raw) && /weak|short|least/i.test(raw)) return 'Please choose a longer password (8+ characters).';
  if (/network|fetch/i.test(raw)) return 'Network problem. Check your connection and try again.';
  return raw || 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  brand: { color: theme.text, fontSize: 32, fontWeight: '700', letterSpacing: 0.3 },
  tagline: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  form: { gap: 0 },
  label: { color: theme.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  labelSpacing: { marginTop: 18 },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
  },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, color: theme.text, fontSize: 16 },
  eyeButton: { paddingHorizontal: 16, paddingVertical: 14 },
  eyeText: { color: theme.primary, fontSize: 14, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: theme.primary, borderColor: theme.primary },
  checkboxTick: { color: theme.text, fontSize: 15, fontWeight: '800', lineHeight: 18 },
  checkboxLabel: { color: theme.text, fontSize: 15 },
  error: { color: theme.danger, fontSize: 14, marginTop: 18, lineHeight: 20 },
  submit: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: theme.text, fontSize: 16, fontWeight: '700' },
  switchMode: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  switchText: { color: theme.textMuted, fontSize: 14 },
});
