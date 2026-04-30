import ConversationList from "@/components/chat/ConversationList";

export default function BuyerChatsPage() {
    return (
        <div className="mx-6 my-16 min-h-[60vh]">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl text-slate-700">My Chats</h1>
                <p className="text-slate-500 mb-6">Your conversations with admin and store owners appear here.</p>
                <ConversationList basePath="/chat" />
            </div>
        </div>
    );
}
