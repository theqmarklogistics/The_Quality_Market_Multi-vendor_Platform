import ReportsView from "@/components/reports/ReportsView"

// Admin reporting hub. The AdminLayout already gates access to ADMIN; the
// reports API independently enforces scope, so admins see every report
// platform-wide.
export default function AdminReportsPage() {
    return <ReportsView />
}
