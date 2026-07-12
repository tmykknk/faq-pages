import { defineMiddleware } from "astro:middleware";

const securityHeaders = {
    "Content-Security-Policy":
        "default-src 'self'; " +
        "base-uri 'self'; " +
        "object-src 'none'; " +
        "frame-ancestors 'none'; " +
        "form-action 'self'; " +
        "script-src 'self'; " +
        "style-src 'self'; " +
        "style-src-elem 'self' 'unsafe-inline'; " +
        "style-src-attr 'none'; " +
        "img-src 'self' data:; " +
        "font-src 'self'; " +
        "connect-src 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export const onRequest = defineMiddleware(async (_context, next) => {
    const response = await next();
    const headers = new Headers(response.headers);

    for (const [name, value] of Object.entries(securityHeaders)) {
        headers.set(name, value);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
});
