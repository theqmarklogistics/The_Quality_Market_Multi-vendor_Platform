import BackButton from "@/components/BackButton";

export const metadata = {
    title: "The Quality Market - Warehouse",
    description: "Warehouse keeper dashboard",
};

export default function WarehouseRootLayout({ children }) {
    return (
        <>
            <div className="px-5 pt-4">
                <BackButton />
            </div>
            {children}
        </>
    );
}
