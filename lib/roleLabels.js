// Human-friendly labels for UserRole enum values shown in staff pickers.
const ROLE_LABELS = {
    ADMIN: "Admin",
    LOGISTICS_MANAGER: "Logistics manager",
    WAREHOUSE_KEEPER: "Warehouse keeper",
    FINANCIAL_OPERATIONAL: "Finance / ops",
    RIDER: "Rider",
    AGENT: "Agent",
    SELLER: "Seller",
    EXTERNAL_SELLER: "External seller",
    CUSTOMER: "Customer",
};

export function humanizeRole(role) {
    return ROLE_LABELS[role] || String(role || "").replace(/_/g, " ").toLowerCase();
}
