// frontend/src/lib/split-text.ts
//
// Helper for the data-split lever. Uses GSAP 3.13's built-in `mask` option
// (the canonical pattern documented by GSAP, Osmo, and every authoritative
// SplitText source). We DON'T do any custom wrapping, height computation,
// FOUC guards, or custom CSS — GSAP handles all of that internally when
// `mask` is set.
//
// What this file does:
//   - Reads data-split + data-split-mask off an element.
//   - Calls SplitText.create with the right config (mask option when masked).
//   - Returns the split units + useMask flag so the provider can pick the
//     right animation path.
//   - Provides a cleanup helper that reverts SplitText instances on unmount.
//
// What this file does NOT do:
//   - Run animations. The provider does that.
//   - Apply any CSS — GSAP injects its own when mask is enabled.

import { gsap, SplitText } from "@/lib/gsap-config";

// Module-scoped cache so applySplitIfNeeded is idempotent — calling it twice
// on the same element returns the same result instead of re-splitting (which
// would create duplicate mask wrappers + break the animation). The cache is
// cleared by revertSplits, so unmount → next mount starts fresh.
const splitCache = new WeakMap<HTMLElement, SplitResult>();

// Reverse lookup so revertSplits can invalidate the cache entries for the
// instances being reverted. Without this, React Strict Mode (which mounts →
// cleans up → mounts again) leaves stale entries in splitCache pointing to
// detached DOM nodes. The next applySplitIfNeeded call gets the stale entry,
// the tween targets dead nodes, nothing animates, user sees full natural text.
const instanceToElement = new WeakMap<SplitText, HTMLElement>();

type SplitType = "chars" | "words" | "lines";

const VALID_TYPES: ReadonlyArray<SplitType> = ["chars", "words", "lines"];

// Sensible defaults so writing `data-split="lines"` without `data-stagger`
// still produces a recognisable cascade. Tuned by feel.
const DEFAULT_STAGGER_FOR_TYPE: Record<SplitType, number> = {
    chars: 0.015,
    words: 0.05,
    lines: 0.08,
};

export interface SplitResult {
    /** The split units to animate — instance.lines / .words / .chars. */
    target: HTMLElement[];
    /** The SplitText instance — caller stores this and calls .revert() on unmount. */
    instance: SplitText;
    /** True when data-split-mask="true". Tells the provider to use the
     *  canonical yPercent-based masked reveal instead of the data-* vocab. */
    useMask: boolean;
    /** Suggested stagger if data-stagger isn't explicitly set. */
    defaultStagger: number;
    /**
     * Set by the provider (runMaskedReveal). Called on EVERY (re)split — the
     * initial split AND every autoSplit re-fire (font load, resize) — with the
     * freshly-created units. The provider uses it to rebuild the reveal tween
     * against the live units, so autoSplit's re-flow can never orphan the tween
     * on detached divs (the lines-only "snaps visible / never animates" bug).
     */
    onResplit?: (units: HTMLElement[]) => void;
}

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readSplitType(el: HTMLElement): SplitType | null {
    const raw = el.dataset.split;
    if (!raw) return null;
    return (VALID_TYPES as ReadonlyArray<string>).includes(raw) ? (raw as SplitType) : null;
}

/**
 * Splits an element's text if it has `data-split`. Returns the split units
 * and the instance, or null if no split is needed (no attribute / invalid /
 * reduced motion / SplitText threw).
 *
 * When `data-split-mask="true"` is set, GSAP's built-in `mask` option wraps
 * each unit in an overflow-hidden container with the right display + sizing
 * for translate transforms to work correctly. Caller animates `yPercent`
 * (not `y`) on the returned target for the canonical masked rise.
 */
export function applySplitIfNeeded(el: HTMLElement): SplitResult | null {
    // Idempotency: if we've already split this element, return the cached result.
    // Prevents the FOUC pre-pass + the actual on-enter effect from double-splitting.
    const cached = splitCache.get(el);
    if (cached) return cached;

    const splitType = readSplitType(el);
    if (!splitType) return null;
    if (prefersReducedMotion()) return null;

    const useMask = el.dataset.splitMask === "true";

    const unitClass = `split-${splitType === "lines" ? "line" : splitType === "words" ? "word" : "char"}`;

    // Stable reference to the freshest units. SplitText's autoSplit can
    // re-split asynchronously (on font load, viewport resize, etc) which
    // creates NEW inner divs. Each re-split fires onSplit, and we MUST
    // re-apply both the class tag AND the masked start state to the new
    // units — otherwise we end up with stale references to detached divs
    // (the cached result.target stops matching the live DOM), and the
    // new live divs have no yPercent:100 → text visible until the tween
    // fires. This was the intermittent ~1/10 visible-text bug. The fix
    // is canonical GSAP: do post-split work inside onSplit, not after
    // SplitText.create returns.
    let currentTarget: HTMLElement[] = [];
    // Declared here so applyPostSplit (below) can notify the provider via
    // result.onResplit on every re-split. Assigned its full value lower down.
    let result: SplitResult | null = null;

    const applyPostSplit = (self: SplitText) => {
        const fresh = (splitType === "lines" ? self.lines : splitType === "words" ? self.words : self.chars) as HTMLElement[];
        fresh.forEach((u) => u.classList.add(unitClass));
        // NOTE: masked hidden state (yPercent:100) is intentionally NOT set here.
        // It is owned by the reveal tween's fromTo in the provider (runMaskedReveal),
        // so the hidden state and the tween that clears it are created + reverted as
        // one unit — a Strict Mode / remount revert can never strand a hidden unit
        // with no live tween (the bug this whole path fixes).
        // Replace the array contents in-place so any external reference
        // (like result.target held by the provider's tween-builder) sees
        // the new units without needing to be re-read.
        currentTarget.length = 0;
        currentTarget.push(...fresh);
        // Notify the provider so it rebuilds the masked reveal tween against the
        // fresh units. On the initial split, result is still null (the provider
        // hasn't registered yet) — the provider builds it once after applySplitIfNeeded
        // returns. On every LATER re-split (autoSplit font/resize), result is set and
        // this rebuilds the tween, preventing the orphaned-tween lines bug.
        result?.onResplit?.(fresh);
    };

    let instance: SplitText;
    try {
        instance = SplitText.create(el, {
            type: splitType === "chars" ? "words,chars" : splitType,
            ...(useMask && { mask: splitType }),
            autoSplit: splitType === "lines",
            // onSplit fires on the initial split AND on every autoSplit
            // re-fire (font load, resize). Doing the class tag + gsap.set
            // here (instead of after SplitText.create returns) guarantees
            // the masked start state survives autoSplit's async re-fires.
            onSplit: applyPostSplit,
        });
    } catch (err) {
        // SplitText can throw on exotic HTML inside the element.
        // eslint-disable-next-line no-console
        console.error("❌ [applySplitIfNeeded] SplitText.create failed:", err);
        return null;
    }

    // onSplit fires synchronously during SplitText.create, so currentTarget
    // is populated by now. Defensive fallback in case it didn't fire (some
    // SplitText edge cases with empty text).
    if (currentTarget.length === 0) {
        const fresh = (splitType === "lines" ? instance.lines : splitType === "words" ? instance.words : instance.chars) as HTMLElement[];
        fresh.forEach((u) => u.classList.add(unitClass));
        currentTarget = fresh;
    }

    result = {
        target: currentTarget,
        instance,
        useMask,
        defaultStagger: DEFAULT_STAGGER_FOR_TYPE[splitType],
    };
    splitCache.set(el, result);
    instanceToElement.set(instance, el);

    return result;
}

/**
 * Revert helper for callers. Tolerates already-reverted instances.
 *
 *   const splits: SplitText[] = [];
 *   items.forEach(el => {
 *     const split = applySplitIfNeeded(el);
 *     if (split) splits.push(split.instance);
 *   });
 *   return () => revertSplits(splits);
 */
export function revertSplits(instances: SplitText[]): void {
    instances.forEach((instance) => {
        // Clear cache entry FIRST (using the reverse lookup), so even if
        // .revert() throws below, the cache is consistent. Next call to
        // applySplitIfNeeded on this element will freshly split.
        const el = instanceToElement.get(instance);
        if (el) splitCache.delete(el);
        instanceToElement.delete(instance);
        try {
            instance.revert();
        } catch {
            // Already reverted, or DOM torn down — both fine to ignore.
        }
    });
}

export { gsap };
