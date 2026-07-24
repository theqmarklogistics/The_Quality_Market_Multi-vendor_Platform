// Central catalog of every report the platform can produce, plus the
// role → allowed-reports mapping. This is the single source of truth for:
//   - what reports exist (the `REPORTS` map)
//   - which business area each belongs to (`area`)
//   - who is allowed to run which report (`ROLE_REPORTS`)
//
// The API (app/api/reports) and the UI (components/reports/ReportsView) both
// read from here so the catalog stays consistent everywhere. Icons are stored
// as lucide-react component *names* (strings) and resolved on the client.

export const REPORT_AREAS = {
    SALES: 'Sales & Revenue',
    PAYMENTS: 'Payments & Payouts',
    DELIVERIES: 'Deliveries & Logistics',
    CATALOG: 'Products, Stores & Returns',
};

// Every report definition. `type` is the stable key used in the API query
// string and must match the switch in lib/reports/compute.js.
export const REPORTS = {
    sales: {
        type: 'sales',
        title: 'Sales & Revenue',
        area: REPORT_AREAS.SALES,
        icon: 'CircleDollarSign',
        description: 'Revenue, orders, average order value, top products and categories over time.',
    },
    payments: {
        type: 'payments',
        title: 'Payments',
        area: REPORT_AREAS.PAYMENTS,
        icon: 'CreditCard',
        description: 'Collections by method, payment status, proofs awaiting review and escrow held.',
    },
    payouts: {
        type: 'payouts',
        title: 'Payouts & Commissions',
        area: REPORT_AREAS.PAYMENTS,
        icon: 'Banknote',
        description: 'Platform commission earned, seller net earnings, settlements and outstanding balances.',
    },
    deliveries: {
        type: 'deliveries',
        title: 'Deliveries & Logistics',
        area: REPORT_AREAS.DELIVERIES,
        icon: 'Truck',
        description: 'Shipments by type and status, corridors, rider activity and delivery fees collected.',
    },
    riders: {
        type: 'riders',
        title: 'Rider Performance',
        area: REPORT_AREAS.DELIVERIES,
        icon: 'Bike',
        description: 'Per-rider corridor runs, stops served, delivery success, distance covered, contact roster and schedule coverage.',
    },
    catalog: {
        type: 'catalog',
        title: 'Products & Inventory',
        area: REPORT_AREAS.CATALOG,
        icon: 'Package',
        description: 'Stock levels, low-stock alerts, approval pipeline and best-selling products.',
    },
    returns: {
        type: 'returns',
        title: 'Returns & Refunds',
        area: REPORT_AREAS.CATALOG,
        icon: 'RotateCcw',
        description: 'Return requests by status and reason across the selected period.',
    },
    stores: {
        type: 'stores',
        title: 'Store Performance',
        area: REPORT_AREAS.CATALOG,
        icon: 'Store',
        description: 'Revenue, orders and catalogue size per store.',
    },
};

// Role → the report types that role is allowed to run. The API enforces this;
// a report requested outside a user's allow-list is rejected with 403.
//   - ADMIN                 → everything, platform-wide
//   - FINANCIAL_OPERATIONAL → the money-facing reports, platform-wide
//   - LOGISTICS_MANAGER     → the delivery-network report, platform-wide
//   - SELLER                → their OWN store's sales, earnings, catalogue, returns
export const ROLE_REPORTS = {
    ADMIN: ['sales', 'payments', 'payouts', 'deliveries', 'riders', 'catalog', 'returns', 'stores'],
    FINANCIAL_OPERATIONAL: ['sales', 'payments', 'payouts'],
    LOGISTICS_MANAGER: ['deliveries', 'riders'],
    SELLER: ['sales', 'payouts', 'catalog', 'returns'],
};

// Returns the ordered list of report definitions a role may access.
export function reportsForRole(role) {
    const allowed = ROLE_REPORTS[role] || [];
    return allowed.map((type) => REPORTS[type]).filter(Boolean);
}
