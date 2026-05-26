import { Outfit } from "next/font/google";
import { Toaster } from "react-hot-toast";
import StoreProvider from "@/app/StoreProvider";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next"

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata = {
    title: "The Quality Market — Rwanda's Online Marketplace",
    description: "Shop from verified sellers across Rwanda. Electronics, fashion, groceries, home goods and more — delivered to your door.",
    keywords: ["Rwanda", "online shopping", "marketplace", "Kigali", "e-commerce"],
    openGraph: {
        title: "The Quality Market — Rwanda's Online Marketplace",
        description: "Shop from verified sellers across Rwanda. Electronics, fashion, groceries, home goods and more.",
        siteName: "The Quality Market",
        locale: "en_RW",
        type: "website",
    },
    icons: {
        icon: "/the-quality-market-logo.png",
        shortcut: "/the-quality-market-logo.png",
        apple: "/the-quality-market-logo.png",
    },
};

export default function RootLayout({ children }) {
    return (
        <ClerkProvider>
            <html lang="en">
                <body className={`${outfit.className} antialiased bg-slate-50 text-slate-900 scroll-smooth`}>
                    <StoreProvider>
                        <Toaster />
                        {children}
                    </StoreProvider>
                    <Analytics />
                </body>
            </html>
        </ClerkProvider>
    );
}
