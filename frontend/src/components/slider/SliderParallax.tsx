"use client";

import { useEffect } from "react";
import { useSliderContext } from "./use-slider";

/**
 * SliderParallax — the canonical Embla parallax tween, made drop-in.
 *
 * Drop it ANYWHERE inside a <SliderProvider> (renders nothing). It subscribes
 * to Embla's `scroll` / `slidesInView` / `reInit` events, and for each slide it
 * computes how far that slide's snap point is from the current scroll progress,
 * then writes a `translateX(%)` transform STRAIGHT TO THE DOM of that slide's
 * [data-parallax-layer] child — so as the carousel scrolls, the image inside each
 * slide "lags" behind the slide itself. That speed difference is the parallax.
 *
 * NO React state, NO setState per frame — pure ref/style writes. This is the
 * §3d law: continuous per-frame motion bypasses React's render cycle. The same
 * approach as ScrollAnimationsProvider, the pointer-tracker, and the rAF rail
 * develop in VerticalPickerSlider.
 *
 * -- AUTHOR API (paired with the slide-markup convention below) --------------
 *   - Drop <SliderParallax factor={0.2} /> inside a <SliderProvider>.
 *   - On EACH slide put ONE child with `data-parallax-layer`. That element is
 *     what gets translated; put the image inside it (the image must be WIDER
 *     than the layer so translating doesn't expose empty edges — recipe below).
 *   - `factor` controls the lag strength. The actual translate is
 *     `factor * scrollSnapCount * diffToTarget * 100%`, so factor scales with
 *     slide count automatically (matches the canonical Embla example). Sane
 *     range: 0.15 (subtle) → 0.35 (strong). Default 0.2.
 *
 * THE LAYER MARKUP RECIPE (do this inside each slide):
 *   <article className="relative ... overflow-hidden basis-[80%]">
 *     <div data-parallax-layer className="absolute inset-0">
 *       <img className="block h-full w-[130%] -translate-x-[15%] object-cover" />
 *     </div>
 *     ...overlay/text on top...
 *   </article>
 * The image is 130% wide and pre-offset by -15% so it's centred when the layer
 * is at translate 0%. The layer can then translate ±15% within the slide before
 * any edge would show.
 *
 * One <SliderParallax /> per slider. Multiple parallax layers per slide are NOT
 * supported (only the FIRST [data-parallax-layer] in each slide is tweened).
 *
 * NOTE: uses `api.internalEngine()` for loop-aware diff correction (the wrap
 * around the loop seam needs the engine's loopPoints). `internalEngine` is the
 * documented escape hatch for this exact use case — it's how Embla's own
 * canonical parallax example does it.
 */
export function SliderParallax({ factor = 0.2 }: { factor?: number } = {}) {
    const { api, viewportEl } = useSliderContext();

    useEffect(() => {
        if (!api || !viewportEl) return;

        // Match parallax layers to slides BY THEIR PARENT SLIDE — not by DOM order,
        // because a slide can contain other unrelated content. We walk the slides
        // Embla owns (api.slideNodes()) and pick the first [data-parallax-layer]
        // INSIDE each one. nodes[i] === layer for slide i, always.
        const slides = api.slideNodes();
        const nodes: (HTMLElement | null)[] = slides.map(
            (slide) => slide.querySelector<HTMLElement>("[data-parallax-layer]")
        );
        if (nodes.every((n) => !n)) return;

        // factor scales with slide count so the per-snap travel feels consistent
        // whether the slider has 3 slides or 12. (Canonical Embla pattern.)
        const tweenFactor = factor * api.scrollSnapList().length;

        const tween = () => {
            const engine = api.internalEngine();
            const scrollProgress = api.scrollProgress();
            const slidesInView = api.slidesInView();

            api.scrollSnapList().forEach((snap, snapIndex) => {
                // Skip work for slides not currently visible (cheap perf win during a drag).
                if (!slidesInView.includes(snapIndex)) return;

                let diffToTarget = snap - scrollProgress;

                // LOOP CORRECTION: when a slide is wrapped around the loop seam, its
                // raw diff is computed against the wrong "side" of the carousel.
                // Embla's loopPoints tell us which slides are currently wrapped and
                // in which direction, so we adjust diff to the visually correct delta.
                if (engine.options.loop) {
                    engine.slideLooper.loopPoints.forEach((loopItem) => {
                        const target = loopItem.target();
                        if (snapIndex === loopItem.index && target !== 0) {
                            const sign = Math.sign(target);
                            if (sign === -1) diffToTarget = snap - (1 + scrollProgress);
                            if (sign === 1) diffToTarget = snap + (1 - scrollProgress);
                        }
                    });
                }

                const node = nodes[snapIndex];
                if (!node) return;
                // -1 * factor: the image translates COUNTER to the slide's motion so it
                // "lags" the slide (matches the canonical Embla example). Drop the -1
                // and the image races ahead of the slide — looks wrong.
                const translate = diffToTarget * (-1 * tweenFactor) * 100;
                node.style.transform = `translateX(${translate}%)`;
            });
        };

        // Fire once on mount so initial positions are correct (otherwise off-centre
        // slides start at translate 0 and snap when you first drag).
        tween();

        api.on("scroll", tween);
        api.on("slidesInView", tween);
        api.on("reInit", tween);

        return () => {
            api.off("scroll", tween);
            api.off("slidesInView", tween);
            api.off("reInit", tween);
        };
    }, [api, viewportEl, factor]);

    return null;
}
