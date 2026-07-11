import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image as PDFImage } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import path from "path";
import fs from "fs";

// Printable documents for an external (delivery-only) booking:
//   ?type=invoice   — shipping invoice (billed to the partner)
//   ?type=sender    — sender receipt, handed to whoever drops off the package
//   ?type=receiver  — delivery confirmation the receiver signs at the door
// (The package label lives at /api/delivery/external/label/[id].)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thequalitymarket.com";
// Base64 data URI so the logo embeds on every host (raw Windows paths are
// misread as URLs by react-pdf and the image silently drops out).
let LOGO_SRC = null;
try {
    const logoPath = path.join(process.cwd(), "public", "the-quality-market-logo.png");
    LOGO_SRC = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
} catch { /* render without the logo rather than fail the document */ }
const BRAND_GREEN = "#16a34a";
const BRAND_DARK = "#0f172a";
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "RWF";

const WEIGHT_POLICY =
    "Declared weight and dimensions are verified at intake. If the actual weight or volume exceeds the declaration, " +
    "the package is held until the difference is paid; unpaid differences cancel the delivery and the fee already paid is not refunded.";

const styles = StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 10, color: "#334155", padding: 40, backgroundColor: "#ffffff" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: BRAND_GREEN },
    brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: BRAND_DARK },
    brandSub: { fontSize: 8, color: BRAND_GREEN, marginTop: 2 },
    badge: { backgroundColor: BRAND_DARK, color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold", padding: "3 8", borderRadius: 4 },
    section: { marginBottom: 14 },
    sectionTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 5 },
    orderId: { fontSize: 16, fontFamily: "Helvetica-Bold", color: BRAND_DARK, letterSpacing: 1 },
    row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
    label: { color: "#64748b" },
    value: { fontFamily: "Helvetica-Bold", color: "#0f172a", maxWidth: 300, textAlign: "right" },
    cols: { flexDirection: "row", gap: 18 },
    col: { flex: 1 },
    tableHead: { flexDirection: "row", backgroundColor: "#f1f5f9", padding: "5 8", borderRadius: 4, marginBottom: 4 },
    tableRow: { flexDirection: "row", padding: "4 8", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
    thDesc: { flex: 3, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase" },
    thAmt: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase", textAlign: "right" },
    tdDesc: { flex: 3 },
    tdAmt: { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold", color: "#0f172a" },
    totalRow: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: BRAND_DARK },
    totalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" },
    totalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND_GREEN },
    note: { fontSize: 8, color: "#92400e", backgroundColor: "#fffbeb", borderWidth: 0.5, borderColor: "#fde68a", borderRadius: 4, padding: 8, lineHeight: 1.5 },
    statement: { fontSize: 10, color: "#0f172a", lineHeight: 1.6, marginBottom: 6 },
    sigBlock: { marginTop: 26, flexDirection: "row", gap: 30 },
    sigBox: { flex: 1 },
    sigLine: { borderBottomWidth: 1, borderBottomColor: "#94a3b8", height: 34, marginBottom: 4 },
    sigLabel: { fontSize: 8, color: "#64748b" },
    footer: { position: "absolute", bottom: 28, left: 40, right: 40, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0", textAlign: "center", fontSize: 8, color: "#94a3b8" },
    qrWrapper: { alignItems: "center", marginTop: 8 },
    qrImage: { width: 100, height: 100 },
    qrCaption: { fontSize: 8, color: "#94a3b8", marginTop: 4, textAlign: "center" },
});

const money = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString()}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function Header({ badge }) {
    return (
        <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                {LOGO_SRC && <PDFImage src={LOGO_SRC} style={{ width: 34, height: 34, marginRight: 8 }} />}
                <View>
                    <Text style={styles.brand}>The Quality Market</Text>
                    <Text style={styles.brandSub}>Delivery service · thequalitymarket.com</Text>
                </View>
            </View>
            <Text style={styles.badge}>{badge}</Text>
        </View>
    );
}

function Row({ label, value }) {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value ?? "—"}</Text>
        </View>
    );
}

function PackageDetails({ order }) {
    const dims = order.packageLengthCm && order.packageWidthCm && order.packageHeightCm
        ? `${order.packageLengthCm} × ${order.packageWidthCm} × ${order.packageHeightCm} cm`
        : null;
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Package</Text>
            <Row label="Description" value={order.packageDescription || "Package"} />
            <Row label="Declared weight" value={order.packageWeightKg ? `${order.packageWeightKg} kg` : "—"} />
            {dims && <Row label="Declared dimensions" value={dims} />}
            {order.declaredValue != null && <Row label="Declared value" value={money(order.declaredValue)} />}
        </View>
    );
}

function paymentLabel(order) {
    if (order.isPaid) return "PAID";
    if (order.paymentProofStatus === "SUBMITTED") return "PAYMENT UNDER REVIEW";
    return "AWAITING PAYMENT";
}

// ── 1. Shipping invoice ──────────────────────────────────────────────────────
function ShippingInvoice({ order, partnerName, partnerEmail }) {
    const credit = Number(order.creditApplied ?? 0);
    const amountDue = Math.max(0, Number(order.total ?? 0) - credit);
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Header badge="SHIPPING INVOICE" />

                <View style={[styles.cols, styles.section]}>
                    <View style={styles.col}>
                        <Text style={styles.sectionTitle}>Invoice</Text>
                        <Text style={styles.orderId}>INV-{order.id.replace(/^ord_/, "").toUpperCase()}</Text>
                        <Text style={{ marginTop: 4, color: "#64748b" }}>Issued {fmtDate(order.createdAt)}</Text>
                        <Text style={{ marginTop: 2, color: "#64748b" }}>Tracking ID: {order.id}</Text>
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.sectionTitle}>Billed to</Text>
                        <Text style={{ fontFamily: "Helvetica-Bold", color: "#0f172a" }}>{partnerName || "Delivery partner"}</Text>
                        {partnerEmail ? <Text style={{ marginTop: 2, color: "#64748b" }}>{partnerEmail}</Text> : null}
                        <Text style={{ marginTop: 6, fontSize: 8, color: "#64748b" }}>Payment: {order.paymentMethod?.replace("_", " ")} · {paymentLabel(order)}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Deliver to</Text>
                    <Row label="Recipient" value={order.address?.name} />
                    <Row label="Phone" value={order.address?.phone} />
                    <Row label="Area" value={[order.address?.sector, order.address?.city].filter(Boolean).join(", ")} />
                    {order.landmarkAddress && <Row label="Landmark" value={order.landmarkAddress} />}
                </View>

                <PackageDetails order={order} />

                <View style={styles.section}>
                    <View style={styles.tableHead}>
                        <Text style={styles.thDesc}>Description</Text>
                        <Text style={styles.thAmt}>Amount</Text>
                    </View>
                    <View style={styles.tableRow}>
                        <Text style={styles.tdDesc}>
                            Kigali pooled delivery — {order.packageDescription || "package"}
                            {order.recipientLat != null ? " (priced from the recipient's shared location)" : " (provisional flat rate — awaiting recipient location)"}
                        </Text>
                        <Text style={styles.tdAmt}>{money(order.total)}</Text>
                    </View>
                    {credit > 0 && (
                        <View style={styles.tableRow}>
                            <Text style={styles.tdDesc}>Pooling credit applied</Text>
                            <Text style={styles.tdAmt}>−{money(credit)}</Text>
                        </View>
                    )}
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Amount due</Text>
                        <Text style={styles.totalValue}>{money(amountDue)}</Text>
                    </View>
                </View>

                <Text style={styles.note}>{WEIGHT_POLICY}</Text>

                <Text style={styles.footer}>The Quality Market — Kigali Pooled Delivery · This invoice was generated electronically and is valid without a signature.</Text>
            </Page>
        </Document>
    );
}

// ── 2. Sender receipt (given to the sender at handover) ─────────────────────
function SenderReceipt({ order, partnerName }) {
    const packageUrl = `${APP_URL}/package/${order.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(packageUrl)}`;
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Header badge="SENDER RECEIPT" />

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Tracking ID</Text>
                    <Text style={styles.orderId}>{order.id}</Text>
                    <Text style={{ marginTop: 3, color: "#64748b" }}>Booked {fmtDate(order.createdAt)}</Text>
                </View>

                <View style={[styles.cols, styles.section]}>
                    <View style={styles.col}>
                        <Text style={styles.sectionTitle}>Sender</Text>
                        <Row label="Partner" value={partnerName} />
                        {order.pickupContactName && <Row label="Pickup contact" value={order.pickupContactName} />}
                        {order.pickupPhone && <Row label="Pickup phone" value={order.pickupPhone} />}
                        {order.pickupLandmark && <Row label="Pickup point" value={order.pickupLandmark} />}
                        <Row label="Intake" value={order.intakeMethod === "DRIVER_SWEEP" ? "Driver sweep" : "Hub drop-off"} />
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.sectionTitle}>Recipient</Text>
                        <Row label="Name" value={order.address?.name} />
                        <Row label="Phone" value={order.address?.phone} />
                        <Row label="Area" value={[order.address?.sector, order.address?.city].filter(Boolean).join(", ")} />
                        {order.landmarkAddress && <Row label="Landmark" value={order.landmarkAddress} />}
                    </View>
                </View>

                <PackageDetails order={order} />

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Delivery fee</Text>
                    <Row label="Fee" value={money(order.total)} />
                    <Row label="Status" value={paymentLabel(order)} />
                </View>

                <Text style={styles.note}>
                    This receipt confirms the package described above was handed to The Quality Market for delivery. {WEIGHT_POLICY}
                </Text>

                <View style={styles.sigBlock}>
                    <View style={styles.sigBox}>
                        <View style={styles.sigLine} />
                        <Text style={styles.sigLabel}>Sender name &amp; signature · date</Text>
                    </View>
                    <View style={styles.sigBox}>
                        <View style={styles.sigLine} />
                        <Text style={styles.sigLabel}>Received by (staff / rider) · date</Text>
                    </View>
                </View>

                <View style={styles.qrWrapper}>
                    <PDFImage style={styles.qrImage} src={qrUrl} />
                    <Text style={styles.qrCaption}>Scan for package details</Text>
                </View>

                <Text style={styles.footer}>The Quality Market — Kigali Pooled Delivery · Keep this receipt until the delivery is confirmed.</Text>
            </Page>
        </Document>
    );
}

// ── 3. Delivery confirmation (signed by the receiver) ───────────────────────
function DeliveryConfirmation({ order, partnerName }) {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Header badge="DELIVERY CONFIRMATION" />

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Tracking ID</Text>
                    <Text style={styles.orderId}>{order.id}</Text>
                </View>

                <View style={[styles.cols, styles.section]}>
                    <View style={styles.col}>
                        <Text style={styles.sectionTitle}>Recipient</Text>
                        <Row label="Name" value={order.address?.name} />
                        <Row label="Phone" value={order.address?.phone} />
                        <Row label="Area" value={[order.address?.sector, order.address?.city].filter(Boolean).join(", ")} />
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.sectionTitle}>Sender</Text>
                        <Row label="Partner" value={partnerName} />
                        {order.deliveredAt && <Row label="Delivered" value={fmtDate(order.deliveredAt)} />}
                    </View>
                </View>

                <PackageDetails order={order} />

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Confirmation</Text>
                    <Text style={styles.statement}>
                        I, the undersigned, confirm that I have received the package described above, complete and in
                        good condition, from The Quality Market delivery service.
                    </Text>
                </View>

                <View style={styles.sigBlock}>
                    <View style={styles.sigBox}>
                        <View style={styles.sigLine} />
                        <Text style={styles.sigLabel}>Receiver name &amp; signature</Text>
                    </View>
                    <View style={styles.sigBox}>
                        <View style={styles.sigLine} />
                        <Text style={styles.sigLabel}>Date &amp; time</Text>
                    </View>
                </View>
                <View style={styles.sigBlock}>
                    <View style={styles.sigBox}>
                        <View style={styles.sigLine} />
                        <Text style={styles.sigLabel}>Rider name &amp; signature</Text>
                    </View>
                    <View style={styles.sigBox}>
                        <View style={styles.sigLine} />
                        <Text style={styles.sigLabel}>National ID no. (optional)</Text>
                    </View>
                </View>

                <Text style={styles.footer}>The Quality Market — Kigali Pooled Delivery · Signed copy is returned to the hub with the rider.</Text>
            </Page>
        </Document>
    );
}

const DOC_TYPES = {
    invoice: { component: ShippingInvoice, filename: (id) => `shipping-invoice-${id}.pdf` },
    sender: { component: SenderReceipt, filename: (id) => `sender-receipt-${id}.pdf` },
    receiver: { component: DeliveryConfirmation, filename: (id) => `delivery-confirmation-${id}.pdf` },
};

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") || "invoice";
        const doc = DOC_TYPES[type];
        if (!doc) return NextResponse.json({ error: "Unknown document type — use invoice, sender or receiver" }, { status: 400 });

        const { id: orderId } = await params;
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { address: true, user: { select: { name: true, email: true } } },
        });

        if (!order || !order.isExternalDelivery) {
            return NextResponse.json({ error: "External delivery not found" }, { status: 404 });
        }
        // The owning partner, or logistics/admin, may print documents.
        if (order.userId !== userId && !(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const Component = doc.component;
        const pdfBuffer = await renderToBuffer(
            <Component order={order} partnerName={order.user?.name} partnerEmail={order.user?.email} />
        );

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${doc.filename(orderId)}"`,
            },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
