"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import { usePageTransition } from "@/components/transitions/PageTransition";

/**
 * SliderProvider — the headless Embla engine + a broadcast context ("the PA system").
 *
 * WHY context (not prop-drilling): the active-slide index has to reach arbitrarily
 * deep descendants — a heading buried inside a slide needs to know "am I the active
 * slide now?" to fire its reveal. Broadcasting `selectedIndex` over context means
 * nav buttons, the progress bar, and (next step) per-slide reveal triggers all read
 * one source without any component in between relaying props it doesn't use.
 *
 * WHY local (not mounted in layout.tsx like Scroll/PointerMotion providers): those
 * are global because their levers can appear on ANY page. A slider is local to where
 * it's used — so this provider wraps each slider instance, not the whole app.
 *
 * Engine concerns live HERE so no consumer re-discovers them:
 *  - `reInit()` on settledKey: Embla measures slide widths on init. If it measures
 *    DURING the page-transition enter fade (before Lenis resize + final layout), the
 *    snap positions are wrong. Re-measuring on each settledKey bump fixes seating on
 *    first load AND on navigate-away-and-back. (This is the move the Embla spike proved
 *    works — and the exact failure mode that killed the Flickity spike.)
 *  - nav/progress wired via emblaApi events in an effect (emblaApi is null until ready),
 *    so the classic "external nav ref is null at init" bug is structurally impossible.
 *
 * Embla is headless: it never creates wrapper DOM. You write the viewport/track/slides
 * in JSX (see SliderViewport) and React owns the whole tree — no reconciliation seam.
 */

export type SliderContextValue = {
    /** Spread onto the viewport element (the overflow-clip). */
    sliderRef: (node: HTMLElement | null) => void;
    /** The resolved Embla viewport DOM node (the slider's own root). null until
     *  mounted. SliderReveal scopes its slide scan to this so it never touches
     *  another slider or page content. */
    viewportEl: HTMLElement | null;
    /** Raw Embla API (escape hatch for advanced needs — never trap the consumer). */
    api: EmblaCarouselType | undefined;
    /** Index of the currently selected slide. */
    selectedIndex: number;
    /** Travel direction of the LAST slide change: 1 = forward (next), -1 = backward
     *  (prev), 0 = none yet. Survives the loop wrap (3→0 via next is +1, not -3) so
     *  consumers like SliderCounter roll the right way. */
    direction: number;
    /** Continuous scroll progress, 0 → 1 (drives the progress bar). */
    scrollProgress: number;
    /** Total slide count (snap points). */
    slideCount: number;
    /** Whether the parent slider loops (Embla `loop` option). Lets edge UI like the
     *  counter reel decide whether the before-first / after-last neighbours exist. */
    loop: boolean;
    scrollPrev: () => void;
    scrollNext: () => void;
    scrollTo: (index: number) => void;
    canPrev: boolean;
    canNext: boolean;
};

export const SliderContext = createContext<SliderContextValue | null>(null);

export type SliderProviderProps = {
    /** Embla options. `loop`, `align`, `containScroll`, `dragFree`, etc. */
    options?: EmblaOptionsType;
    children: React.ReactNode;
};

export function SliderProvider({ options, children }: SliderProviderProps) {
    const [emblaRef, api] = useEmblaCarousel({
        align: "start",
        containScroll: "trimSnaps",
        loop: false,
        ...options,
    });
    const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null);
    // Wrap Embla's callback ref so we ALSO capture the resolved node (Embla needs
    // the ref; SliderReveal needs the node to scope its scan). One ref, two readers.
    const sliderRef = useCallback(
        (node: HTMLElement | null) => {
            emblaRef(node);
            setViewportEl(node);
        },
        [emblaRef]
    );
    const { settledKey } = usePageTransition();

    const [selectedIndex, setSelectedIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const [slideCount, setSlideCount] = useState(0);
    const [loop, setLoop] = useState<boolean>(Boolean(options?.loop));
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);

    // Wire all Embla event listeners once the api exists. emblaApi is null until
    // Embla is ready, so this effect re-runs when it becomes available — no null refs.
    useEffect(() => {
        if (!api) return;

        const onSelect = () => {
            // Embla's scrollBody knows the true travel direction even across the loop
            // seam (forward past the last slide = +1, not a backward jump). Capture it
            // so the counter reel rolls the way the slider actually moved.
            setDirection(api.internalEngine().scrollBody.direction() || 0);
            setSelectedIndex(api.selectedScrollSnap());
            setCanPrev(api.canScrollPrev());
            setCanNext(api.canScrollNext());
        };
        const onReInit = () => {
            setSlideCount(api.scrollSnapList().length);
            setLoop(Boolean(api.internalEngine().options.loop));
            onSelect();
        };

        // NOTE: we deliberately do NOT subscribe to Embla's `scroll` event. It fires
        // EVERY animation frame during a drag/transition; pushing that into React state
        // (setScrollProgress) re-rendered the WHOLE provider subtree per frame, which
        // made content-heavy sliders (stacked reveals + layer images) jumpy. No current
        // consumer reads a continuous `scrollProgress` — the progress bar/ring/counter
        // are all STEP-BASED off selectedIndex. If a future demo needs the live value,
        // read api.scrollProgress() on demand (or rAF-throttle a local subscription in
        // THAT component) rather than re-introducing a per-frame provider setState.
        onReInit();
        api.on("select", onSelect);
        api.on("reInit", onReInit);

        return () => {
            api.off("select", onSelect);
            api.off("reInit", onReInit);
        };
    }, [api]);

    // Re-measure once the page-transition enter fade + Lenis resize have settled, so
    // snap positions are computed against the final width. settledKey starts at 0
    // (pre-settle) and bumps after each enter — skip the 0.
    useEffect(() => {
        if (settledKey === 0 || !api) return;
        api.reInit();
    }, [settledKey, api]);

    const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
    const scrollNext = useCallback(() => api?.scrollNext(), [api]);
    const scrollTo = useCallback((index: number) => api?.scrollTo(index), [api]);

    return (
        <SliderContext.Provider
            value={{
                sliderRef,
                viewportEl,
                api,
                selectedIndex,
                direction,
                // Static 0: the per-frame Embla `scroll` subscription was removed (it
                // re-rendered the whole subtree every frame). Exposed only as an escape
                // hatch — a consumer that truly needs the live value should read
                // api.scrollProgress() directly. Nothing currently does.
                scrollProgress: 0,
                slideCount,
                loop,
                scrollPrev,
                scrollNext,
                scrollTo,
                canPrev,
                canNext,
            }}
        >
            {children}
        </SliderContext.Provider>
    );
}
