import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ConfirmSheet } from '@/components/fin/ConfirmSheet';
import { RuleChip, SectionHeader } from '@/components/fin/primitives';
import { Panel, Screen, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, radius, space, type ColorTokens } from '@/design/tokens';
import { formatMoney } from '@/domain/money';
import { useDomain } from '@/domain/store';

// Card Rules (spec §10, UI §15): AI rule composer on top (routes into the
// Ask thread), manual sections below. Limit and threshold edits go
// through a Proposed-change confirm; channel and category toggles apply
// immediately with a toast and an audit event.

const channelLabels = [
  ['online', 'Online payments'],
  ['contactless', 'Contactless'],
  ['atm', 'ATM withdrawals'],
  ['international', 'International'],
] as const;

export default function CardRules() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useDomain();
  const router = useRouter();
  const toast = useToast();
  const colors = useColors();
  const styles = makeStyles(colors);

  const [editing, setEditing] = useState<'limit' | 'threshold' | null>(null);
  const [amountText, setAmountText] = useState('');
  const [aiText, setAiText] = useState('');

  const card = state.cards.find((c) => c.id === id);
  if (!card) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title="Rules" back />
        <AppText variant="secondary">This card no longer exists.</AppText>
      </Screen>
    );
  }

  const member = card.memberId ? state.members.find((m) => m.id === card.memberId) : undefined;
  const parsedAmount = Number(amountText.replace(/[^0-9]/g, ''));
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const openEditor = (kind: 'limit' | 'threshold') => {
    setAmountText(
      String(kind === 'limit' ? (card.monthlyCap ?? 0) : (card.approvalAbove ?? 0)) || '',
    );
    setEditing(kind);
  };

  const askAI = () => {
    const q = aiText.trim();
    if (!q) return;
    setAiText('');
    router.push({ pathname: '/chat', params: { q, member: card.memberId ?? '' } });
  };

  return (
    <Screen>
      <ScreenHeader title={`${card.nickname} · Rules`} back />

      {/* AI rule composer — routes to Ask; changes come back as proposals */}
      <View style={styles.aiComposer}>
        <Ionicons name="sparkles-outline" size={16} color={colors.mint} />
        <TextInput
          value={aiText}
          onChangeText={setAiText}
          placeholder="Describe a change… e.g. “add ₹1,000 until Sunday”"
          placeholderTextColor={colors.textTertiary}
          style={styles.aiInput}
          onSubmitEditing={askAI}
          returnKeyType="send"
          accessibilityLabel="Describe a rule change for the assistant"
        />
        {aiText.trim() ? (
          <Pressable onPress={askAI} hitSlop={8} accessibilityRole="button" accessibilityLabel="Send">
            <Ionicons name="arrow-up-circle" size={24} color={colors.mint} />
          </Pressable>
        ) : null}
      </View>

      {/* Spending limits */}
      <View style={{ gap: space.m }}>
        <SectionHeader title="Spending limits" />
        <Panel style={{ gap: 0, padding: 0 }}>
          <Pressable
            onPress={() => openEditor('limit')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.ruleRow, pressed && { backgroundColor: colors.surface2 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="body">Monthly limit</AppText>
              <AppText variant="secondary" tone={colors.textTertiary}>
                {card.monthlyCap !== undefined ? `${formatMoney(card.monthlyCap)} per month` : 'No limit set'}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            onPress={() => openEditor('threshold')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.ruleRow, pressed && { backgroundColor: colors.surface2 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="body">Approval threshold</AppText>
              <AppText variant="secondary" tone={colors.textTertiary}>
                {card.approvalAbove !== undefined
                  ? `Ask me before purchases over ${formatMoney(card.approvalAbove)}`
                  : 'No approval required'}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </Panel>
      </View>

      {/* Temporary override */}
      {member?.tempAllowance ? (
        <View style={{ gap: space.m }}>
          <SectionHeader title="Temporary" />
          <RuleChip
            state="temporary"
            label={`+${formatMoney(member.tempAllowance.amount)} until ${member.tempAllowance.expiresAtLabel} · ends automatically`}
          />
        </View>
      ) : null}

      {/* Categories */}
      {member && member.categories.length > 0 ? (
        <View style={{ gap: space.m }}>
          <SectionHeader title="Categories" />
          <Panel style={{ gap: 0, padding: 0 }}>
            {member.categories.map((c, i) => (
              <View key={c.key}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.ruleRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="body">{c.label}</AppText>
                    <AppText variant="secondary" tone={colors.textTertiary}>
                      {c.enabled ? `Up to ${formatMoney(c.cap)} per month` : 'Off — purchases decline'}
                    </AppText>
                  </View>
                  <Switch
                    value={c.enabled}
                    onValueChange={() => {
                      dispatch({ type: 'toggle_category', memberId: member.id, categoryKey: c.key });
                      toast(`${c.label} turned ${c.enabled ? 'off' : 'on'} for ${member.name}.`);
                    }}
                    trackColor={{ false: colors.surface3, true: colors.mintDim }}
                    thumbColor={c.enabled ? colors.mint : colors.textTertiary}
                    accessibilityLabel={`${c.label} category, ${c.enabled ? 'on' : 'off'}`}
                  />
                </View>
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      {/* Channels */}
      <View style={{ gap: space.m }}>
        <SectionHeader title="Channels" />
        <Panel style={{ gap: 0, padding: 0 }}>
          {channelLabels.map(([key, label], i) => (
            <View key={key}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.ruleRow}>
                <AppText variant="body" style={{ flex: 1 }}>
                  {label}
                </AppText>
                <Switch
                  value={card.channels[key]}
                  onValueChange={() => {
                    dispatch({ type: 'toggle_channel', cardId: card.id, channel: key });
                    toast(`${label} turned ${card.channels[key] ? 'off' : 'on'}.`);
                  }}
                  trackColor={{ false: colors.surface3, true: colors.mintDim }}
                  thumbColor={card.channels[key] ? colors.mint : colors.textTertiary}
                  accessibilityLabel={`${label}, ${card.channels[key] ? 'on' : 'off'}`}
                />
              </View>
            </View>
          ))}
        </Panel>
      </View>

      {/* Limit / threshold editor → Proposed change → trusted confirm */}
      <ConfirmSheet
        visible={editing !== null && validAmount}
        title={editing === 'limit' ? 'Change monthly limit' : 'Change approval threshold'}
        subject={`${card.nickname}${member ? ` · ${member.name}` : ''}`}
        facts={[
          {
            label: 'Current',
            value:
              editing === 'limit'
                ? card.monthlyCap !== undefined
                  ? `${formatMoney(card.monthlyCap)} / month`
                  : 'No limit'
                : card.approvalAbove !== undefined
                  ? `Ask over ${formatMoney(card.approvalAbove)}`
                  : 'No approval required',
          },
          {
            label: 'New',
            value:
              editing === 'limit'
                ? `${formatMoney(parsedAmount)} / month`
                : `Ask over ${formatMoney(parsedAmount)}`,
            emphasis: true,
          },
          { label: 'Effective', value: 'Immediately' },
        ]}
        note="This is a permanent rule change."
        cta={
          editing === 'limit'
            ? `Set limit to ${formatMoney(parsedAmount)}`
            : `Ask me over ${formatMoney(parsedAmount)}`
        }
        onConfirm={() => {
          if (editing === 'limit' && member) {
            dispatch({ type: 'set_monthly_limit', memberId: member.id, amount: parsedAmount });
          } else if (editing === 'threshold') {
            dispatch({ type: 'set_approval_threshold', cardId: card.id, amount: parsedAmount });
          }
          toast('Rule updated.');
        }}
        onClose={() => setEditing(null)}
      />

      {/* Simple amount input row shown while an editor is open but the
          sheet needs a valid value */}
      {editing !== null && !validAmount ? (
        <Panel style={{ gap: space.m }}>
          <AppText variant="body">
            {editing === 'limit' ? 'New monthly limit' : 'New approval threshold'}
          </AppText>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            placeholder="Amount in ₹"
            placeholderTextColor={colors.textTertiary}
            style={styles.amountInput}
            autoFocus
            accessibilityLabel="Amount"
          />
          <AppText variant="caption" tone={colors.textTertiary}>
            Enter an amount to review the change.
          </AppText>
        </Panel>
      ) : null}
    </Screen>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
  aiComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.tile,
    paddingHorizontal: space.m,
    paddingVertical: 6,
  },
  aiInput: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: 14,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginLeft: space.l,
  },
  amountInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    color: colors.textPrimary,
    fontFamily: font.medium,
    fontSize: 18,
    paddingHorizontal: space.l,
    paddingVertical: 12,
  },
});
}

