'use client'
import dynamic from "next/dynamic";

// Leaflet touches `window`, so the picker must never render on the server.
const LocationPickerInner = dynamic(() => import("./LocationPickerInner"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center bg-slate-100 text-slate-400 text-sm rounded-2xl" style={{ height: 240 }}>
            Loading map…
        </div>
    ),
});

export default function LocationPicker(props) {
    return <LocationPickerInner {...props} />;
}
