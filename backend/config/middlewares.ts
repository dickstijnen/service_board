import type { Core } from "@strapi/strapi";

/**
 * Strapi middleware stack.
 *
 * `strapi::security` is expanded to its object form so we can extend the CSP
 * for the Media Library: without these directives, thumbnails of Spaces-hosted
 * images break in the admin (they upload fine but render blank/broken-image).
 *
 * The wildcard `*.digitaloceanspaces.com` covers both the bucket origin and
 * the CDN host for every region — no env coupling needed here. If you ever
 * migrate to a different media host, add it to img-src + media-src.
 */
const config: Core.Config.Middlewares = [
    "strapi::logger",
    "strapi::errors",
    {
        name: "strapi::security",
        config: {
            contentSecurityPolicy: {
                useDefaults: true,
                directives: {
                    "connect-src": ["'self'", "https:"],
                    "img-src": ["'self'", "data:", "blob:", "market-assets.strapi.io", "*.digitaloceanspaces.com"],
                    "media-src": ["'self'", "data:", "blob:", "*.digitaloceanspaces.com"],
                    upgradeInsecureRequests: null,
                },
            },
        },
    },
    "strapi::cors",
    "strapi::poweredBy",
    "strapi::query",
    "strapi::body",
    "strapi::session",
    "strapi::favicon",
    "strapi::public",
];

export default config;
