// Chat room: message thread + composer. Realtime via Socket.IO (join-conversation;
// new-message appends, deduped by id). Opening the screen marks messages read.
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getMessages, sendMessage, type Message } from '@/api/chat';
import { useRealtimeRoom } from '@/realtime/useRealtimeRoom';
import { Loader } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme';

export default function ChatRoomScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user } = useUser();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Append a message, ignoring duplicates (socket echo of our own send).
  const appendMessage = useCallback((m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    getMessages(conversationId)
      .then((res) => setMessages(res.messages))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conversationId]);

  useRealtimeRoom({
    join: { event: 'join-conversation', arg: conversationId },
    leave: { event: 'leave-conversation', arg: conversationId },
    handlers: {
      'new-message': (p: { message: Message }) => {
        if (p?.message) appendMessage(p.message);
      },
    },
  });

  const onSend = async () => {
    const content = input.trim();
    if (!content || !conversationId || sending) return;
    setSending(true);
    setInput('');
    try {
      const { message } = await sendMessage(conversationId, content);
      appendMessage(message);
    } catch {
      setInput(content); // restore on failure
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Loader />;

  // Inverted list renders newest at the bottom and keeps the latest in view.
  const reversed = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        data={reversed}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.content}</Text>
                <Text style={[styles.msgTime, mine && styles.msgTimeMine]}>
                  {format(new Date(item.createdAt), 'HH:mm')}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message"
          placeholderTextColor={colors.subtle}
          value={input}
          onChangeText={setInput}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendDisabled]}
          onPress={onSend}
          disabled={!input.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Ionicons name="send" size={18} color={colors.primaryText} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    paddingHorizontal: 13,
    paddingVertical: 9,
  } as any,
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.borderLight, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15, color: colors.text, lineHeight: 21, fontFamily: fonts.regular },
  msgTextMine: { color: colors.primaryText },
  msgTime: {
    fontSize: 10.5,
    color: colors.subtle,
    alignSelf: 'flex-end',
    marginTop: 3,
    fontFamily: fonts.regular,
  },
  msgTimeMine: { color: 'rgba(255,255,255,0.75)' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 11,
    maxHeight: 120,
    minHeight: 46,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
    backgroundColor: colors.surface,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
