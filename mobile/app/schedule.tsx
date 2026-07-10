// Public rider departure schedule — mobile mirror of the web /delivery-schedule
// page. No account needed: shows when riders leave each hub along each corridor.
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDeliverySchedule, type ScheduleHub } from '@/api/schedule';
import { EmptyState, Loader } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function DeliveryScheduleScreen() {
  const [hubs, setHubs] = useState<ScheduleHub[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getDeliverySchedule();
      setHubs(res.hubs);
    } catch {
      setHubs((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (hubs === null) return <Loader />;

  const visibleHubs = hubs.filter((h) => h.corridorRoutes.some((c) => c.schedules.length > 0));

  if (visibleHubs.length === 0) {
    return (
      <EmptyState
        icon="calendar-outline"
        title="No published departures yet"
        subtitle="The rider departure schedule will appear here once routes are planned."
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Text style={styles.intro}>
        Drop your package at the hub before the departure time to make that run.
      </Text>
      {visibleHubs.map((hub) => (
        <View key={hub.id} style={styles.hubCard}>
          <View style={styles.hubHeader}>
            <Ionicons name="business" size={16} color="#4ade80" />
            <Text style={styles.hubName}>{hub.name}</Text>
          </View>
          {(hub.sector || hub.landmark) ? (
            <Text style={styles.hubSub}>
              {[hub.sector, hub.landmark].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {hub.corridorRoutes
            .filter((c) => c.schedules.length > 0)
            .map((corridor) => (
              <View key={corridor.id} style={styles.corridor}>
                <View style={styles.corridorRow}>
                  <Ionicons name="git-branch-outline" size={14} color={colors.primary} />
                  <Text style={styles.corridorName}>{corridor.name}</Text>
                </View>
                {corridor.areas.length > 0 ? (
                  <Text style={styles.areas}>Serves: {corridor.areas.join(', ')}</Text>
                ) : null}
                <View style={styles.chips}>
                  {corridor.schedules.map((s) => (
                    <View key={s.id} style={styles.chip}>
                      <Ionicons name="time-outline" size={12} color={colors.primaryDark} />
                      <Text style={styles.chipText}>
                        {DAYS[s.dayOfWeek]} {s.departTime}
                        {s.riderName ? ` · ${s.riderName}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  intro: { fontSize: 13, color: colors.muted, fontFamily: fonts.regular, lineHeight: 19 },
  hubCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  hubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  hubName: { color: '#fff', fontFamily: fonts.semibold, fontSize: 14.5 },
  hubSub: {
    fontSize: 12,
    color: colors.muted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    fontFamily: fonts.regular,
  },
  corridor: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  corridorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corridorName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text },
  areas: { fontSize: 12, color: colors.subtle, marginTop: 2, fontFamily: fonts.regular },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 11.5, color: colors.primaryDark, fontFamily: fonts.medium },
});
