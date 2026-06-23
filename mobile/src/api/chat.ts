// Buyer ↔ seller/admin chat. Realtime over Socket.IO (join-conversation room;
// events new-message / messages-read). GET messages also marks them read server-side.
import { apiGet, apiPost } from './client';

export interface ChatUser {
  id: string;
  name: string | null;
  image: string | null;
  email?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  sender: ChatUser | null;
}

export interface ConversationParticipant {
  userId: string;
  conversationId: string;
  user: ChatUser | null;
}

export interface Conversation {
  id: string;
  targetType: 'ADMIN' | 'STORE';
  orderId: string | null;
  storeId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  participants: ConversationParticipant[];
  // Last message only (for the list preview).
  messages: Message[];
  // Unread count for the current user.
  _count: { messages: number };
  store?: { id: string; name: string } | null;
}

export function getConversations(): Promise<{ conversations: Conversation[] }> {
  return apiGet('/api/chat/conversations');
}

// Start (or fetch existing) a conversation with admin/support or a store.
export function createConversation(input: {
  targetType: 'ADMIN' | 'STORE';
  orderId?: string;
  storeId?: string;
}): Promise<{ conversation: Conversation }> {
  return apiPost('/api/chat/conversations', input);
}

export function getMessages(conversationId: string): Promise<{ messages: Message[] }> {
  return apiGet(`/api/chat/conversations/${conversationId}/messages`);
}

export function sendMessage(
  conversationId: string,
  content: string,
): Promise<{ message: Message }> {
  return apiPost(`/api/chat/conversations/${conversationId}/messages`, { content });
}
