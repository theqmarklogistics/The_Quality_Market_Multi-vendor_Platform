import ReportsView from "@/components/reports/ReportsView"

// Seller reporting hub. StoreLayout gates access to approved sellers; the
// reports API scopes every query to this seller's own store.
export default function StoreReportsPage() {
    return <ReportsView />
}
