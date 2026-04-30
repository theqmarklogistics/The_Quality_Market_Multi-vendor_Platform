import ChatRoom from "@/components/chat/ChatRoom";

export default async function StoreChatRoomPage({ params }) {
    const { conversationId } = await params;

    return <ChatRoom conversationId={conversationId} />;
}
