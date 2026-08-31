"use client";

import { useEffect } from "react";
import { gsap, InertiaPlugin } from "@/lib/gsap-config";
import { usePageTransition } from "@/components/transitions/PageTransition";
import { pointerTracker, radiusFalloff, prefersReducedMotion, isHoverPointer } from "@/lib/pointer-tracker";
import { applySplitIfNeeded } from "@/lib/split-text";

/**
 * Global pointer-motion provider — data-attribute driven, same mental model as
 * ScrollAnimationsProvider. Mount ONCE in the layout. Scans document.body for
 * the pointer-family attributes and wires each element to the shared
 * pointerTracker (one global pointermove + one gsap.ticker for the whole page).
 *
 * Re-arms on settledKey so elements added by a page transition are picked up,
 * exactly like the scroll provider.
 *
 * ── THE FOUR LEVERS ─────────────────────────────────────────────────────────
 *
 * data-pointer-parallax
 *   Element drifts (and optionally tilts) toward the GLOBAL eased cursor. Built
 *   for full-page / section background motion (the floating hero cards pattern).
 *   - data-parallax-depth   : drift strength, px-ish per viewport-half (default 0.1)
 *   - data-parallax-tilt    : max tilt in deg (default 0 = no tilt). e.g. "12"
 *   - data-parallax-channel : "fast" | "med" | "slow" easing weight (default "med")
 *   - data-parallax-radius  : activation radius in px (default 0 = global/viewport)
 *
 * data-magnetic
 *   Pulled TOWARD the cursor within radius, springs back when it leaves. The
 *   classic magnetic button. Per-unit auto-detects (same model as data-momentum):
 *   on an <svg> each <path> is pulled independently; on a data-split element each
 *   split unit is pulled; otherwise the element itself. data-magnetic-whole forces
 *   single-unit. (Writes x/y — see THE #2 LAW: don't also put a char-level reveal
 *   that writes x/y on the same split element; the per-unit pull owns the units' x/y.)
 *   - data-magnetic-strength : how far it travels toward the cursor, 0–1 (default 0.4)
 *   - data-magnetic-radius   : activation radius in px (default 120). 0 = global.
 *   - data-magnetic-whole    : force single-unit (don't split <svg>/text into units)
 *
 * data-tilt
 *   3D tilt based on where the cursor sits relative to the unit's center — the
 *   card-tilt / VanillaTilt feel. Per-unit auto-detects (same model as
 *   data-momentum): on an <svg> each <path> tilts independently; on a data-split
 *   element each split unit tilts; otherwise the element itself. data-tilt-whole
 *   forces single-unit. Each unit gets its own transformPerspective so the 3D reads
 *   without extra CSS. (Writes rotationX/Y only — safe alongside an x/y lever.)
 *   - data-tilt-max    : max tilt in deg (default 12)
 *   - data-tilt-radius : activation radius in px (default 0 = unit half-diagonal + margin)
 *   - data-tilt-whole  : force single-unit (don't split <svg>/text into units)
 *
 * data-momentum
 *   Throw-on-pass-through: sweep the cursor across the element and it's flung in
 *   the swipe direction (with a spin from the swipe angle), then glides back to
 *   rest via GSAP InertiaPlugin. Rides the shared pointerTracker (per-frame raw
 *   cursor + swept-segment rect-crossing), so it's overlay-proof — NOT
 *   pointerenter-driven. On an <svg> each <path> throws independently; on any
 *   other element the element itself throws.
 *   - data-momentum-strength   : throw force multiplier (default 3)
 *   - data-momentum-rotation   : spin multiplier (default 20; 0 = no spin)
 *   - data-momentum-resistance : glide-back resistance (default 200)
 *   - data-momentum-hit-inset  : trim fraction per edge of the hit-zone (default 0.15)
 *   - data-momentum-whole      : on an <svg>, force single-unit (throw whole logo)
 *
 * ── OVERLAY-PROOF ───────────────────────────────────────────────────────────
 * No per-element mouseenter/mouseleave anywhere. Everything is computed from the
 * global cursor + the element's own getBoundingClientRect() each frame, so an
 * overlay (heading/card) with pointer-events:none on top NEVER stops the motion.
 *
 * ── PERFORMANCE ─────────────────────────────────────────────────────────────
 * Uses gsap.quickSetter per element (no per-frame string alloc / style parse).
 * One shared ticker via pointerTracker. Unused = zero cost (no matching elements
 * → nothing subscribes → loop never starts).
 */

type Channel = "fast" | "med" | "slow";

function easedFor(channel: Channel): { x: number; y: number } {
    if (channel === "fast") return { x: pointerTracker.easeFastX, y: pointerTracker.easeFastY };
    if (channel === "slow") return { x: pointerTracker.easeSlowX, y: pointerTracker.easeSlowY };
    return { x: pointerTracker.easeX, y: pointerTracker.easeY };
}

export function PointerMotionProvider({ children }: { children: React.ReactNode }) {
    const { settledKey } = usePageTransition();

    useEffect(() => {
        if (settledKey === 0) return;
        if (prefersReducedMotion()) return;
        if (typeof window === "undefined") return;

        const hoverCapable = isHoverPointer();
        const shouldRun = (el: HTMLElement) => hoverCapable || el.hasAttribute("data-pointer-touch");

        // Every element this effect wired up, so we can clean its inline transform.
        const wired: HTMLElement[] = [];
        // Unsubscribe fns from the shared tracker.
        const unsubs: Array<() => void> = [];

        // ── data-pointer-parallax ────────────────────────────────────────────
        gsap.utils.toArray<HTMLElement>("[data-pointer-parallax]").forEach((el) => {
            if (!shouldRun(el)) return;
            wired.push(el);
            const depth = parseFloat(el.dataset.parallaxDepth || "0.1");
            const maxTilt = parseFloat(el.dataset.parallaxTilt || "0");
            const channel = (el.dataset.parallaxChannel as Channel) || "med";
            const radius = parseFloat(el.dataset.parallaxRadius || "0");

            const setX = gsap.quickSetter(el, "x", "px") as (v: number) => void;
            const setY = gsap.quickSetter(el, "y", "px") as (v: number) => void;
            const setRX = gsap.quickSetter(el, "rotationX", "deg") as (v: number) => void;
            const setRY = gsap.quickSetter(el, "rotationY", "deg") as (v: number) => void;

            // Current values for inertia smoothing.
            let cx = 0;
            let cy = 0;
            let crx = 0;
            let cry = 0;

            unsubs.push(
                pointerTracker.subscribe(() => {
                    const ww = window.innerWidth;
                    const wh = window.innerHeight;
                    const eased = easedFor(channel);

                    // Cursor offset from viewport center, normalised -1..1.
                    const nx = (eased.x - ww / 2) / (ww / 2);
                    const ny = (eased.y - wh / 2) / (wh / 2);

                    // Optional radius scoping (relative to element center).
                    let strength = 1;
                    if (radius > 0) {
                        const r = el.getBoundingClientRect();
                        const dx = eased.x - (r.left + r.width / 2);
                        const dy = eased.y - (r.top + r.height / 2);
                        strength = radiusFalloff(Math.hypot(dx, dy), radius);
                    }

                    const targetX = nx * (ww / 2) * depth * strength;
                    const targetY = ny * (wh / 2) * depth * strength;
                    const targetRX = -ny * maxTilt * strength;
                    const targetRY = nx * maxTilt * strength;

                    cx = targetX;
                    cy = targetY;
                    crx = targetRX;
                    cry = targetRY;

                    setX(cx);
                    setY(cy);
                    if (maxTilt) {
                        setRX(crx);
                        setRY(cry);
                    }
                })
            );
        });

        // ── Shared per-unit resolver (magnetic + tilt) ───────────────────────
        // One word auto-detects the throwable/reactive UNITS, same model as
        // data-momentum:
        //   <svg>  (no -whole)  → each <path> reacts on its own (origin pinned)
        //   data-split (no -whole) → each split unit reacts (reuses the cached
        //                            split; idempotent WeakMap so it never double-splits)
        //   anything else       → the element itself (unchanged behaviour)
        // `lever` is the attribute base ("magnetic" | "tilt") so we read the
        // right -whole escape hatch. Returns the element list to wire.
        const resolveUnits = (el: HTMLElement, lever: "magnetic" | "tilt" | "momentum"): HTMLElement[] => {
            const whole = el.hasAttribute(`data-${lever}-whole`);
            if (whole) return [el];
            if (el.tagName.toLowerCase() === "svg") {
                const paths = Array.from(el.querySelectorAll("path")) as unknown as HTMLElement[];
                paths.forEach((p) => gsap.set(p, { transformOrigin: "50% 50%" }));
                return paths.length > 0 ? paths : [el];
            }
            if (el.hasAttribute("data-split")) {
                const split = applySplitIfNeeded(el);
                if (split && split.target.length > 0) return split.target;
            }
            return [el];
        };

        // ── data-magnetic ────────────────────────────────────────────────────
        gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((el) => {
            if (!shouldRun(el)) return;
            const strengthAttr = parseFloat(el.dataset.magneticStrength || "0.4");
            const radius = parseFloat(el.dataset.magneticRadius || "120");
            const stiffness = 0.18;

            resolveUnits(el, "magnetic").forEach((unit) => {
                wired.push(unit);
                const setX = gsap.quickSetter(unit, "x", "px") as (v: number) => void;
                const setY = gsap.quickSetter(unit, "y", "px") as (v: number) => void;

                let cx = 0;
                let cy = 0;

                unsubs.push(
                    pointerTracker.subscribe(() => {
                        const r = unit.getBoundingClientRect();
                        const centerX = r.left + r.width / 2;
                        const centerY = r.top + r.height / 2;
                        // Magnetic uses the FAST channel so it feels responsive/sticky.
                        const px = pointerTracker.easeFastX;
                        const py = pointerTracker.easeFastY;
                        const dx = px - centerX;
                        const dy = py - centerY;
                        const dist = Math.hypot(dx, dy);
                        const falloff = radiusFalloff(dist, radius);

                        const targetX = dx * strengthAttr * falloff;
                        const targetY = dy * strengthAttr * falloff;

                        // Magnetic is always spring-eased (the snap-back IS the effect).
                        cx += (targetX - cx) * stiffness;
                        cy += (targetY - cy) * stiffness;
                        setX(cx);
                        setY(cy);
                    })
                );
            });
        });

        // ── data-tilt ──────────────────────────────────────────────────────────
        gsap.utils.toArray<HTMLElement>("[data-tilt]").forEach((el) => {
            if (!shouldRun(el)) return;
            const maxTilt = parseFloat(el.dataset.tiltMax || "12");
            const radius = parseFloat(el.dataset.tiltRadius || "0"); // 0 = element bounds + natural falloff

            resolveUnits(el, "tilt").forEach((unit) => {
                wired.push(unit);
                const setRX = gsap.quickSetter(unit, "rotationX", "deg") as (v: number) => void;
                const setRY = gsap.quickSetter(unit, "rotationY", "deg") as (v: number) => void;
                // Tilt needs a perspective on the unit for the 3D to read.
                gsap.set(unit, { transformPerspective: 800 });

                let crx = 0;
                let cry = 0;

                unsubs.push(
                    pointerTracker.subscribe(() => {
                        const r = unit.getBoundingClientRect();
                        const centerX = r.left + r.width / 2;
                        const centerY = r.top + r.height / 2;
                        const px = pointerTracker.easeFastX;
                        const py = pointerTracker.easeFastY;
                        const dx = px - centerX;
                        const dy = py - centerY;

                        // Effective radius: explicit data-tilt-radius, else the unit's
                        // own half-diagonal (so tilt is full across it, easing to
                        // zero just beyond its edges).
                        const effRadius = radius > 0 ? radius : Math.hypot(r.width, r.height) / 2;
                        const falloff = radiusFalloff(Math.hypot(dx, dy), effRadius);

                        // Normalise cursor offset across the unit half-extent.
                        const ratioX = gsap.utils.clamp(-1, 1, dx / (r.width / 2 || 1));
                        const ratioY = gsap.utils.clamp(-1, 1, dy / (r.height / 2 || 1));

                        const targetRX = -ratioY * maxTilt * falloff;
                        const targetRY = ratioX * maxTilt * falloff;

                        crx = targetRX;
                        cry = targetRY;
                        setRX(crx);
                        setRY(cry);
                    })
                );
            });
        });

        // ── data-momentum (throw-on-pass-through via InertiaPlugin) ──────────
        // Overlay-proof: driven by the shared pointerTracker, NOT pointerenter.
        // Each frame we read the global RAW cursor (pointerTracker.x/y — raw, not
        // eased, so the throw keeps its punch), compute frame-to-frame velocity,
        // and detect a "cross into the element's rect" from outside via per-frame
        // getBoundingClientRect() math. Because the trigger is global-cursor + rect
        // (never a per-element DOM hover event), an overlay with pointer-events:none
        // on top can no longer swallow the sweep. Same throw math as before.
        const momentumEls = gsap.utils.toArray<HTMLElement>("[data-momentum]").filter(shouldRun);
        if (momentumEls.length > 0) {
            const clampXY = gsap.utils.clamp(-1080, 1080);
            const clampRot = gsap.utils.clamp(-60, 60);

            // One shared raw-velocity sample off the tracker's per-frame tick.
            let prevCX = pointerTracker.x;
            let prevCY = pointerTracker.y;
            let velX = 0;
            let velY = 0;

            // Inset a rect toward its center by `inset` fraction per side (0.15 = trim
            // 15% off each edge). Tightens the hit-zone so kerned-tight letters whose
            // bounding boxes overlap their neighbours don't all trigger on one sweep.
            const insetRect = (r: DOMRect, inset: number) => {
                const ix = r.width * inset;
                const iy = r.height * inset;
                return { left: r.left + ix, right: r.right - ix, top: r.top + iy, bottom: r.bottom - iy };
            };
            type Box = { left: number; right: number; top: number; bottom: number };
            const pointInBox = (b: Box, x: number, y: number) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
            // Does the segment p0→p1 touch box b? Cheap + robust: endpoint-inside test
            // first (covers slow moves), then test the segment against each of the
            // box's four edges (covers a fast swipe that steps over a thin box between
            // frames — the missed-thin-letter case).
            const segHitsBox = (b: Box, x0: number, y0: number, x1: number, y1: number) => {
                if (pointInBox(b, x0, y0) || pointInBox(b, x1, y1)) return true;
                const segInt = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
                    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
                    if (d === 0) return false;
                    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
                    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
                    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
                };
                return (
                    segInt(x0, y0, x1, y1, b.left, b.top, b.right, b.top) ||
                    segInt(x0, y0, x1, y1, b.right, b.top, b.right, b.bottom) ||
                    segInt(x0, y0, x1, y1, b.right, b.bottom, b.left, b.bottom) ||
                    segInt(x0, y0, x1, y1, b.left, b.bottom, b.left, b.top)
                );
            };

            momentumEls.forEach((el) => {
                wired.push(el);
                const strength = parseFloat(el.dataset.momentumStrength || "3");
                const rotMult = parseFloat(el.dataset.momentumRotation || "20");
                const resistance = parseFloat(el.dataset.momentumResistance || "200");
                const hitInset = parseFloat(el.dataset.momentumHitInset || "0.15");

                // Resolve throwable UNITS via the shared resolver — one word,
                // data-momentum, auto-detects: <svg> → each <path>; data-split →
                // each split char/word/line; anything else → the element itself.
                // data-momentum-whole forces single-unit. (resolveUnits already pins
                // transform-origin to each SVG path's own center so spins pivot in place.)
                const units = resolveUnits(el, "momentum");

                units.forEach((unit) => {
                    // Per-UNIT swept-segment latch. We test the SEGMENT the cursor
                    // travelled this frame (lastX/Y → x/y) against the inset rect, so a
                    // fast swipe that steps over a thin letter between frames still
                    // registers. Latch fires only on the not-hit → hit transition.
                    let wasInside = false;
                    let lastX = pointerTracker.x;
                    let lastY = pointerTracker.y;
                    unsubs.push(
                        pointerTracker.subscribe(() => {
                            const x = pointerTracker.x;
                            const y = pointerTracker.y;
                            const r = unit.getBoundingClientRect();
                            const box = insetRect(r, hitInset);
                            const nowInside = segHitsBox(box, lastX, lastY, x, y);
                            lastX = x;
                            lastY = y;

                            if (nowInside && !wasInside) {
                                const offsetX = x - (r.left + r.width / 2);
                                const offsetY = y - (r.top + r.height / 2);
                                const rawTorque = offsetX * velY - offsetY * velX;
                                const leverDist = Math.hypot(offsetX, offsetY) || 1;
                                const angularForce = rawTorque / leverDist;
                                gsap.to(unit, {
                                    inertia: {
                                        x: { velocity: clampXY(velX * strength), end: 0 },
                                        y: { velocity: clampXY(velY * strength), end: 0 },
                                        ...(rotMult ? { rotation: { velocity: clampRot(angularForce * rotMult), end: 0 } } : {}),
                                        resistance,
                                    },
                                });
                            }
                            wasInside = nowInside;
                        })
                    );
                });
            });

            // Velocity sampler — runs once per frame off the same tracker tick,
            // AFTER the per-element subscribers have read the current velX/velY.
            // Registered last so its update lands for the NEXT frame's reads.
            unsubs.push(
                pointerTracker.subscribe(() => {
                    velX = pointerTracker.x - prevCX;
                    velY = pointerTracker.y - prevCY;
                    prevCX = pointerTracker.x;
                    prevCY = pointerTracker.y;
                })
            );
        }

        return () => {
            unsubs.forEach((off) => off());
            // Reset any inline transforms the levers wrote so a remount starts clean.
            wired.forEach((el) => gsap.set(el, { clearProps: "transform,x,y,rotation,rotationX,rotationY,transformPerspective" }));
        };
    }, [settledKey]);

    return <>{children}</>;
}
