import qs from "qs";

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL ?? "http://localhost:1337";
const STRAPI_TOKEN = process.env.STRAPI_API_TOKEN;
const IS_DEV = process.env.NODE_ENV !== "production";

/** Build an absolute Strapi URL from a path like "/api/pages". */
export function getStrapiURL(path = ""): string {
    return `${STRAPI_URL}${path}`;
}

/** Standard Strapi 5 REST response shapes (flattened — no `attributes` wrapper). */
export interface StrapiResponse<T> {
    data: T;
    meta: {
        pagination?: { page: number; pageSize: number; pageCount: number; total: number };
    };
}

export interface StrapiError {
    status: number;
    name: string;
    message: string;
    details?: unknown;
}

type FetchOptions = {
    /**
     * Content type's Strapi `singularName` (from its schema.json) — the EXACT
     * string the revalidate webhook sends as `model` (e.g. "page", "global").
     * Emitted as the cache tag `strapi:<type>` so the webhook can target this
     * read. Must match EXACTLY: NOT the plural ("pages"), NOT the display name
     * ("Page"). Required on purpose — a forgotten tag would be a silent stale
     * (the webhook couldn't target the read), so omitting it is a build error,
     * not a runtime surprise. Use "none" only for a read that intentionally
     * needs no webhook targeting (it still gets the base `strapi` nuke-all tag).
     */
    type: string;
    /** Locale to request (e.g. "nl" | "en"). Maps to Strapi's ?locale= param. */
    locale?: string;
    /** Strapi populate param — string, array, or nested object (serialized via qs). */
    populate?: string | string[] | Record<string, unknown>;
    /** Strapi fields selection. */
    fields?: string[];
    /** Strapi filters object. */
    filters?: Record<string, unknown>;
    /** Strapi sort. */
    sort?: string | string[];
    /** Pagination. */
    pagination?: Record<string, number>;
    /**
     * Next.js cache lifetime in seconds for THIS fetch only.
     * Defaults to `false` — cache indefinitely and refresh ONLY via on-demand
     * revalidateTag from the webhook. Set a number for a single page that
     * genuinely needs a timer; never rely on a global timer, as steady
     * background refetches can hammer Strapi under load.
     */
    revalidate?: number | false;
    /**
     * Extra cache tags for finer-grained control (e.g. a per-slug tag), on top
     * of the automatic `strapi` + `strapi:<type>` tags.
     */
    tags?: string[];
};

/**
 * Derive cache tags for a Strapi read.
 * Always includes `strapi` (nuke-all). Adds `strapi:<type>` — the canonical
 * per-content-type tag whose string the webhook reproduces verbatim from the
 * payload's singular `model` (no pluralization anywhere, so it can't drift).
 * Merges any explicit tags. Deduped.
 *   type "page"   -> ["strapi", "strapi:page"]
 *   type "global" -> ["strapi", "strapi:global"]
 *   type "none"   -> ["strapi"]   (intentionally not webhook-targetable)
 */
function deriveStrapiTags(type: string, extra?: string[]): string[] {
    const tags = new Set<string>(["strapi"]);
    if (type && type !== "none") tags.add(`strapi:${type}`);
    for (const t of extra ?? []) tags.add(t);
    return [...tags];
}

/**
 * Typed Strapi REST fetcher.
 *
 * Usage (once you have a content type, e.g. an `Article` type):
 *   const res = await strapiFetch<Article[]>("/articles", {
 *     type: "article",            // = the schema.json singularName
 *     locale,
 *     populate: "*",
 *   });
 *   res.data // typed Article[]
 *
 * - `type` is REQUIRED — it's the canonical tag the webhook targets. See its
 *   docs above. Forgetting it won't compile.
 * - Builds query with qs (handles nested populate/filters correctly).
 * - Sends the API token if STRAPI_API_TOKEN is set.
 * - Caching is PURE on-demand: every read is cached indefinitely
 *   (revalidate: false) and tagged `strapi` + `strapi:<type>`, so the webhook's
 *   revalidateTag is the only refresh trigger. Pass { revalidate } for a
 *   per-fetch timer; pass { tags } for extra tags.
 * - Throws a typed error on non-OK responses.
 */
export async function strapiFetch<T>(path: string, options: FetchOptions): Promise<StrapiResponse<T>> {
    const { type, locale, populate, fields, filters, sort, pagination, revalidate, tags } = options;

    const query = qs.stringify({ locale, populate, fields, filters, sort, pagination }, { encodeValuesOnly: true, skipNulls: true });

    const url = getStrapiURL(`/api${path}${query ? `?${query}` : ""}`);

    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(STRAPI_TOKEN ? { Authorization: `Bearer ${STRAPI_TOKEN}` } : {}),
        },
        // Dev: bypass the data cache entirely so edits in Strapi show up on the
        // next reload, no webhook needed. Kills the split-brain bug where local
        // Next and deployed Next share one Strapi DB but only one of them
        // receives webhook revalidation — the other serves stale data forever
        // and Ctrl+F5 won't help (the cache is server-side, not browser-side).
        // Prod: unchanged — on-demand `revalidate: false` + tag-based webhook
        // invalidation is exactly what we want at scale.
        ...(IS_DEV
            ? { cache: "no-store" as RequestCache }
            : {
                  next: {
                      revalidate: revalidate ?? false,
                      tags: deriveStrapiTags(type, tags),
                  },
              }),
    });

    if (!res.ok) {
        let body: { error?: StrapiError } | null = null;
        try {
            body = await res.json();
        } catch {
            // non-JSON error body
        }
        const err = body?.error;
        throw new Error(`Strapi fetch failed (${res.status}) for ${path}: ${err?.message ?? res.statusText}`);
    }

    return res.json() as Promise<StrapiResponse<T>>;
}
