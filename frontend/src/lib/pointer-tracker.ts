// frontend/src/lib/pointer-tracker.ts
//
// Shared eased-pointer core for ALL pointer-driven levers (data-pointer-parallax,
// data-magnetic, data-tilt). ONE global `pointermove` listener + ONE gsap.ticker,
// ref-counted: the loop only runs while at least one lever is subscribed, and
// stops cleanly when the last one releases. This is the performance contract —
// N parallax cards = ONE frame loop broadcasting to N subscribers, never N loops.
//
// ── WHY GLOBAL POINTER, NOT per-element mouseenter/mouseleave ───────────────
// Per-element hover events break the moment something sits ON TOP of a magnetic
// or parallax element — a heading, an overlay, a card. Even with
// `pointer-events: none` on the overlay, mouseenter/mouseleave on the element
// underneath stop firing reliably. So this tracker NEVER uses per-element hover
// events. It reads ONE global cursor position from `window` (which fires no
// matter what's stacked above), and each lever computes its OWN distance-to-
// element math every frame. Result: motion keeps tracking under overlays, under
// pointer-events:none, whether the trigger is a full-page section or a 40px
// button. The element measures its distance from a global truth; nothing in the
// DOM above it can intercept that.
//
// ── EASING ──────────────────────────────────────────────────────────────────
// Three eased channels at different rates (fast / medium / slow), so a single
// pointer can drive layered motion at different "weights" (e.g. parallax depth).
// Ported from the project's proven FragmentsPerspectiveMouse.

import { gsap } from "@/lib/gsap-config";

export type PointerFrameListener = () => void;

class PointerTracker {
    /** Raw cursor (viewport coords). */
    x = 0;
    y = 0;
    /** Eased channels — fast (/6), medium (/10), slow (/20). */
    easeFastX = 0;
    easeFastY = 0;
    easeX = 0;
    easeY = 0;
    easeSlowX = 0;
    easeSlowY = 0;

    private isFirst = true;
    private refCount = 0;
    private readonly listeners = new Set<PointerFrameListener>();

    private readonly boundTick = () => this.tick();
    private readonly boundPointer = (e: PointerEvent) => this.onPointer(e);

    /**
     * Subscribe a per-frame listener and ensure the shared loop is running.
     * Returns an unsubscribe fn that also releases the loop if it was the last
     * listener. Safe to call repeatedly; SSR no-ops.
     */
    subscribe(listener: PointerFrameListener): () => void {
        if (typeof window === "undefined") return () => {};
        this.listeners.add(listener);
        this.acquire();
        return () => {
            this.listeners.delete(listener);
            this.release();
        };
    }

    private acquire() {
        this.refCount += 1;
        if (this.refCount !== 1) return;
        // First subscriber: center the pointer + prime all eased channels so
        // there's no jump from 0,0 on first frame.
        this.x = window.innerWidth / 2;
        this.y = window.innerHeight / 2;
        this.easeFastX = this.easeX = this.easeSlowX = this.x;
        this.easeFastY = this.easeY = this.easeSlowY = this.y;
        this.isFirst = true;
        window.addEventListener("pointermove", this.boundPointer, { passive: true });
        gsap.ticker.add(this.boundTick);
    }

    private release() {
        this.refCount = Math.max(0, this.refCount - 1);
        if (this.refCount !== 0) return;
        window.removeEventListener("pointermove", this.boundPointer);
        gsap.ticker.remove(this.boundTick);
        this.isFirst = true;
    }

    private onPointer(e: PointerEvent) {
        this.x = e.clientX;
        this.y = e.clientY;
        this.isFirst = false;
    }

    private tick() {
        // Ease each channel toward the raw cursor at its own rate.
        this.easeFastX += (this.x - this.easeFastX) / 6;
        this.easeFastY += (this.y - this.easeFastY) / 6;
        this.easeX += (this.x - this.easeX) / 10;
        this.easeY += (this.y - this.easeY) / 10;
        this.easeSlowX += (this.x - this.easeSlowX) / 20;
        this.easeSlowY += (this.y - this.easeSlowY) / 20;
        // Broadcast one frame to every subscriber. Each lever reads whatever
        // eased channel it wants + does its own per-element math.
        this.listeners.forEach((fn) => fn());
    }
}

export const pointerTracker = new PointerTracker();

/**
 * Smooth radius falloff: 1 at the element center, easing to 0 at `radius`,
 * clamped to 0 beyond. Uses smoothstep (ease-in-out) for the premium organic
 * feel — never a hard binary cutoff. `radius <= 0` is treated as "global"
 * (always full strength, for full-viewport section parallax).
 */
export function radiusFalloff(distance: number, radius: number): number {
    if (radius <= 0) return 1; // global / viewport-wide trigger
    if (distance >= radius) return 0;
    const t = 1 - distance / radius; // 1 at center → 0 at edge
    return t * t * (3 - 2 * t); // smoothstep
}

export function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True only on devices with a real hover-capable, fine pointer (mouse /
 * trackpad). False on touch — regardless of screen size, because a touch laptop
 * has no hover even at 1400px. This is the correct gate for pointer-follow
 * motion: it keys off INPUT CAPABILITY, not viewport width. Levers default to
 * off when this is false; a per-element `data-pointer-touch` can override.
 */
export function isHoverPointer(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
