import type { Core } from "@strapi/strapi";

/**
 * Strapi plugins config.
 *
 * Upload provider is env-gated:
 *   - DO_SPACE_BUCKET set  → DigitalOcean Spaces (S3-compatible) for prod media
 *   - DO_SPACE_BUCKET unset → Strapi's default local-disk provider (dev)
 *
 * A fresh clone with no Spaces vars just uses local disk — `npm run develop`
 * works immediately, no install or config needed. Set the six DO_SPACE_* vars
 * (see .env.example) on the live backend to flip to Spaces in prod.
 *
 * ENDPOINT TRAP — do NOT skip reading this:
 *   DO_SPACE_ENDPOINT must be the REGIONAL endpoint WITHOUT the bucket name:
 *     ✅ https://fra1.digitaloceanspaces.com
 *     ❌ https://my-bucket.fra1.digitaloceanspaces.com  (the "Origin Endpoint" in
 *        DO's panel has the bucket baked in — using it double-prefixes and
 *        breaks every upload)
 *
 * baseUrl points at the CDN host (not the origin) and stores files at the
 * bucket ROOT (no /uploads/ prefix), so next.config.ts must allow `pathname: "/**"`.
 */
const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
    const useSpaces = !!env("DO_SPACE_BUCKET");

    return {
        ...(useSpaces && {
            upload: {
                config: {
                    provider: "aws-s3",
                    providerOptions: {
                        baseUrl: env("DO_SPACE_CDN"),
                        s3Options: {
                            credentials: {
                                accessKeyId: env("DO_SPACE_ACCESS_KEY"),
                                secretAccessKey: env("DO_SPACE_SECRET_KEY"),
                            },
                            region: env("DO_SPACE_REGION"),
                            endpoint: env("DO_SPACE_ENDPOINT"),
                            params: {
                                ACL: "public-read",
                                Bucket: env("DO_SPACE_BUCKET"),
                            },
                        },
                    },
                    actionOptions: {
                        upload: {},
                        uploadStream: {},
                        delete: {},
                    },
                },
            },
        }),
    };
};

export default config;
