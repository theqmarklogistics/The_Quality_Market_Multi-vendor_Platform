'use client'
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, createHtmlMarker } from "@/lib/googleMapsLoader";
import { KIGALI_HUB } from "@/lib/deliveryEta";

// Branded teardrop pin (same look as the old Leaflet divIcon).
const PIN_HTML = `<div style="background:#dc2626;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>`;

// Tap-to-drop-pin Google Map for choosing a delivery location. `value` is {lat,lng}|null.
export default function LocationPickerInner({ value = null, onPick, height = 240 }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const mapsRef = useRef(null);
    const markerRef = useRef(null);
    const onPickRef = useRef(onPick);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    // Keep the latest onPick without re-binding the map click listener.
    useEffect(() => {
        onPickRef.current = onPick;
    }, [onPick]);

    useEffect(() => {
        let cancelled = false;
        loadGoogleMaps()
            .then((maps) => {
                if (cancelled || !containerRef.current || mapRef.current) return;
                mapsRef.current = maps;
                const center = value && value.lat != null ? value : KIGALI_HUB;
                mapRef.current = new maps.Map(containerRef.current, {
                    center: { lat: center.lat, lng: center.lng },
                    zoom: 13,
                    scrollwheel: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    clickableIcons: false,
                });
                mapRef.current.addListener("click", (e) => {
                    onPickRef.current?.(e.latLng.lat(), e.latLng.lng());
                });
                setReady(true);
            })
            .catch(() => setFailed(true));
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep the pin in sync with `value`.
    useEffect(() => {
        const maps = mapsRef.current;
        const map = mapRef.current;
        if (!ready || !maps || !map) return;
        const hasPin = value && value.lat != null && value.lng != null;

        if (markerRef.current) {
            markerRef.current.setMap(null);
            markerRef.current = null;
        }
        if (hasPin) {
            markerRef.current = createHtmlMarker(maps, map, { lat: value.lat, lng: value.lng }, PIN_HTML);
        }
    }, [ready, value]);

    return (
        <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", position: "relative", zIndex: 0 }}>
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
