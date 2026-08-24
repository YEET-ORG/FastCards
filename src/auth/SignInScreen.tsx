import { Ionicons } from '@expo/vector-icons';
import { useLoginWithEmail } from '@privy-io/expo';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEV_USERS, useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/fin/primitives';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, icon, screenPad, space } from '@/design/tokens';

// Sign-in (spec UI §38): "Your money, one conversation away." Live login
// is Privy email OTP — the code arrives by mail, the server binds the
// DID to a household user (first login claims the owner; later logins
// need an invite). Dev sessions remain for local work.

type Step = 'idle' | 'email' | 'code';

export function SignInScreen() {
  const { signInDev, privyError, retryPrivy, setSignUpName } = useAuth();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const [step, setStep] = useState<Step>('idle');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sendCode, loginWithCode } = useLoginWithEmail({
    onError: (e) => {
      setBusy(false);
      setError(e.message);
    },
  });

  const startEmail = () => {
    setError(null);
    setStep('email');
  };

  const submitEmail = async () => {
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    const value = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendCode({ email: value });
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (code.trim().length < 4) {
      setError('Enter the code from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Handed over before the login lands, so the name is already in hand when
      // AuthContext's Privy bridge exchanges the token for a server session —
      // onboarding then opens on a greeting that knows who this is.
      setSignUpName(name);
      // AuthContext picks the Privy user up and resolves the server session.
      await loginWithCode({ code: code.trim(), email: email.trim().toLowerCase() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  const shownError = error ?? privyError;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + space.x40, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.hero}>
        <AppText variant="label" tone={colors.accentInk}>
          KAMI
        </AppText>
        <AppText variant="hero" style={{ fontSize: 38, lineHeight: 44 }}>
          Your money, one conversation away.
        </AppText>
        <AppText variant="secondary">
          Cards, family controls, global money and AI — in one place.
        </AppText>
      </View>

      <View style={{ gap: space.m }}>
        {step === 'idle' ? (
          <>
            <Pressable
              onPress={startEmail}
              accessibilityRole="button"
              style={({ pressed }) => [styles.privyBtn, { backgroundColor: colors.accent }, pressed && { opacity: 0.8 }]}>
              <Ionicons name="mail-outline" size={icon.meta} color={colors.onAccent} />
              <AppText variant="cardTitle" tone={colors.onAccent}>
                Continue with email
              </AppText>
            </Pressable>

            <AppText variant="label" style={{ marginTop: space.l }}>
              Or continue as (dev)
            </AppText>
            {DEV_USERS.map((u) => (
              <Pressable
                key={u.userId}
                onPress={() => signInDev(u.userId)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.userRow, { backgroundColor: colors.cream, borderColor: colors.line }, pressed && { backgroundColor: colors.inset }]}>
                <Avatar name={u.name} size={40} />
                <View style={{ flex: 1 }}>
                  <AppText variant="cardTitle">{u.name}</AppText>
                  <AppText variant="secondary" tone={colors.textTertiary}>
                    {u.role === 'owner' ? 'Household owner · platform admin' : 'Teen member'}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </>
        ) : null}

        {step === 'email' ? (
          <>
            <AppText variant="label">Sign in with email</AppText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              autoFocus
              accessibilityLabel="Your name"
              style={[styles.input, { backgroundColor: colors.raised, borderColor: colors.line, color: colors.textPrimary, fontFamily: font.medium }]}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              accessibilityLabel="Email address"
              style={[styles.input, { backgroundColor: colors.raised, borderColor: colors.line, color: colors.textPrimary, fontFamily: font.medium }]}
            />
            <Pressable
              onPress={submitEmail}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.privyBtn, { backgroundColor: colors.accent }, (pressed || busy) && { opacity: 0.8 }]}>
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <AppText variant="cardTitle" tone={colors.onAccent}>
                  Send code
                </AppText>
              )}
            </Pressable>
            <Pressable onPress={() => setStep('idle')} accessibilityRole="button" style={styles.linkBtn}>
              <AppText variant="secondary" tone={colors.textTertiary}>
                Back
              </AppText>
            </Pressable>
          </>
        ) : null}

        {step === 'code' ? (
          <>
            <AppText variant="label">Enter the code sent to {email.trim()}</AppText>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              autoFocus
              accessibilityLabel="One-time code"
              style={[styles.input, styles.codeInput, { backgroundColor: colors.raised, borderColor: colors.lineStrong, color: colors.textPrimary, fontFamily: font.medium }]}
            />
            <Pressable
              onPress={submitCode}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.privyBtn, { backgroundColor: colors.accent }, (pressed || busy) && { opacity: 0.8 }]}>
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <AppText variant="cardTitle" tone={colors.onAccent}>
                  Sign in
                </AppText>
              )}
            </Pressable>
            <Pressable onPress={() => setStep('email')} accessibilityRole="button" style={styles.linkBtn}>
              <AppText variant="secondary" tone={colors.textTertiary}>
                Use a different email
              </AppText>
            </Pressable>
          </>
        ) : null}

        {shownError ? (
          <View style={{ gap: space.s }}>
            <AppText variant="secondary" tone={colors.errorInk} accessibilityLiveRegion="polite">
              {shownError}
            </AppText>
            {privyError ? (
              <Pressable onPress={retryPrivy} accessibilityRole="button" style={styles.linkBtn}>
                <AppText variant="secondary" tone={colors.accentInk}>
                  Try again
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: screenPad,
    justifyContent: 'space-between',
  },
  hero: {
    gap: space.m,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderWidth: 1,
    borderRadius: 16,
    padding: space.l,
  },
  privyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    borderRadius: 999,
    minHeight: 52,
    marginTop: space.s,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: space.l,
    fontSize: 16,
  },
  codeInput: {
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: space.s,
  },
});
