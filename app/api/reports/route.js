import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveReportScope } from "@/lib/reports/scope";
import { computeReport } from "@/lib/reports/compute";
import { reportToCsv, reportFilename } from "@/lib/reports/csv";
import { generateReportPdf } from "@/lib/generateReportPdf";

// Report data + export endpoint.
//   GET /api/reports?type=<type>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>&format=json|csv|pdf
//
// Security: the role, store filter and allowed report types come ONLY from
// resolveReportScope — a client can never widen its own access by changing the
// query string. A type outside the user's allow-list returns 403.

const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000; // one year cap on a single report
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Per-report focus filters. Only these keys are forwarded — anything else in the
// query string is discarded. They can only ever NARROW a report within the scope
// resolveReportScope already granted, never widen it: each report validates the
// value against the entities its own (scoped) data contains.
const FILTER_KEYS = ['storeId', 'productId', 'packageId', 'riderId', 'corridorId', 'hubId'];

function parseFilters(searchParams) {
    const filters = {};
    for (const key of FILTER_KEYS) {
        const value = (searchParams.get(key) || '').trim();
        if (value) filters[key] = value.slice(0, 100);
    }
    return filters;
}

// Parse from/to into a [from, to] window with sane defaults and clamping.
function parseRange(searchParams) {
    const now = new Date();

    let to = searchParams.get('to') ? new Date(searchParams.get('to')) : now;
    if (Number.isNaN(to.getTime())) to = now;
    // Include the whole "to" day.
    to.setHours(23, 59, 59, 999);

    let from = searchParams.get('from') ? new Date(searchParams.get('from')) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
    if (Number.isNaN(from.getTime())) from = new Date(to.getTime() - DEFAULT_WINDOW_MS);
    from.setHours(0, 0, 0, 0);

    if (from > to) from = new Date(to.getTime() - DEFAULT_WINDOW_MS);
    if (to.getTime() - from.getTime() > MAX_WINDOW_MS) from = new Date(to.getTime() - MAX_WINDOW_MS);

    return { from, to };
}

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const scope = await resolveReportScope(userId);
        if (!scope) {
            return NextResponse.json({ error: "You do not have access to reports." }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const format = (searchParams.get('format') || 'json').toLowerCase();

        if (!type || !scope.allowed.includes(type)) {
            return NextResponse.json({ error: "This report is not available for your account." }, { status: 403 });
        }

        const { from, to } = parseRange(searchParams);
        // Optional per-report filters (ignored by reports that don't use them).
        const report = await computeReport({ type, scope, from, to, ...parseFilters(searchParams) });

        if (format === 'csv') {
            const csv = reportToCsv(report);
            return new Response(csv, {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${reportFilename(report, 'csv')}"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        if (format === 'pdf') {
            const buffer = await generateReportPdf(report);
            return new Response(buffer, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${reportFilename(report, 'pdf')}"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        return NextResponse.json(report);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || 'Failed to generate report' }, { status: 500 });
    }
}
