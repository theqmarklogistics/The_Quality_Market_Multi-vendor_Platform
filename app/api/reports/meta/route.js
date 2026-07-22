import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveReportScope } from "@/lib/reports/scope";
import { REPORTS } from "@/lib/reports/catalog";

// Returns the reporting catalogue available to the signed-in user: their scope
// label and the report definitions they're allowed to run. The UI uses this to
// build the report picker without knowing anything about roles itself.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const scope = await resolveReportScope(userId);
        if (!scope) {
            return NextResponse.json({ error: "You do not have access to reports." }, { status: 403 });
        }

        return NextResponse.json({
            role: scope.role,
            scopeLabel: scope.scopeLabel,
            reports: scope.allowed.map((type) => REPORTS[type]).filter(Boolean),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
