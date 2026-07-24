import { rawValue } from "./format";

// Serialise a standard report object into a single CSV document. The header
// block carries the report meta, followed by a KPI block and one block per
// section (tables and time-series alike render as rows). Excel/Sheets read the
// blank-line-separated blocks fine.

function esc(v) {
    const s = v === null || v === undefined ? '' : String(v);
    // Quote when the cell contains a comma, quote or newline; double inner quotes.
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function line(cells) {
    return cells.map(esc).join(',');
}

export function reportToCsv(report) {
    const out = [];

    out.push(line(['Report', report.title]));
    if (report.subtitle) out.push(line(['Focus', report.subtitle]));
    out.push(line(['Scope', report.scopeLabel]));
    out.push(line(['Period', report.range?.label || '']));
    out.push(line(['Generated', new Date(report.generatedAt).toLocaleString('en-RW')]));
    out.push('');

    // KPIs
    out.push(line(['Key metrics']));
    out.push(line(['Metric', 'Value']));
    for (const k of report.kpis || []) {
        out.push(line([k.label, rawValue(k.value, k.format)]));
    }
    out.push('');

    // Sections
    for (const section of report.sections || []) {
        out.push(line([section.title]));
        if (section.kind === 'timeseries') {
            out.push(line(['Date', 'Value']));
            for (const point of section.data || []) {
                out.push(line([point.x, point.y]));
            }
        } else if (section.kind === 'table') {
            const cols = section.columns || [];
            out.push(line(cols.map((c) => c.label)));
            for (const row of section.rows || []) {
                out.push(line(cols.map((c) => rawValue(row[c.key], c.format))));
            }
            if ((section.rows || []).length === 0 && section.note) {
                out.push(line([section.note]));
            }
        }
        out.push('');
    }

    return out.join('\r\n');
}

// A filesystem-safe filename stem, e.g. "sales-report_2026-07-22".
export function reportFilename(report, ext) {
    const slug = String(report.type || 'report').replace(/[^a-z0-9]+/gi, '-');
    const date = new Date(report.generatedAt).toISOString().slice(0, 10);
    return `${slug}-report_${date}.${ext}`;
}
