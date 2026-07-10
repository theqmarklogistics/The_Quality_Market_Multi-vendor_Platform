'use client'
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps, createHtmlMarker } from "@/lib/googleMapsLoader";
import { KIGALI_HUB } from "@/lib/deliveryEta";

// Branded teardrop pin (same HTML as the old Leaflet divIcon).
const pinHtml = (bg, glyph, ring = false) => `<div style="
    background:${bg};
    width:30px;height:30px;border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    border:2px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,.35);
    display:flex;align-items:center;justify-content:center;
    ${ring ? 'animation:tqmPulse 1.5s infinite;' : ''}
"><span style="transform:rotate(45deg);font-size:14px;line-height:1;">${glyph}</span></div>`;

const RIDER_PIN = pinHtml("#16a34a", "🛵", true);
const CUSTOMER_PIN = pinHtml("#dc2626", "📍");
const HUB_PIN = pinHtml("#0f172a", "🏬");
const STOP_PIN = pinHtml("#64748b", "•");

/**
 * Shared live map on Google Maps. Renders optional hub, rider, customer and
 * corridor-stop markers plus the (road or sketched) route. All position props
 * are {lat,lng} or null — same contract as the old Leaflet version.
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
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const mapsRef = useRef(null);
    const markersRef = useRef([]);
    const linesRef = useRef([]);
    const infoRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    // Normalise to a single list of rider pins (supports single + multi-rider callers).
    const riderPins = useMemo(() => {
        const list = Array.isArray(riders) ? riders.filter((r) => r && r.lat != null && r.lng != null) : [];
        if (riderPos && riderPos.lat != null && riderPos.lng != null) {
            list.push({ lat: riderPos.lat, lng: riderPos.lng, label: "Your rider" });
        }
        return list;
    }, [riders, riderPos]);

    const fitPoints = useMemo(
        () => [hub, customerPos, ...riderPins, ...stops].filter((p) => p && p.lat != null && p.lng != null),
        [hub, customerPos, riderPins, stops]
    );

    // A real road route (from OSRM, [lat,lng] pairs) beats the straight-line sketch.
    const roadLine = useMemo(
        () => (Array.isArray(routeGeometry) && routeGeometry.length > 1 ? routeGeometry : null),
        [routeGeometry]
    );

    const sketchLine = useMemo(() => {
        if (!showRoute || roadLine) return null;
        const ordered = [...stops]
            .filter((s) => s.lat != null && s.lng != null)
            .sort((a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0));
        const pts = [hub, ...ordered].filter(Boolean).map((p) => ({ lat: p.lat, lng: p.lng }));
        return pts.length > 1 ? pts : null;
    }, [showRoute, stops, hub, roadLine]);

    // Init the map once.
    useEffect(() => {
        let cancelled = false;
        loadGoogleMaps()
            .then((maps) => {
                if (cancelled || !containerRef.current || mapRef.current) return;
                mapsRef.current = maps;
                const center = riderPins[0] || customerPos || hub || KIGALI_HUB;
                mapRef.current = new maps.Map(containerRef.current, {
                    center: { lat: center.lat, lng: center.lng },
                    zoom: 14,
                    scrollwheel: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    clickableIcons: false,
                });
                infoRef.current = new maps.InfoWindow();
                setReady(true);
            })
            .catch(() => setFailed(true));
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync markers + route lines whenever inputs change (small counts — rebuild is fine).
    useEffect(() => {
        const maps = mapsRef.current;
        const map = mapRef.current;
        if (!ready || !maps || !map) return;

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];
        linesRef.current.forEach((l) => l.setMap(null));
        linesRef.current = [];

        const openInfo = (position, text) => {
            infoRef.current.setContent(`<div style="font: 13px sans-serif; color:#0f172a; padding:2px 4px;">${text}</div>`);
            infoRef.current.setPosition(position);
            infoRef.current.open({ map });
        };

        const addPin = (pos, html, label) => {
            const marker = createHtmlMarker(maps, map, pos, html, {
                title: label,
                onClick: () => openInfo(pos, label),
            });
            markersRef.current.push(marker);
        };

        if (roadLine) {
            linesRef.current.push(new maps.Polyline({
                map,
                path: roadLine.map(([lat, lng]) => ({ lat, lng })),
                strokeColor: "#16a34a",
                strokeWeight: 4,
                strokeOpacity: 0.8,
            }));
        }
        if (sketchLine) {
            // Dashed sketch: transparent stroke + repeated dash symbol.
            linesRef.current.push(new maps.Polyline({
                map,
                path: sketchLine,
                strokeOpacity: 0,
                icons: [{
                    icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, strokeColor: "#16a34a", strokeWeight: 3, scale: 3 },
                    offset: "0",
                    repeat: "16px",
                }],
            }));
        }

        if (hub && hub.lat != null && hub.lng != null) addPin(hub, HUB_PIN, "Pickup hub");
        stops.forEach((s, i) => {
            if (s.lat != null && s.lng != null) {
                addPin({ lat: s.lat, lng: s.lng }, STOP_PIN, s.label || `Stop ${s.stopSequence ?? i + 1}`);
            }
        });
        if (customerPos && customerPos.lat != null && customerPos.lng != null) {
            addPin(customerPos, CUSTOMER_PIN, "Delivery location");
        }
        riderPins.forEach((r) => addPin({ lat: r.lat, lng: r.lng }, RIDER_PIN, r.label || "Rider"));

        // Fit to everything visible (mirrors the Leaflet FitBounds behaviour).
        if (fitPoints.length === 1) {
            map.setCenter({ lat: fitPoints[0].lat, lng: fitPoints[0].lng });
            map.setZoom(15);
        } else if (fitPoints.length > 1) {
            const bounds = new maps.LatLngBounds();
            fitPoints.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
            map.fitBounds(bounds, 40);
            const capZoom = maps.event.addListenerOnce(map, "idle", () => {
                if (map.getZoom() > 16) map.setZoom(16);
            });
            return () => maps.event.removeListener(capZoom);
        }
    }, [ready, hub, stops, customerPos, riderPins, roadLine, sketchLine, fitPoints]);

    return (
        <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", position: "relative", zIndex: 0 }}>
            <style>{`@keyframes tqmPulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.5)}70%{box-shadow:0 0 0 12px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}`}</style>
            {failed ? (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400 text-sm">
                    Map unavailable
                </div>
            ) : (
                <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
            )}
        </div>
    );
}
