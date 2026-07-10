import BackButton from "@/components/BackButton";

export const metadata = {
    title: "The Quality Market - Logistics",
    description: "Kigali Pooled Delivery dispatch board",
};

export default function LogisticsRootLayout({ children }) {
    return (
        <>
            <div className="px-5 pt-4">
                <BackButton />
            </div>
            {children}
        </>
    );
}
