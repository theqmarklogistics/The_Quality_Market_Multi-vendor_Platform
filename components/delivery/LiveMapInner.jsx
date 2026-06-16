'use client'
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { KIGALI_HUB } from "@/lib/deliveryEta";

// Custom HTML markers — avoids Leaflet's default PNG icon path breaking under the bundler.
const makeIcon = (bg, glyph, ring = false) =>
    L.divIcon({
        className: "tqm-map-pin",
        html: `<div style="
            background:${bg};
            width:30px;height:30px;border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            border:2px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,.35);
            display:flex;align-items:center;justify-content:center;
            ${ring ? 'animation:tqmPulse 1.5s infinite;' : ''}
        "><span style="transform:rotate(45deg);font-size:14px;line-height:1;">${glyph}</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -28],
    });

const RIDER_ICON = makeIcon("#16a34a", "🛵", true);
const CUSTOMER_ICON = makeIcon("#dc2626", "📍");
const HUB_ICON = makeIcon("#0f172a", "🏬");
const STOP_ICON = makeIcon("#64748b", "•");

function FitBounds({ points }) {
    const map = useMap();
    useEffect(() => {
        const valid = points.filter((p) => p && p.lat != null && p.lng != null);
        if (valid.length === 0) return;
        if (valid.length === 1) {
            map.setView([valid[0].lat, valid[0].lng], 15);
            return;
        }
        const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }, [points, map]);
    return null;
}

/**
 * Shared live map. Renders OpenStreetMap tiles with optional hub, rider, customer
 * and corridor-stop markers. All position props are {lat,lng} or null.
 */
export default function LiveMapInner({
    riderPos = null,
    riders = [],
    customerPos = null,
    hub = KIGALI_HUB,
    stops = [],
    showRoute = false,
    routeGeometry = null,
    height = 320,
}) {
    // Normalise to a single list of rider pins (supports both single + multi-rider callers).
    const riderPins = useMemo(() => {
        const list = Array.isArray(riders) ? riders.filter((r) => r && r.lat != null && r.lng != null) : [];
        if (riderPos && riderPos.lat != null && riderPos.lng != null) {
            list.push({ lat: riderPos.lat, lng: riderPos.lng, label: "Your rider" });
        }
        return list;
    }, [riders, riderPos]);

    const fitPoints = useMemo(
        () => [hub, customerPos, ...riderPins, ...stops].filter(Boolean),
        [hub, customerPos, riderPins, stops]
    );

    // A real road route (from OSRM) takes precedence over the straight-line corridor sketch.
    const roadLine = useMemo(
        () => (Array.isArray(routeGeometry) && routeGeometry.length > 1 ? routeGeometry : null),
        [routeGeometry]
    );

    const routeLine = useMemo(() => {
        if (!showRoute || roadLine) return null;
        const ordered = [...stops]
            .filter((s) => s.lat != null && s.lng != null)
            .sort((a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0));
        const pts = [hub, ...ordered].filter(Boolean).map((p) => [p.lat, p.lng]);
        return pts.length > 1 ? pts : null;
    }, [showRoute, stops, hub, roadLine]);

    const center = riderPins[0] || customerPos || hub;

    return (
        {/* position+z-index:0 traps Leaflet's internal z-indexes (panes/controls go up to
            1000) in their own stacking context, so they never paint over modals/overlays. */}
        <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", position: "relative", zIndex: 0 }}>
            <style>{`@keyframes tqmPulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.5)}70%{box-shadow:0 0 0 12px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}`}</style>
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={14}
                scrollWheelZoom={false}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {roadLine && (
                    <Polyline positions={roadLine} pathOptions={{ color: "#16a34a", weight: 4, opacity: 0.8 }} />
                )}
                {routeLine && (
                    <Polyline positions={routeLine} pathOptions={{ color: "#16a34a", weight: 3, dashArray: "6 8", opacity: 0.7 }} />
                )}
                {hub && (
                    <Marker position={[hub.lat, hub.lng]} icon={HUB_ICON}>
                        <Popup>Pickup hub</Popup>
                    </Marker>
                )}
                {stops.map((s, i) =>
                    s.lat != null && s.lng != null ? (
                        <Marker key={s.id || i} position={[s.lat, s.lng]} icon={STOP_ICON}>
                            <Popup>{s.label || `Stop ${s.stopSequence ?? i + 1}`}</Popup>
                        </Marker>
                    ) : null
                )}
                {customerPos && (
                    <Marker position={[customerPos.lat, customerPos.lng]} icon={CUSTOMER_ICON}>
                        <Popup>Delivery location</Popup>
                    </Marker>
                )}
                {riderPins.map((r, i) => (
                    <Marker key={r.id || `rider-${i}`} position={[r.lat, r.lng]} icon={RIDER_ICON}>
                        <Popup>{r.label || "Rider"}</Popup>
                    </Marker>
                ))}
                <FitBounds points={fitPoints} />
            </MapContainer>
        </div>
    );
}
