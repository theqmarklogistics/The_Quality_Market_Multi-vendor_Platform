import { SignedIn, SignedOut, SignIn } from "@clerk/nextjs";

export const metadata = {
    title: "The Quality Market - Delivery Partner",
    description: "Book and track deliveries with The Quality Market",
};

export default function ExternalRootLayout({ children }) {
    return (
        <>
            <SignedIn>{children}</SignedIn>
            <SignedOut>
                <div className="min-h-screen flex items-center justify-center">
                    <SignIn fallbackRedirectUrl="/external" routing="hash" />
                </div>
            </SignedOut>
        </>
    );
}
