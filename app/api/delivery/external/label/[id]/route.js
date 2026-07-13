import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image as PDFImage } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import path from "path";
import fs from "fs";

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

const styles = StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 10, color: "#334155", padding: 36, backgroundColor: "#ffffff" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: BRAND_GREEN },
    brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: BRAND_DARK },
    brandSub: { fontSize: 8, color: BRAND_GREEN, marginTop: 2 },
    badge: { backgroundColor: BRAND_DARK, color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold", padding: "3 8", borderRadius: 4 },
    section: { marginBottom: 12 },
    sectionTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 5 },
    orderId: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND_DARK, letterSpacing: 1 },
    row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
    label: { color: "#64748b" },
    value: { fontFamily: "Helvetica-Bold", color: "#0f172a" },
    qrWrapper: { alignItems: "center", marginTop: 10 },
    qrImage: { width: 130, height: 130 },
    qrCaption: { fontSize: 8, color: "#94a3b8", marginTop: 6, textAlign: "center" },
    footer: { marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0", textAlign: "center", fontSize: 8, color: "#94a3b8" },
});

function ExternalLabel({ order, senderName }) {
    const recipientAddr = [order.address?.sector, order.address?.city].filter(Boolean).join(", ");
    // QR leads to the public package page (owner info, no confirmation code).
    const packageUrl = `${APP_URL}/package/${order.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(packageUrl)}`;

    return (
        <Document>
            <Page size="A5" style={styles.page}>
                <View style={styles.header}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {LOGO_SRC && <PDFImage src={LOGO_SRC} style={{ width: 32, height: 32, marginRight: 8 }} />}
                        <View>
                            <Text style={styles.brand}>The Quality Market</Text>
                            <Text style={styles.brandSub}>Delivery service · thequalitymarket.com</Text>
                        </View>
                    </View>
                    <Text style={styles.badge}>EXTERNAL · KIGALI POOL</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Tracking ID</Text>
                    <Text style={styles.orderId}>{order.id}</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Sender</Text>
                    <View style={styles.row}><Text style={styles.label}>Partner</Text><Text style={styles.value}>{senderName || "—"}</Text></View>
                    {order.pickupContactName && <View style={styles.row}><Text style={styles.label}>Pickup contact</Text><Text style={styles.value}>{order.pickupContactName}</Text></View>}
                    {order.pickupPhone && <View style={styles.row}><Text style={styles.label}>Pickup phone</Text><Text style={styles.value}>{order.pickupPhone}</Text></View>}
                    {order.pickupLandmark && <View style={styles.row}><Text style={styles.label}>Pickup</Text><Text style={[styles.value, { maxWidth: 220, textAlign: "right" }]}>{order.pickupLandmark}</Text></View>}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recipient</Text>
                    <View style={styles.row}><Text style={styles.label}>Name</Text><Text style={styles.value}>{order.address?.name || "—"}</Text></View>
                    <View style={styles.row}><Text style={styles.label}>Phone</Text><Text style={styles.value}>{order.address?.phone || "—"}</Text></View>
                    <View style={styles.row}><Text style={styles.label}>Area</Text><Text style={styles.value}>{recipientAddr || "—"}</Text></View>
                    {order.landmarkAddress && <View style={styles.row}><Text style={styles.label}>Landmark</Text><Text style={[styles.value, { maxWidth: 220, textAlign: "right", color: BRAND_GREEN }]}>{order.landmarkAddress}</Text></View>}
                </View>

                {order.packageDescription && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Package</Text>
                        <Text style={styles.value}>{order.packageDescription}</Text>
                    </View>
                )}

                <View style={styles.qrWrapper}>
                    <PDFImage style={styles.qrImage} src={qrUrl} />
                    <Text style={styles.qrCaption}>Scan for package details (owner &amp; destination)</Text>
                </View>

                <Text style={styles.footer}>The Quality Market — Kigali Pooled Delivery (external)</Text>
            </Page>
        </Document>
    );
}

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id: orderId } = await params;
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { address: true, user: { select: { name: true } } },
        });

        if (!order || !order.isExternalDelivery) {
            return NextResponse.json({ error: "External delivery not found" }, { status: 404 });
        }
        // Labels are issued by staff only (admin / logistics manager); the package
        // is labelled at intake, not by the partner.
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — delivery documents are issued by The Quality Market staff" }, { status: 403 });
        }

        const pdfBuffer = await renderToBuffer(<ExternalLabel order={order} senderName={order.user?.name} />);

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="external-label-${orderId}.pdf"`,
            },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
