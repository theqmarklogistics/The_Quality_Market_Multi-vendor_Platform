import ImageKit, { toFile } from "@imagekit/nodejs";

// Lazy ImageKit client — see configs/resend.js for why. Constructing at module
// scope would run during `next build` page-data collection (when the keys may be
// absent) and can throw; this proxy defers it to first runtime use.
let _client;
function getImageKit() {
    if (!_client) {
        _client = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
        });
    }
    return _client;
}

const imageKit = new Proxy({}, {
    get(_target, prop) {
        const client = getImageKit();
        const value = client[prop];
        return typeof value === 'function' ? value.bind(client) : value;
    },
});

export default imageKit;
export { toFile };
