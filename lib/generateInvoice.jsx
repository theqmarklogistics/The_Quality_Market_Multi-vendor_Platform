import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image as PDFImage } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';

const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF';

// Brand colours — match Navbar/Footer exactly
const BRAND_BLUE = '#4f6bcb';
const BRAND_GREEN = '#79cc4f';

const styles = StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 10, color: '#334155', padding: 40, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: BRAND_BLUE },
    brand: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BRAND_BLUE },
    brandTagline: { fontSize: 9, color: BRAND_GREEN, marginTop: 2, fontFamily: 'Helvetica-Oblique' },
    brandSub: { fontSize: 8, color: '#64748b', marginTop: 4 },
    invoiceLabel: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: BRAND_BLUE, textAlign: 'right' },
    invoiceNum: { fontSize: 9, color: '#64748b', textAlign: 'right', marginTop: 3 },
    section: { marginBottom: 18 },
    sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
    label: { color: '#64748b' },
    value: { fontFamily: 'Helvetica-Bold', color: '#0f172a' },
    tableHeader: { flexDirection: 'row', backgroundColor: '#eef1fb', padding: '6 8', borderRadius: 4, marginBottom: 4 },
    tableHeaderText: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: BRAND_BLUE },
    tableRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    col1: { flex: 3 },
    col2: { flex: 1, textAlign: 'center' },
    col3: { flex: 1.2, textAlign: 'right' },
    col4: { flex: 1.4, textAlign: 'right' },
    totalsBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10 },
    totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
    totalLabel: { width: 110, color: '#64748b', textAlign: 'right', marginRight: 16 },
    totalValue: { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: '#0f172a' },
    grandTotalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: BRAND_BLUE },
    grandTotalLabel: { width: 110, textAlign: 'right', marginRight: 16, fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#0f172a' },
    grandTotalValue: { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 12, color: BRAND_BLUE },
    paymentBox: { marginTop: 20, padding: 14, backgroundColor: '#f0f4ff', borderRadius: 6, borderWidth: 1, borderColor: '#c7d2f8' },
    paymentBoxBank: { marginTop: 20, padding: 14, backgroundColor: '#f0f4ff', borderRadius: 6, borderWidth: 1, borderColor: '#c7d2f8' },
    paymentTitle: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: BRAND_BLUE, marginBottom: 8 },
    paymentTitleBank: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: BRAND_BLUE, marginBottom: 8 },
    footer: { marginTop: 32, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', fontSize: 8, color: '#94a3b8', textAlign: 'center' },
    badge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: BRAND_BLUE, borderRadius: 4, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 9, alignSelf: 'flex-start' },
});

function fmt(amount) {
    return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

function InvoiceDocument({ order, paymentConfig, logoSrc }) {
    const isMomo = order.paymentMethod === 'MTN_MOMO';
    const subtotal = order.orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const coupon = order.coupon && typeof order.coupon === 'object' ? order.coupon : null;
    const couponDiscount = coupon?.discount ? (coupon.discount / 100) * subtotal : 0;
    const shipping = Number(order.shippingCost || 0);

    return (
        <Document>
            <Page size="A4" style={styles.page}>

                {/* Header */}
                <View style={styles.header}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {logoSrc && (
                            <PDFImage src={logoSrc} style={{ width: 52, height: 30, marginRight: 8, objectFit: 'contain' }} />
                        )}
                        <View>
                            <Text style={styles.brand}>The Quality Market</Text>
                            <Text style={styles.brandTagline}>Quality is our Culture</Text>
                            <Text style={styles.brandSub}>Kigali, KN 82 St, Tropical plaza, C26</Text>
                            <Text style={styles.brandSub}>support@thequalitymarket.com  |  +250 783 610 209</Text>
                        </View>
                    </View>
                    <View>
                        <Text style={styles.invoiceLabel}>INVOICE</Text>
                        <Text style={styles.invoiceNum}>Order ID: {order.id.slice(0, 8).toUpperCase()}</Text>
                        <Text style={styles.invoiceNum}>Issued: {new Date().toLocaleDateString('en-RW', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                    </View>
                </View>

                {/* Bill To & Payment Method */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                    <View style={{ flex: 1.4 }}>
                        <Text style={styles.sectionTitle}>Bill To</Text>
                        <Text style={[styles.value, { fontSize: 11 }]}>{order.user?.name}</Text>
                        <Text style={styles.label}>{order.address?.street}</Text>
                        <Text style={styles.label}>{order.address?.city}, {order.address?.state}</Text>
                        <Text style={styles.label}>{order.address?.country}</Text>
                        <Text style={styles.label}>{order.address?.phone}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.sectionTitle}>Payment Method</Text>
                        <View style={styles.badge}>
                            <Text>{isMomo ? 'MTN MoMo' : 'Bank Transfer'}</Text>
                        </View>
                        <Text style={[styles.label, { marginTop: 6 }]}>Order date: {new Date(order.createdAt).toLocaleDateString()}</Text>
                        <Text style={[styles.label, { marginTop: 2 }]}>Order ID: {order.id.slice(0, 8).toUpperCase()}</Text>
                    </View>
                </View>

                {/* Items Table */}
                <Text style={styles.sectionTitle}>Order Items</Text>
                <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderText, styles.col1]}>Item</Text>
                    <Text style={[styles.tableHeaderText, styles.col2]}>Qty</Text>
                    <Text style={[styles.tableHeaderText, styles.col3]}>Unit Price</Text>
                    <Text style={[styles.tableHeaderText, styles.col4]}>Subtotal</Text>
                </View>
                {order.orderItems.map((item, i) => (
                    <View key={i} style={styles.tableRow}>
                        <Text style={styles.col1}>{item.product?.name || 'Product'}</Text>
                        <Text style={styles.col2}>{item.quantity}</Text>
                        <Text style={styles.col3}>{fmt(item.price)}</Text>
                        <Text style={styles.col4}>{fmt(item.price * item.quantity)}</Text>
                    </View>
                ))}

                {/* Totals */}
                <View style={styles.totalsBox}>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Subtotal</Text>
                        <Text style={styles.totalValue}>{fmt(subtotal)}</Text>
                    </View>
                    {shipping > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Shipping</Text>
                            <Text style={styles.totalValue}>{fmt(shipping)}</Text>
                        </View>
                    )}
                    {couponDiscount > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Coupon ({coupon.code})</Text>
                            <Text style={[styles.totalValue, { color: BRAND_GREEN }]}>- {fmt(couponDiscount)}</Text>
                        </View>
                    )}
                    <View style={styles.grandTotalRow}>
                        <Text style={styles.grandTotalLabel}>Total Due</Text>
                        <Text style={styles.grandTotalValue}>{fmt(order.total)}</Text>
                    </View>
                </View>

                {/* Payment Instructions */}
                {isMomo ? (
                    <View style={styles.paymentBox}>
                        <Text style={styles.paymentTitle}>MTN MoMo Payment Instructions</Text>
                        <View style={styles.row}><Text style={styles.label}>Account Name:</Text><Text style={styles.value}>{paymentConfig?.momoAccountName || '—'}</Text></View>
                        <View style={styles.row}><Text style={styles.label}>Pay Code:</Text><Text style={styles.value}>{paymentConfig?.momoPayCode || '—'}</Text></View>
                        <View style={styles.row}><Text style={styles.label}>Amount to Pay:</Text><Text style={styles.value}>{fmt(order.total)}</Text></View>
                        <Text style={[styles.label, { marginTop: 8, fontSize: 9 }]}>Use reference number <Text style={styles.value}>{order.id.slice(0, 8).toUpperCase()}</Text> as the payment note.</Text>
                    </View>
                ) : (
                    <View style={styles.paymentBoxBank}>
                        <Text style={styles.paymentTitleBank}>Bank Transfer Payment Instructions</Text>
                        <View style={styles.row}><Text style={styles.label}>Bank Name:</Text><Text style={styles.value}>{paymentConfig?.bankName || '—'}</Text></View>
                        <View style={styles.row}><Text style={styles.label}>Account Number:</Text><Text style={styles.value}>{paymentConfig?.bankAccountNumber || '—'}</Text></View>
                        <View style={styles.row}><Text style={styles.label}>Account Name:</Text><Text style={styles.value}>{paymentConfig?.bankAccountName || '—'}</Text></View>
                        {paymentConfig?.bankBranch && (
                            <View style={styles.row}><Text style={styles.label}>Branch:</Text><Text style={styles.value}>{paymentConfig.bankBranch}</Text></View>
                        )}
                        <View style={styles.row}><Text style={styles.label}>Amount to Transfer:</Text><Text style={styles.value}>{fmt(order.total)}</Text></View>
                        <Text style={[styles.label, { marginTop: 8, fontSize: 9 }]}>Use reference number <Text style={styles.value}>{order.id.slice(0, 8).toUpperCase()}</Text> as the transfer description.</Text>
                    </View>
                )}

                {/* Footer */}
                <Text style={styles.footer}>
                    Thank you for shopping at The Quality Market!{'\n'}
                    After payment, please upload your proof from My Orders so we can verify and approve your order.{'\n'}
                    Questions? Contact us at support@thequalitymarket.com
                </Text>
            </Page>
        </Document>
    );
}

export async function generateInvoice({ order, paymentConfig }) {
    let logoSrc = null;
    try {
        const filePath = path.join(process.cwd(), 'public', 'the-quality-market-logo.png');
        logoSrc = `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
    } catch {}

    const buffer = await renderToBuffer(
        <InvoiceDocument order={order} paymentConfig={paymentConfig} logoSrc={logoSrc} />
    );
    return buffer;
}
