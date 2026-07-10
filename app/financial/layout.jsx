import BackButton from "@/components/BackButton";

export const metadata = {
    title: "The Quality Market - Financial Operations",
    description: "Financial operations dashboard",
};

export default function FinancialRootLayout({ children }) {
    return (
        <>
            <div className="px-5 pt-4">
                <BackButton />
            </div>
            {children}
        </>
    );
}
