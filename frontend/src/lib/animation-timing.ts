import { isFirstDocumentLoad } from "@/lib/first-document-load";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FIRST-LOAD ANIMATION TIMING — what this file does, in plain terms
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE PROBLEM
 * On a hard refresh, the preloader plays for a beat before the page is visible.
 * You don't want your hero animating UNDERNEATH the preloader — you want it to
 * wait until the preloader clears, then reveal. But on an in-app navigation
 * (clicking a link), there's NO preloader, so the same hero should reveal
 * quickly. Same element, two situations, two different delays.
 *
 * THE SOLUTION — two attributes, picked automatically
 * Put BOTH delays on the element:
 *
 *     data-delay="0.4"            ← used on in-app navigation (quick)
 *     data-first-load-delay="2.5" ← used ONLY on the very first document load
 *                                   (hard refresh / direct visit), to wait out
 *                                   the preloader. Falls back to data-delay if
 *                                   omitted.
 *
 * resolveAnimationDelayFromElement() below reads isFirstDocumentLoad() and picks
 * the right one. You don't branch anything yourself — you just set both numbers.
 *
 * SEE IT YOURSELF (30-second test)
 * 1. Add to any animated element on the home page:
 *      data-scroll-animate data-opacity="0" data-translate-y="30px"
 *      data-delay="0.4" data-first-load-delay="3"
 * 2. HARD REFRESH the page → the element waits ~3s, then fades up.
 *    (first-load delay — it's waiting out the preloader)
 * 3. Click into another page, then click back → the element reveals in ~0.4s.
 *    (in-app delay — no preloader to wait for)
 * That visible difference IS the system working.
 *
 * HOW THE "first load" FLAG WORKS (the magic bit)
 * isFirstDocumentLoad() (in first-document-load.ts) starts true and flips to
 * false ONCE, after the first page-enter settles (PageTransition calls
 * markInitialEnterComplete()). It's module-scoped, so:
 *   - it SURVIVES soft navigations and EN⇄NL locale switches (same JS instance)
 *   - it RESETS on a genuine document reload (fresh JS evaluation)
 * So "first load" means exactly "the first paint of this browser document",
 * which is precisely when the preloader runs. After that, everything is "in-app".
 *
 * WORKS FOR ANY TIMED ATTRIBUTE, not just delay
 * resolveAnimationTimeFromElement(el, "duration") would read data-duration vs
 * data-first-load-duration the same way. delay is just the common case, wrapped
 * below as resolveAnimationDelayFromElement().
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Parse GSAP-friendly delay/duration values ("1.2", "1.2s", "400ms"). */
export function parseAnimationTime(value: string | undefined): number | undefined {
    if (value === undefined || value === "") return undefined;

    const trimmed = value.trim();
    if (trimmed.endsWith("ms")) {
        return parseFloat(trimmed) / 1000;
    }
    if (trimmed.endsWith("s")) {
        return parseFloat(trimmed);
    }
    return parseFloat(trimmed);
}

function toDatasetKey(kebab: string): string {
    return kebab.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * First-load attr wins on initial document load; otherwise the standard attr.
 * e.g. baseAttr "delay" → checks data-first-load-delay (if first load) then
 * data-delay. Returns `fallback` when neither attribute is present.
 */
export function resolveAnimationTimeFromElement(el: HTMLElement, baseAttr: string, fallback?: number): number | undefined {
    const key = toDatasetKey(baseAttr);
    const firstLoadKey = toDatasetKey(`first-load-${baseAttr}`);

    const isFirst = isFirstDocumentLoad();
    const firstLoadValue = el.dataset[firstLoadKey];
    const standardValue = el.dataset[key];

    if (isFirst && firstLoadValue !== undefined) {
        return parseAnimationTime(firstLoadValue);
    }
    if (standardValue !== undefined) {
        return parseAnimationTime(standardValue);
    }
    return fallback;
}

/** Convenience: resolve the delay (data-first-load-delay vs data-delay). */
export function resolveAnimationDelayFromElement(el: HTMLElement): number | undefined {
    return resolveAnimationTimeFromElement(el, "delay");
}
