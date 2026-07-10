import { SignedIn, SignedOut, SignIn } from "@clerk/nextjs";
import BackButton from "@/components/BackButton";

export const metadata = {
    title: "The Quality Market - Rider",
    description: "Rider delivery console",
};

export default function RiderRootLayout({ children }) {
    return (
        <>
            <SignedIn>
                <div className="px-4 pt-3">
                    <BackButton />
                </div>
                {children}
            </SignedIn>
            <SignedOut>
                <div className="min-h-screen flex items-center justify-center">
                    <SignIn fallbackRedirectUrl="/rider" routing="hash" />
                </div>
            </SignedOut>
        </>
    );
}
