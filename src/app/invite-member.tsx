import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError, type Receipt, type ServerPreparedAction } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton } from '@/components/fin/Buttons';
import { ConfirmSheet } from '@/components/fin/ConfirmSheet';
import { Segments } from '@/components/fin/Segments';
import { Panel, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, radius, screenPad, space, type ColorTokens } from '@/design/tokens';
import { useDomain } from '@/domain/store';

// Add a family member — real invitation through the gateway. The receipt
// carries the invite code; the member joins with it (binding their Privy
// identity in live mode) and appears as Active.

const ROLES = ['teen', 'child', 'adult', 'dependent'] as const;
const ROLE_LABELS = ['Teen', 'Child', 'Adult', 'Senior'];

export default function InviteMemberScreen() {
  const { headers } = useAuth();
  const { refresh } = useDomain();
  const toast = useToast();
  const colors = useColors();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [roleIndex, setRoleIndex] = useState(0);
  const [limitText, setLimitText] = useState('');
  const [prepared, setPrepared] = useState<ServerPreparedAction | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<Receipt | null>(null);

  const limit = Number(limitText.replace(/[^0-9]/g, ''));

  const prepare = async () => {
    if (name.trim().length < 2) return toast('Enter the member\'s name.');
    setPreparing(true);
    try {
      setPrepared(
        await api.prepareAction(headers, {
          kind: 'invite_member',
          name: name.trim(),
          role: ROLES[roleIndex],
          relationship: relationship.trim() || undefined,
          monthlyLimit: limit > 0 ? limit : undefined,
        }),
      );
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not prepare the invite.');
    } finally {
      setPreparing(false);
    }
  };

  const inviteCode = result?.rows.find((r) => r.label === 'Invite code')?.value;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Add family member" back />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {result ? (
          <Panel style={{ gap: space.m, borderColor: colors.mintBorder }}>
            <AppText variant="section">Invitation ready</AppText>
            <AppText variant="secondary" tone={colors.textTertiary}>
              Share this code — they sign in with their own account and enter it to join the household.
            </AppText>
            <AppText variant="hero" tabular style={{ fontSize: 34, letterSpacing: 4 }}>
              {inviteCode}
            </AppText>
            <AppText variant="caption" tone={colors.textTertiary}>
              {result.actor} · recorded in Activity
            </AppText>
          </Panel>
        ) : (
          <Panel style={{ gap: space.l }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              accessibilityLabel="Member name"
            />
            <TextInput
              value={relationship}
              onChangeText={setRelationship}
              placeholder="Relationship (optional), e.g. Daughter"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              accessibilityLabel="Relationship"
            />
            <View style={{ gap: 6 }}>
              <AppText variant="label">Role</AppText>
              <Segments dense labels={[...ROLE_LABELS]} index={roleIndex} onChange={setRoleIndex} />
            </View>
            <TextInput
              value={limitText}
              onChangeText={setLimitText}
              keyboardType="number-pad"
              placeholder="Monthly limit in ₹ (optional)"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              accessibilityLabel="Monthly limit"
            />
            <PrimaryButton label="Review invitation" loading={preparing} onPress={() => void prepare()} />
          </Panel>
        )}
      </ScrollView>

      {prepared ? (
        <ConfirmSheet
          visible
          title="Review invitation"
          subject={prepared.subject}
          facts={prepared.facts.map((f, i) => ({ ...f, emphasis: i === 0 }))}
          note={prepared.note}
          cta={prepared.cta}
          onConfirm={async () => {
            const receipt = await api.executeAction(headers, prepared.id, prepared.factsHash, `app-${prepared.id}`);
            setResult(receipt);
            toast('Invitation created.');
            await refresh();
          }}
          onClose={() => setPrepared(null)}
        />
      ) : null}
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: screenPad, paddingBottom: 60, gap: space.xl },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    color: colors.textPrimary,
    fontFamily: font.medium,
    fontSize: 15,
    paddingHorizontal: space.l,
    paddingVertical: 12,
  },
});
}

