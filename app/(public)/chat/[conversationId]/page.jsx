import ChatRoom from "@/components/chat/ChatRoom";

export default async function BuyerChatRoomPage({ params }) {
    const { conversationId } = await params;

    return (
        <div className="mx-6 my-10 min-h-[70vh]">
            <ChatRoom conversationId={conversationId} />
        </div>
    );
}
