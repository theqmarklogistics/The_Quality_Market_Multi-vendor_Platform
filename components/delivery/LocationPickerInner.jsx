'use client'
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { KIGALI_HUB } from "@/lib/deliveryEta";

// Teardrop pin (avoids Leaflet's default PNG path breaking under the bundler).
const PIN_ICON = L.divIcon({
    className: "tqm-pick-pin",
    html: `<div style="background:#dc2626;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
});

function ClickCapture({ onPick }) {
    useMapEvents({
        click(e) { onPick?.(e.latlng.lat, e.latlng.lng); },
    });
    return null;
}

// Tap-to-drop-pin map for choosing a delivery location. `value` is {lat,lng}|null.
export default function LocationPickerInner({ value = null, onPick, height = 240 }) {
    const hasPin = value && value.lat != null && value.lng != null;
    const center = hasPin ? [value.lat, value.lng] : [KIGALI_HUB.lat, KIGALI_HUB.lng];

    return (
        <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", position: "relative", zIndex: 0 }}>
            <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickCapture onPick={onPick} />
                {hasPin && <Marker position={[value.lat, value.lng]} icon={PIN_ICON} />}
            </MapContainer>
        </div>
    );
}
