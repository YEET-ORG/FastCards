import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton, SecondaryButton, TextButton } from '@/components/fin/Buttons';
import { StatusBadge, type BadgeStatus } from '@/components/fin/primitives';
import { Panel, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, radius, screenPad, space, type ColorTokens } from '@/design/tokens';

// Admin console — the human bridge between the two pools. Shows the
// provider (KripiCard) USD float, the KYC queue, and the card-order
// queue; approving verifies payment + float server-side.

interface AdminOrder {
  id: string;
  user_name: string;
  nickname: string;
  card_type: string;
  status: string;
  price_usd: number;
  price_inr: number;
  expected_units: number;
  memo: string;
  review_note: string | null;
  created_at: string;
}

const orderBadge = (status: string): BadgeStatus =>
  status === 'paid' ? 'approval' : status === 'issued' ? 'active' : status === 'rejected' ? 'declined' : 'pending';

export default function AdminScreen() {
  const { headers, session } = useAuth();
  const toast = useToast();
  const colors = useColors();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [float, setFloat] = useState<number | null>(null);
  const [kycQueue, setKycQueue] = useState<{ id: string; name: string }[]>([]);
  const [floatInput, setFloatInput] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [ordersRes, kycRes] = await Promise.all([api.adminOrders(headers), api.adminKycQueue(headers)]);
      setOrders(ordersRes.orders as AdminOrder[]);
      setFloat(ordersRes.providerPool.balance_usd);
      setKycQueue(kycRes);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not load the admin queue.');
    } finally {
      setLoading(false);
    }
  }, [headers, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That did not go through.');
    }
    await load();
  };

  if (!session?.isAdmin) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.s, paddingHorizontal: screenPad }]}>
        <ScreenHeader title="Admin" back />
        <AppText variant="secondary">Platform admin access required.</AppText>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Admin console" back />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}>
        {/* Provider pool */}
        <Panel style={{ gap: space.m }}>
          <AppText variant="label">KripiCard float (pool 2)</AppText>
          <AppText variant="balance" tabular>
            {float === null ? '—' : `$${float.toLocaleString('en-US')}`}
          </AppText>
          <View style={styles.floatRow}>
            <TextInput
              value={floatInput}
              onChangeText={setFloatInput}
              keyboardType="decimal-pad"
              placeholder="New balance in $"
              placeholderTextColor={colors.textTertiary}
              style={styles.floatInput}
              accessibilityLabel="Provider pool balance"
            />
            <SecondaryButton
              label="Set"
              onPress={() => {
                const v = Number(floatInput);
                if (!Number.isFinite(v) || v < 0) return toast('Enter a valid dollar amount.');
                setFloatInput('');
                void act(() => api.request('/api/admin/provider-pool', headers, { body: { balanceUsd: v } }), `Float set to $${v}.`);
              }}
              style={{ minHeight: 44 }}
            />
          </View>
          <AppText variant="caption" tone={colors.textTertiary}>
            Mirror of the USD balance held at the card provider. Approvals are blocked when a card would exceed it.
          </AppText>
        </Panel>

        {/* KYC queue */}
        <View style={{ gap: space.m }}>
          <AppText variant="section">KYC queue</AppText>
          {kycQueue.length === 0 ? (
            <AppText variant="secondary" tone={colors.textTertiary}>
              No KYC submissions waiting.
            </AppText>
          ) : (
            kycQueue.map((u) => (
              <Panel key={u.id} style={styles.rowPanel}>
                <View style={{ flex: 1 }}>
                  <AppText variant="cardTitle">{u.name}</AppText>
                  <AppText variant="caption" tone={colors.textTertiary}>
                    {u.id}
                  </AppText>
                </View>
                <SecondaryButton
                  label="Reject"
                  onPress={() => void act(() => api.adminReviewKyc(headers, u.id, false), `${u.name}'s KYC rejected.`)}
                  style={styles.smallBtn}
                />
                <PrimaryButton
                  label="Approve"
                  onPress={() => void act(() => api.adminReviewKyc(headers, u.id, true), `${u.name}'s KYC approved.`)}
                  style={styles.smallBtn}
                />
              </Panel>
            ))
          )}
        </View>

        {/* Orders */}
        <View style={{ gap: space.m }}>
          <AppText variant="section">Card orders</AppText>
          {orders.length === 0 ? (
            <AppText variant="secondary" tone={colors.textTertiary}>
              No orders yet.
            </AppText>
          ) : (
            orders.map((o) => (
              <Panel key={o.id} style={{ gap: space.m }}>
                <View style={styles.orderTop}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="cardTitle">
                      {o.nickname} · {o.user_name}
                    </AppText>
                    <AppText variant="caption" tone={colors.textTertiary}>
                      ${o.price_usd} · {o.expected_units} units · memo {o.memo}
                    </AppText>
                    {o.review_note ? (
                      <AppText variant="caption" tone={colors.warning}>
                        {o.review_note}
                      </AppText>
                    ) : null}
                  </View>
                  <StatusBadge status={orderBadge(o.status)} label={o.status.replaceAll('_', ' ')} />
                </View>
                {o.status === 'paid' || o.status === 'awaiting_payment' ? (
                  <View style={styles.orderActions}>
                    <PrimaryButton
                      label="Approve & issue"
                      onPress={() =>
                        Alert.alert(
                          'Approve order',
                          `Issue "${o.nickname}" for ${o.user_name}? Verifies payment and debits $${o.price_usd} from the float.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Approve',
                              onPress: () =>
                                void act(() => api.adminApproveOrder(headers, o.id), `Issued ${o.nickname}.`),
                            },
                          ],
                        )
                      }
                      style={{ flex: 1, minHeight: 44 }}
                    />
                    <TextButton
                      label="Reject"
                      destructive
                      onPress={() =>
                        void act(
                          () => api.adminRejectOrder(headers, o.id, 'Rejected from admin console'),
                          'Order rejected.',
                        )
                      }
                    />
                  </View>
                ) : null}
              </Panel>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingHorizontal: screenPad,
    paddingBottom: 60,
    gap: space.xl,
  },
  floatRow: {
    flexDirection: 'row',
    gap: space.s,
  },
  floatInput: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    color: colors.textPrimary,
    fontFamily: font.medium,
    fontSize: 15,
    paddingHorizontal: space.l,
  },
  rowPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  smallBtn: {
    minHeight: 40,
    paddingHorizontal: 12,
  },
  orderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.m,
  },
  orderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
  },
});
}

