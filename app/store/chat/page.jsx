import ConversationList from "@/components/chat/ConversationList";

export default function StoreChatsPage() {
    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl">Store <span className="text-slate-800 font-medium">Chats</span></h1>
            <p className="mb-5">Conversations with buyers.</p>
            <ConversationList basePath="/store/chat" />
        </div>
    );
}
