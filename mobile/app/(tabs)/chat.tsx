// Conversations list. Tap to open a chat; "Message support" starts/opens an ADMIN
// conversation. Unread counts come from the conversations API (_count.messages).
import { useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';
import { getConversations, createConversation, type Conversation } from '@/api/chat';
import { Button, EmptyState, Loader } from '@/components/ui';
import { SignedOutGate } from '@/components/SignedOutGate';
import { colors, fonts, radius, spacing } from '@/theme';

export default function ChatListScreen() {
  return (
    <SignedOutGate
      title="Sign in to message us"
      subtitle="Chat with support and sellers about your orders once you're signed in."
    >
      <ChatListScreenInner />
    </SignedOutGate>
  );
}

function ChatListScreenInner() {
  const router = useRouter();
  const { user } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingSupport, setStartingSupport] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getConversations();
      setConversations(res.conversations);
    } catch {
      // surfaced via empty state if nothing loads
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const messageSupport = async () => {
    setStartingSupport(true);
    try {
      const { conversation } = await createConversation({ targetType: 'ADMIN' });
      router.push({ pathname: '/conversation/[id]', params: { id: conversation.id } });
    } finally {
      setStartingSupport(false);
    }
  };

  const titleFor = (c: Conversation): string => {
    if (c.targetType === 'ADMIN') return 'Support';
    // For a STORE chat, show the other participant (the store owner) or store name.
    if (c.store?.name) return c.store.name;
    const other = c.participants.find((p) => p.userId !== user?.id);
    return other?.user?.name ?? 'Store';
  };

  if (loading) return <Loader />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Messages</Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Button
              label="Message support"
              variant="outline"
              size="md"
              icon="headset-outline"
              onPress={messageSupport}
              loading={startingSupport}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="No conversations yet"
            subtitle="Message support or a seller to start chatting."
          />
        }
        renderItem={({ item }) => {
          const last = item.messages?.[0];
          const unread = item._count?.messages ?? 0;
          const isSupport = item.targetType === 'ADMIN';
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Conversation with ${titleFor(item)}`}
              onPress={() =>
                router.push({ pathname: '/conversation/[id]', params: { id: item.id } })
              }
            >
              <View style={[styles.avatar, isSupport && styles.avatarSupport]}>
                <Ionicons
                  name={isSupport ? 'headset' : 'storefront'}
                  size={20}
                  color={isSupport ? colors.primaryDark : colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={[styles.rowTitle, unread > 0 && styles.rowTitleUnread]}>
                    {titleFor(item)}
                  </Text>
                  {last ? (
                    <Text style={styles.time}>
                      {formatDistanceToNowStrict(new Date(last.createdAt), { addSuffix: false })}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[styles.preview, unread > 0 && styles.previewUnread]}
                  numberOfLines={1}
                >
                  {last?.content ?? 'No messages yet'}
                </Text>
              </View>
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  list: { padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    minHeight: 68,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSupport: { backgroundColor: colors.primaryTint },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text },
  rowTitleUnread: { fontFamily: fonts.bold },
  time: { fontSize: 11.5, color: colors.subtle, fontFamily: fonts.regular },
  preview: { fontSize: 13, color: colors.muted, marginTop: 2, fontFamily: fonts.regular },
  previewUnread: { color: colors.body, fontFamily: fonts.medium },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.primaryText, fontSize: 12, fontFamily: fonts.bold },
});
