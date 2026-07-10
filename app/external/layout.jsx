import { SignedIn, SignedOut, SignIn } from "@clerk/nextjs";
import DeliverySchedule from "@/components/external/DeliverySchedule";
import BackButton from "@/components/BackButton";

export const metadata = {
    title: "The Quality Market - Delivery Partner",
    description: "Book and track deliveries with The Quality Market",
};

export default function ExternalRootLayout({ children }) {
    return (
        <>
            <SignedIn>
                <div className="px-4 pt-3 max-w-5xl mx-auto">
                    <BackButton />
                </div>
                {children}
            </SignedIn>
            <SignedOut>
                <div className="min-h-screen px-6 py-10">
                    <div className="flex items-center justify-center mb-12">
                        <SignIn fallbackRedirectUrl="/external" routing="hash" />
                    </div>
                    {/* The rider departure schedule is public — visible without an account. */}
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-xl text-slate-500 mb-1">Rider <span className="text-slate-800 font-medium">Departure Schedule</span></h2>
                        <p className="text-sm text-slate-400 mb-5">When riders leave each hub along each corridor — open to the public.</p>
                        <DeliverySchedule />
                    </div>
                </div>
            </SignedOut>
        </>
    );
}
