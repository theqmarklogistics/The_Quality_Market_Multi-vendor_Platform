import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image as PDFImage } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';
import { formatValue } from './reports/format';

// Branded, multi-section report PDF. Renders any standard report object
// (see lib/reports/compute.js) — header + logo, KPI grid, then one table per
// section (time-series render as a Date/Value table). Styling mirrors the
// invoice document so every generated document shares one look.

const BRAND_BLUE = '#4f6bcb';
const BRAND_GREEN = '#79cc4f';

const styles = StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 9, color: '#334155', padding: 36, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: BRAND_BLUE },
    brand: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: BRAND_BLUE },
    brandTagline: { fontSize: 8, color: BRAND_GREEN, marginTop: 2, fontFamily: 'Helvetica-Oblique' },
    brandSub: { fontSize: 7.5, color: '#64748b', marginTop: 3 },
    reportLabel: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: BRAND_BLUE, textAlign: 'right' },
    metaLine: { fontSize: 8, color: '#64748b', textAlign: 'right', marginTop: 2 },
    kpiWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    kpiCard: { width: '25%', padding: 4 },
    kpiCardInner: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 5, padding: 8, backgroundColor: '#f8fafc' },
    kpiLabel: { fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
    kpiValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginTop: 3 },
    section: { marginTop: 12 },
    sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_BLUE, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6 },
    tableHeader: { flexDirection: 'row', backgroundColor: '#eef1fb', padding: '4 6', borderRadius: 3, marginBottom: 2 },
    tableHeaderText: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: BRAND_BLUE },
    tableRow: { flexDirection: 'row', padding: '3 6', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    cell: { fontSize: 8 },
    note: { fontSize: 8, color: '#94a3b8', fontFamily: 'Helvetica-Oblique', paddingVertical: 4 },
    footer: { position: 'absolute', bottom: 20, left: 36, right: 36, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', fontSize: 7.5, color: '#94a3b8', textAlign: 'center' },
});

function colStyle(col) {
    // First column is the wide label column; numeric/right-aligned columns are
    // narrower. Everything is flex so it scales to the number of columns.
    const flex = col.align === 'right' ? 1 : 1.6;
    return { flex, textAlign: col.align === 'right' ? 'right' : 'left' };
}

function TableSection({ section, currency }) {
    const isTime = section.kind === 'timeseries';
    const columns = isTime
        ? [{ key: 'x', label: 'Date', format: 'text' }, { key: 'y', label: 'Value', format: section.valueFormat || 'number', align: 'right' }]
        : (section.columns || []);
    const rows = isTime ? (section.data || []) : (section.rows || []);

    return (
        <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {rows.length === 0 ? (
                <Text style={styles.note}>{section.note || 'No data for this period.'}</Text>
            ) : (
                <>
                    <View style={styles.tableHeader}>
                        {columns.map((c, i) => (
                            <Text key={i} style={[styles.tableHeaderText, colStyle(c)]}>{c.label}</Text>
                        ))}
                    </View>
                    {rows.slice(0, 60).map((row, ri) => (
                        <View key={ri} style={styles.tableRow}>
                            {columns.map((c, ci) => (
                                <Text key={ci} style={[styles.cell, colStyle(c)]}>
                                    {formatValue(row[c.key], c.format, currency)}
                                </Text>
                            ))}
                        </View>
                    ))}
                    {rows.length > 60 && (
                        <Text style={styles.note}>Showing first 60 of {rows.length} rows — download the CSV for the full list.</Text>
                    )}
                </>
            )}
        </View>
    );
}

function ReportDocument({ report, logoSrc }) {
    const currency = report.currency || 'RWF';
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header} fixed>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {logoSrc && (
                            <PDFImage src={logoSrc} style={{ width: 78, height: 44, marginRight: 10, objectFit: 'contain' }} />
                        )}
                        <View>
                            <Text style={styles.brand}>The Quality Market</Text>
                            <Text style={styles.brandTagline}>Quality is our Culture</Text>
                            <Text style={styles.brandSub}>Kigali, KN 82 St, Tropical plaza, C26</Text>
                        </View>
                    </View>
                    <View>
                        <Text style={styles.reportLabel}>{report.title}</Text>
                        {report.subtitle ? <Text style={styles.metaLine}>{report.subtitle}</Text> : null}
                        <Text style={styles.metaLine}>{report.scopeLabel}</Text>
                        <Text style={styles.metaLine}>Period: {report.range?.label}</Text>
                        <Text style={styles.metaLine}>Generated: {new Date(report.generatedAt).toLocaleDateString('en-RW', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                    </View>
                </View>

                {/* KPI grid */}
                <View style={styles.kpiWrap}>
                    {(report.kpis || []).map((k, i) => (
                        <View key={i} style={styles.kpiCard}>
                            <View style={styles.kpiCardInner}>
                                <Text style={styles.kpiLabel}>{k.label}</Text>
                                <Text style={styles.kpiValue}>{formatValue(k.value, k.format, currency)}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Sections */}
                {(report.sections || []).map((section) => (
                    <TableSection key={section.id} section={section} currency={currency} />
                ))}

                <Text style={styles.footer} fixed>
                    The Quality Market · Confidential business report · support@thequalitymarket.com
                </Text>
            </Page>
        </Document>
    );
}

export async function generateReportPdf(report) {
    let logoSrc = null;
    try {
        const filePath = path.join(process.cwd(), 'public', 'the-quality-market-logo.png');
        logoSrc = `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
    } catch {}

    return renderToBuffer(<ReportDocument report={report} logoSrc={logoSrc} />);
}
