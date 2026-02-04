import StoreLayout from "@/components/store/StoreLayout";

export const metadata = {
    title: "The Quality Market - Store Dashboard",
    description: "The Quality Market - Store Dashboard",
};

export default function RootAdminLayout({ children }) {

    return (
        <>
            <StoreLayout>
                {children}
            </StoreLayout>
        </>
    );
}
