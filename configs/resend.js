import { Resend } from 'resend';

// Lazy Resend client. Constructing `new Resend(undefined)` throws "Missing API
// key", and Next.js imports every route module during `next build` (page-data
// collection) — so a module-scope client would crash the build when
// RESEND_API_KEY isn't present at build time. This proxy defers construction to
// the first real use (always at runtime, where the key exists).
let _client;
function getResend() {
    if (!_client) _client = new Resend(process.env.RESEND_API_KEY);
    return _client;
}

const resend = new Proxy({}, {
    get(_target, prop) {
        const client = getResend();
        const value = client[prop];
        return typeof value === 'function' ? value.bind(client) : value;
    },
});

export default resend;
export { getResend };
