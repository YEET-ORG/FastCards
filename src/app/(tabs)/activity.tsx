import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { HeaderIconButton, Screen, ScreenHeader } from '@/components/fin/Screen';
import { Segments } from '@/components/fin/Segments';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { color, font, space } from '@/design/tokens';
import { dayLabel, formatMoney, relativeTime } from '@/domain/money';
import { useDomain } from '@/domain/store';
import type { AuditEvent, Transaction } from '@/domain/types';

// Activity (spec §30, UI §23): the universal event ledger. Card
// transactions and audit events (AI actions, rule changes, freezes,
// approvals, security) share one chronological feed.

type Filter = 'all' | 'mine' | 'family' | 'ai';
const FILTERS: Filter[] = ['all', 'mine', 'family', 'ai'];

type FeedItem =
  | { type: 'txn'; at: string; txn: Transaction }
  | { type: 'event'; at: string; event: AuditEvent };

const eventIcons: Record<AuditEvent['kind'], keyof typeof Ionicons.glyphMap> = {
  ai_action: 'sparkles-outline',
  card_event: 'card-outline',
  rule_event: 'options-outline',
  approval_event: 'hand-left-outline',
  security_event: 'shield-outline',
  transfer: 'swap-horizontal-outline',
};

export default function ActivityFeed() {
  const { state } = useDomain();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');

  const feed = useMemo(() => {
    const items: FeedItem[] = [
      ...state.transactions.map<FeedItem>((t) => ({ type: 'txn', at: t.at, txn: t })),
      ...state.events.map<FeedItem>((e) => ({ type: 'event', at: e.at, event: e })),
    ];

    const filtered = items.filter((item) => {
      if (filter === 'all') return true;
      if (filter === 'ai') return item.type === 'event' && item.event.kind === 'ai_action';
      const memberId = item.type === 'txn' ? item.txn.memberId : item.event.memberId;
      if (filter === 'mine') return memberId === 'm-rohan';
      return memberId !== undefined && memberId !== 'm-rohan';
    });

    filtered.sort((a, b) => b.at.localeCompare(a.at));

    // Group into day buckets
    const groups: { label: string; items: FeedItem[] }[] = [];
    for (const item of filtered) {
      const label = dayLabel(item.at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [state.transactions, state.events, filter]);

  return (
    <Screen>
      <ScreenHeader
        title="Activity"
        right={
          <HeaderIconButton
            icon="search-outline"
            label="Search activity"
            onPress={() => Alert.alert('Search', 'Global search lands in an upcoming milestone.')}
          />
        }
      />

      <Segments
        labels={['All', 'Mine', 'Family', 'AI']}
        index={FILTERS.indexOf(filter)}
        onChange={(i) => setFilter(FILTERS[i])}
      />

      {feed.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="body" tone={color.textSecondary}>
            Your activity will appear here.
          </AppText>
        </View>
      ) : (
        feed.map((group) => (
          <View key={group.label} style={{ gap: 2 }}>
            <AppText variant="label" style={{ marginBottom: space.s }}>
              {group.label}
            </AppText>
            {group.items.map((item) =>
              item.type === 'txn' ? (
                <TransactionRow
                  key={item.txn.id}
                  txn={item.txn}
                  member={state.members.find((m) => m.id === item.txn.memberId)}
                  onPress={() =>
                    router.push({ pathname: '/transaction/[id]', params: { id: item.txn.id } })
                  }
                />
              ) : (
                <View key={item.event.id} style={styles.eventRow}>
                  <View style={styles.eventIcon}>
                    <Ionicons
                      name={eventIcons[item.event.kind]}
                      size={16}
                      color={item.event.kind === 'ai_action' ? color.mint : color.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <AppText variant="body" numberOfLines={1}>
                      {item.event.title}
                    </AppText>
                    {item.event.subtitle ? (
                      <AppText variant="secondary" tone={color.textTertiary} numberOfLines={1}>
                        {item.event.subtitle}
                      </AppText>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    {item.event.amount !== undefined ? (
                      <AppText variant="body" tabular style={{ fontFamily: font.medium }}>
                        {formatMoney(item.event.amount)}
                      </AppText>
                    ) : null}
                    <AppText variant="caption">{relativeTime(item.event.at)}</AppText>
                  </View>
                </View>
              ),
            )}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: space.x40,
    alignItems: 'center',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingVertical: 10,
  },
  eventIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
