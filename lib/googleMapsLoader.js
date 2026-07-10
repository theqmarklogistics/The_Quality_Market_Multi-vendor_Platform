// Client-side Google Maps JS API loader (singleton). Injects the script tag once
// and resolves with the `google.maps` namespace. The browser key is inlined at
// build time from PUBLIC_GOOGLE_MAPS_API_KEY via next.config.mjs.
let loaderPromise = null;

export function loadGoogleMaps() {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Google Maps can only load in the browser"));
    }
    if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
    if (loaderPromise) return loaderPromise;

    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));

    loaderPromise = new Promise((resolve, reject) => {
        const cbName = "__tqmGmapsReady";
        window[cbName] = () => resolve(window.google.maps);
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cbName}`;
        script.async = true;
        script.onerror = () => {
            loaderPromise = null;
            reject(new Error("Failed to load Google Maps"));
        };
        document.head.appendChild(script);
    });
    return loaderPromise;
}

// HTML marker on top of Google Maps via OverlayView — keeps our branded teardrop
// pins (emoji glyph + pulse ring) without requiring a registered map ID.
// Returns { setPosition, setMap, remove }.
export function createHtmlMarker(maps, map, { lat, lng }, html, { title, onClick } = {}) {
    class HtmlMarker extends maps.OverlayView {
        constructor() {
            super();
            this.position = new maps.LatLng(lat, lng);
            this.container = document.createElement("div");
            this.container.style.position = "absolute";
            this.container.style.cursor = onClick ? "pointer" : "default";
            if (title) this.container.title = title;
            this.container.innerHTML = html;
            if (onClick) {
                // Stop the map from swallowing the tap.
                this.container.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onClick();
                });
            }
        }
        onAdd() {
            this.getPanes().overlayMouseTarget.appendChild(this.container);
        }
        draw() {
            const proj = this.getProjection();
            if (!proj) return;
            const pt = proj.fromLatLngToDivPixel(this.position);
            if (!pt) return;
            // Anchor at the pin tip (bottom-center of the 30px teardrop).
            this.container.style.left = `${pt.x - 15}px`;
            this.container.style.top = `${pt.y - 30}px`;
        }
        onRemove() {
            this.container.remove();
        }
        setPosition(pos) {
            this.position = new maps.LatLng(pos.lat, pos.lng);
            this.draw();
        }
    }

    const marker = new HtmlMarker();
    marker.setMap(map);
    return marker;
}
