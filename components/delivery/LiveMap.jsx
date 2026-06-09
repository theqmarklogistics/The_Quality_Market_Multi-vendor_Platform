'use client'
import dynamic from "next/dynamic";

// Leaflet touches `window`, so the actual map must never render on the server.
const LiveMapInner = dynamic(() => import("./LiveMapInner"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center bg-slate-100 text-slate-400 text-sm rounded-2xl" style={{ height: 320 }}>
            Loading map…
        </div>
    ),
});

export default function LiveMap(props) {
    return <LiveMapInner {...props} />;
}
