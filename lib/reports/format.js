// Pure value formatters shared by every report renderer (dashboard UI, CSV and
// PDF) so a number is displayed identically wherever it appears. No server-only
// imports here — this module is safe to import in client components too.

export function formatValue(value, format, currency = 'RWF') {
    if (value === null || value === undefined || value === '') return '—';

    switch (format) {
        case 'currency':
            return `${currency} ${Number(value || 0).toLocaleString('en-RW')}`;
        case 'number':
            return Number(value || 0).toLocaleString('en-RW');
        case 'percent':
            return `${Number(value || 0)}%`;
        case 'date': {
            const d = new Date(value);
            return Number.isNaN(d.getTime())
                ? String(value)
                : d.toLocaleDateString('en-RW', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        case 'text':
        default:
            return String(value);
    }
}

// Plain (unsymbolised) value used for CSV cells and chart axes.
export function rawValue(value, format) {
    if (value === null || value === undefined) return '';
    if (format === 'date') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
    }
    return value;
}
