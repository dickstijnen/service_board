"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { gsap } from "@/lib/gsap-config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSliderContext } from "./use-slider";

/**
 * SliderNav — prev/next arrows + a continuous progress bar.
 *
 * Reads everything from context — NO props passed down, NO refs handed to the engine.
 * That's why the classic "external nav ref is null when the carousel initialises" bug
 * (the one in the old Swiper TeamSlider + the Flickity 500ms-setTimeout wiring) cannot
 * happen here: the buttons just call context callbacks that no-op until the api is ready.
 *
 * The progress bar is Embla's `scrollProgress` (0 → 1) — a smooth CONTINUOUS fill that
 * tracks the drag in real time, not a per-slide stepped bar.
 *
 * Compose the pieces however the design needs (this renders the line+arrows row used by
 * the TeamSlider pattern: progress bar on the left, arrows on the right). Use the named
 * sub-parts directly if you want a different arrangement.
 */

export function SliderProgress({ className, continuous = false }: { className?: string; continuous?: boolean }) {
    const { selectedIndex, slideCount, api } = useSliderContext();
    const fillRef = useRef<HTMLDivElement | null>(null);

    // CONTINUOUS mode: subscribe LOCALLY to api.on("scroll") and write the fill width
    // straight to the ref. NO React state per frame (§3d) — the provider deliberately
    // does NOT broadcast a continuous scrollProgress; consumers that genuinely need it
    // wire their own local subscription, as we do here. Used by dragFree sliders where
    // the bar must follow the finger in real time, not step on slide-change. CSS
    // transition is intentionally absent in this branch — it would lag the drag.
    useEffect(() => {
        if (!continuous || !api) return;
        const fill = fillRef.current;
        if (!fill) return;
        const tween = () => {
            fill.style.width = `${api.scrollProgress() * 100}%`;
        };
        tween();
        api.on("scroll", tween);
        api.on("reInit", tween);
        return () => {
            api.off("scroll", tween);
            api.off("reInit", tween);
        };
    }, [continuous, api]);

    if (continuous) {
        return (
            <div className={cn("relative h-px w-full overflow-hidden bg-white/15", className)}>
                <div ref={fillRef} className="absolute inset-y-0 left-0 bg-white" style={{ width: "0%" }} />
            </div>
        );
    }

    // STEP-BASED fill (default, not raw scrollProgress). Width animates via CSS
    // transition, so every advance glides the fill to the next step AND the loop wrap
    // (last→first) smoothly RETRACTS to step 1 instead of snapping 100%→0 in a single
    // frame (the jump-cut that read as "the line just disappears"). Deliberate,
    // two-sided motion on every change — including the wrap. (THE BENOIST LENS:
    // nothing teleports.)
    const pct = slideCount > 0 ? ((selectedIndex + 1) / slideCount) * 100 : 0;
    return (
        <div className={cn("relative h-px w-full overflow-hidden bg-white/15", className)}>
            <div
                className="absolute inset-y-0 left-0 bg-white transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

/**
 * SliderProgressRing — an SVG ring whose stroke-dashoffset fills step-by-step as the
 * slide advances. The circular twin of SliderProgress.
 *
 * STEP-BASED ((index+1)/count), not raw scrollProgress — a discrete "how far through"
 * dial. Where the linear bar leans on a CSS width-transition, the ring tweens its
 * dashoffset with GSAP so the fill GLIDES between steps and — critically — the loop
 * wrap (last→first) RETRACTS smoothly back to step 1 instead of snapping full→empty
 * in one frame. We tween a private progress proxy (0 → 1) and write the dashoffset
 * each tick; GSAP interpolates the scalar, so wrap is just "animate back to 1/count"
 * — the shortest visual path, nothing teleports. (THE BENOIST LENS.)
 *
 * It's JUST the ring — no number baked in. Pair it with <SliderCounter> when you want
 * the rolling digit, or use it alone as a pure dial. Sizing is prop-driven so it
 * composes into any nav row (default 32px / 1px = matches the icon arrow buttons).
 */
export function SliderProgressRing({
    className,
    size = 32,
    stroke = 1,
}: {
    className?: string;
    size?: number;
    stroke?: number;
}) {
    const { selectedIndex, slideCount } = useSliderContext();

    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;

    const circleRef = useRef<SVGCircleElement | null>(null);
    // The animated progress scalar (0 → 1). Kept in a ref so the tween mutates it
    // across renders without re-rendering, and so we always tween FROM the current
    // visual value (mid-flight interrupts stack/continue, never restart from a step).
    const progress = useRef(0);

    const target = slideCount > 0 ? (selectedIndex + 1) / slideCount : 0;

    useEffect(() => {
        const circle = circleRef.current;
        if (!circle) return;

        const tween = gsap.to(progress, {
            current: target,
            duration: 0.5,
            ease: "power3.out",
            overwrite: "auto",
            onUpdate: () => {
                circle.style.strokeDashoffset = String(circumference * (1 - progress.current));
            },
        });
        return () => {
            tween.kill();
        };
    }, [target, circumference]);

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={cn("-rotate-90", className)}
            aria-hidden="true"
        >
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={stroke}
                className="stroke-white/15"
            />
            <circle
                ref={circleRef}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                className="stroke-white"
                style={{
                    strokeDasharray: circumference,
                    strokeDashoffset: circumference,
                }}
            />
        </svg>
    );
}

/**
 * SliderCounter — an iOS-style rolling digit reel: the active slide number rolls
 * vertically into place, neighbours fading off, with a static `/ 04` beside it.
 *
 * ARCHITECTURE (Embla = engine, our own motion = visuals — same split as the rest of
 * the slider system): the PARENT Embla owns the index; this is a READ-ONLY indicator
 * that reflects it. We do NOT mount a second nested Embla — a carousel engine is the
 * wrong tool for mirroring state the parent already owns (extra measurement lifecycle,
 * a sync loop, and the canLoop measurement race). Instead this is a true ODOMETER: a
 * continuous position advances by the MINIMAL signed step on the ring each change (so
 * a single slide is always ±1, incl. the 0N→01 seam, rolling the way the slider
 * moved), and a FIXED pool of rows has its NUMBERS derived from that position each
 * frame while the strip is translated only by the fractional part. Rows are recycled,
 * numbers are computed — infinite by construction, NO copies, NO drift, however fast
 * you mash. For a NON-looping parent the step is the plain index difference (never
 * wraps) and out-of-range rows render blank (no phantom number before 01 / after 0N).
 * (THE BENOIST LENS: nothing teleports.)
 *
 * THE FADE: a CSS gradient mask on the window dissolves the top + bottom edges (the
 * iOS-picker feel); on top of that each row's opacity falls off on a squared curve and
 * scales down with distance from centre, so the active number is the clear hero and
 * neighbours recede — the picker depth cue, done flat (no 3D).
 *
 * `visible` = rows shown (odd, default 3). `itemHeight` sizes each row. Standalone +
 * composable: no arrows/line baked in.
 */
export function SliderCounter({
    className,
    itemHeight = 20,
    visible = 3,
}: {
    className?: string;
    itemHeight?: number;
    visible?: number;
}) {
    const { selectedIndex, slideCount, loop } = useSliderContext();

    const stripRef = useRef<HTMLDivElement | null>(null);
    const rowRefs = useRef<HTMLDivElement[]>([]);
    // Continuous VISUAL position in slide-units (fractional mid-roll) — what the eye
    // sees. Tweened toward `target`. Integer part = centred number, fraction = offset.
    const pos = useRef(-1);
    // The COMMITTED target in slide-units (always integer). This is the source of
    // truth, advanced by the real signed step at each `select` — never re-derived from
    // the in-flight `pos` (which is mid-tween and would mis-read the base). Decoupling
    // "where we're going" from "where we visually are" is what kills the roll-back /
    // hitch: a fast click extends `target` and the tween simply re-aims, continuous.
    const target = useRef(0);
    // Last committed slide INDEX (0..count-1) — to compute the per-change delta.
    const lastIndex = useRef(-1);
    const tweenRef = useRef<gsap.core.Tween | null>(null);

    const count = Math.max(slideCount, 1);
    const human = (n: number) => String(n).padStart(2, "0");

    // PAD rows of buffer above + below the centre line, enough that a row is always
    // present as it scrolls in. Rows are a FIXED pool, recycled — their NUMBERS are
    // derived from `pos` each frame (the odometer), never from their DOM order.
    const PAD = Math.floor(visible / 2) + 1;
    const rowCount = PAD * 2 + 1;

    // Paint the reel for a continuous position: derive each row's number from `pos`,
    // translate the strip by only the fractional part, dim by distance from centre.
    const render = (p: number) => {
        const strip = stripRef.current;
        if (!strip) return;
        const base = Math.round(p); // slide-unit nearest the centre line
        const frac = p - base; // -0.5..0.5 sub-row offset mid-roll
        strip.style.transform = `translateY(${-frac * itemHeight}px)`;
        rowRefs.current.forEach((row, i) => {
            if (!row) return;
            const offset = i - PAD; // row position relative to centre (-PAD..+PAD)
            const slideUnit = base + offset; // slide-unit this row represents now
            const dist = Math.abs(offset - frac); // distance from the exact centre line
            // Steeper falloff than a linear dim: opacity uses a squared curve so the
            // centre number is the clear hero and neighbours recede fast; rows also
            // SCALE DOWN with distance so off-centre numbers shrink (the iOS-picker
            // depth cue) without any 3D. Both are visual only — no effect on the roll.
            const t = gsap.utils.clamp(0, 1, dist); // 0 at centre → 1 one row away
            row.style.opacity = String(gsap.utils.clamp(0.18, 1, 1 - t * t * 0.9));
            row.style.transform = `scale(${gsap.utils.clamp(0.7, 1, 1 - dist * 0.22)})`;
            if (loop) {
                const idx = ((slideUnit % count) + count) % count;
                row.textContent = human(idx + 1);
            } else {
                // no wrap: out-of-range rows render blank (no phantom number)
                row.textContent = slideUnit >= 0 && slideUnit < count ? human(slideUnit + 1) : "";
            }
        });
    };

    useEffect(() => {
        if (!stripRef.current || count <= 1) return;

        // First mount: seat on the active index, no animation.
        if (lastIndex.current < 0) {
            pos.current = selectedIndex;
            target.current = selectedIndex;
            lastIndex.current = selectedIndex;
            render(pos.current);
            return;
        }

        if (selectedIndex === lastIndex.current) return;

        // Signed step from the PREVIOUS committed index to the new one. LOOP: take the
        // MINIMAL-ring delta in (-count/2 .. +count/2] — this is exactly ±1 for any
        // single-slide move INCLUDING the 0↔N-1 seam (e.g. 3→0 = +1, 0→3 = -1), so the
        // reel rolls one number the way the slider went. NON-LOOP: plain difference.
        // (We deliberately do NOT consult Embla's scrollBody.direction here: the minimal
        // delta already disambiguates single steps, and arrow nav never jumps more than
        // half the ring — mixing in direction only re-introduced sign bugs.)
        let delta = selectedIndex - lastIndex.current;
        if (loop) {
            if (delta > count / 2) delta -= count;
            if (delta < -count / 2) delta += count;
        }

        target.current += delta;
        lastIndex.current = selectedIndex;

        tweenRef.current?.kill();
        const proxy = { p: pos.current };
        tweenRef.current = gsap.to(proxy, {
            p: target.current,
            duration: 0.55,
            ease: "power3.out",
            overwrite: "auto",
            onUpdate: () => {
                pos.current = proxy.p;
                render(proxy.p);
            },
            onComplete: () => {
                // LOOP only: re-base BOTH visual + target by whole cycles toward 0 so the
                // numbers never grow unbounded. render() derives numbers mod count, so
                // subtracting an identical multiple of `count` from both is invisible.
                // NON-LOOP must NOT re-base — target is already bounded 0..count-1 and a
                // re-base would push it out of range (the last-slide prev break).
                if (!loop) return;
                const cycles = Math.round(target.current / count) * count;
                if (cycles !== 0) {
                    target.current -= cycles;
                    pos.current -= cycles;
                    render(pos.current);
                }
            },
        });
        return () => {
            tweenRef.current?.kill();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIndex, count, loop, itemHeight, visible]);

    rowRefs.current = [];

    return (
        <div className={cn("flex items-center gap-2 font-mono text-sm tabular-nums leading-none text-white", className)}>
            {/* window: `visible` rows tall, clips the rest. A top+bottom gradient MASK
                fades the edge rows softly into nothing — the iOS-picker edge feel. */}
            <div
                className="relative overflow-hidden"
                style={{
                    height: itemHeight * visible,
                    WebkitMaskImage:
                        "linear-gradient(to bottom, transparent 0%, #000 35%, #000 65%, transparent 100%)",
                    maskImage:
                        "linear-gradient(to bottom, transparent 0%, #000 35%, #000 65%, transparent 100%)",
                }}
                aria-hidden="true"
            >
                {/* FIXED pool of rows; numbers are derived from `pos` each frame.
                    marginTop pulls the centre row (index PAD) onto the centre line. */}
                <div
                    ref={stripRef}
                    className="will-change-transform"
                    style={{ marginTop: -itemHeight }}
                >
                    {Array.from({ length: rowCount }, (_, i) => (
                        <div
                            key={i}
                            ref={(el) => {
                                if (el) rowRefs.current[i] = el;
                            }}
                            className="flex items-center justify-center"
                            style={{ height: itemHeight }}
                        />
                    ))}
                </div>
            </div>
            <span className="text-white/30">/</span>
            <span className="text-white/30">{human(slideCount)}</span>
        </div>
    );
}

export function SliderPrev({ className }: { className?: string }) {
    const { scrollPrev, canPrev } = useSliderContext();
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={scrollPrev}
            disabled={!canPrev}
            aria-label="Previous slide"
            className={cn("rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white", className)}
        >
            <ArrowLeft className="size-4" />
        </Button>
    );
}
export function SliderNext({ className }: { className?: string }) {
    const { scrollNext, canNext } = useSliderContext();
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={scrollNext}
            disabled={!canNext}
            aria-label="Next slide"
            className={cn("rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white", className)}
        >
            <ArrowRight className="size-4" />
        </Button>
    );
}

export function SliderNav({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center gap-6", className)}>
            <SliderProgress className="flex-1" />
            <div className="flex shrink-0 items-center gap-3">
                <SliderPrev />
                <SliderNext />
            </div>
        </div>
    );
}
