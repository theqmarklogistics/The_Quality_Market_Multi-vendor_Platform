import ChatRoom from "@/components/chat/ChatRoom";

export default async function AdminChatRoomPage({ params }) {
    const { conversationId } = await params;

    return <ChatRoom conversationId={conversationId} />;
}
