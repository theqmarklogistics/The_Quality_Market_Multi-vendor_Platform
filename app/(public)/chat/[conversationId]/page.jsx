import ChatRoom from "@/components/chat/ChatRoom";
import { SignedIn, SignedOut, SignIn } from "@clerk/nextjs";

export default async function BuyerChatRoomPage({ params }) {
    const { conversationId } = await params;

    return (
        <>
            <SignedIn>
                <div className="mx-6 my-10 min-h-[70vh]">
                    <ChatRoom conversationId={conversationId} />
                </div>
            </SignedIn>
            <SignedOut>
                <div className="min-h-[70vh] flex items-center justify-center">
                    <SignIn fallbackRedirectUrl={`/chat/${conversationId}`} routing="hash" />
                </div>
            </SignedOut>
        </>
    );
}
