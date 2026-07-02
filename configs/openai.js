import OpenAI from "openai";

// Lazy OpenAI client — see configs/resend.js for why. `new OpenAI()` throws when
// OPENAI_API_KEY is missing, and Next.js imports every route during `next build`
// page-data collection; this proxy defers construction to first runtime use.
let _client;
function getOpenAI() {
    if (!_client) {
        _client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.OPENAI_BASE_URL
        });
    }
    return _client;
}

export const openai = new Proxy({}, {
    get(_target, prop) {
        const client = getOpenAI();
        const value = client[prop];
        return typeof value === 'function' ? value.bind(client) : value;
    },
});
