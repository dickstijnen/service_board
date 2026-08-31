import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Strapi → Next on-demand revalidation webhook.
 *
 * This app is a client-rendered dashboard (no locale-routed marketing pages),
 * so revalidation is purely TAG-BASED: every SSR read in `src/lib/strapi.ts`
 * tags itself `strapi` + `strapi:<type>` (type = the content type's Strapi
 * singularName, the same string this webhook receives as `model`). Invalidating
 * `strapi:<model>` regenerates every route that read that type on next visit.
 *
 * Manual nuke-all (missed-webhook recovery):
 *   POST /api/revalidate?scope=all     (with the `secret` header)
 */

const SUPPORTED_EVENTS = new Set([
    "entry.create",
    "entry.update",
    "entry.delete",
    "entry.publish",
    "entry.unpublish",
]);

type WebhookPayload = {
    event?: string;
    model?: string;
    entry?: { slug?: string; locale?: string };
};

/** `api::opdracht.opdracht` → `opdracht`; `_`→`-`; lowercased. Accepts a short name OR a UID. */
function normalizeModel(model: string | undefined): string {
    const raw = (model ?? "").trim().toLowerCase().replace(/_/g, "-");
    const uid = raw.match(/^api::[a-z0-9-]+\.([a-z0-9-]+)$/);
    return uid ? uid[1] : raw;
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const secret = request.headers.get("secret");
        if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
            return NextResponse.json({ revalidated: false, error: "Invalid secret token" }, { status: 401 });
        }

        // Manual nuke-all escape hatch — clears the entire Strapi data cache.
        if (request.nextUrl.searchParams.get("scope") === "all") {
            revalidateTag("strapi", { expire: 0 });
            revalidatePath("/", "layout");
            return NextResponse.json({ revalidated: true, scope: "all", durationMs: Date.now() - startTime });
        }

        const payload = (await request.json()) as WebhookPayload;
        const event = payload?.event;

        if (!event || !SUPPORTED_EVENTS.has(event)) {
            return NextResponse.json({ revalidated: false, error: "Unsupported or missing event" }, { status: 400 });
        }

        const model = normalizeModel(payload?.model);
        if (!model) {
            // Anomaly — can't form a per-type tag. Fall back to the base tag.
            revalidateTag("strapi", { expire: 0 });
            return NextResponse.json({ revalidated: true, scope: "sitewide", event, durationMs: Date.now() - startTime });
        }

        // Invalidate this type's canonical tag. The webhook's singular `model`
        // reproduces the exact `strapi:<type>` string the fetch emitted.
        const tag = `strapi:${model}`;
        revalidateTag(tag, { expire: 0 });

        return NextResponse.json({
            revalidated: true,
            scope: "tag",
            tags: ["strapi", tag],
            event,
            model,
            durationMs: Date.now() - startTime,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ revalidated: false, error: message }, { status: 500 });
    }
}
