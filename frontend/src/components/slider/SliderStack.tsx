"use client";

import { Children, isValidElement, cloneElement, useEffect, useRef, type ReactElement } from "react";
import { cn } from "@/lib/utils";
import { useSliderContext } from "./use-slider";

/**
 * SliderStack — a STACKED listener layer (the "invisible engine, parallel
 * listeners" pattern). Renders its children stacked (absolute inset-0) in one
 * frame and stamps state classes on them as the slider's index changes:
 *   • `is-selected` on the active layer,
 *   • `is-removed`  on the layer that's LEAVING (animates out, then cleared),
 *   • `data-dir="next" | "prev"` on the frame (direction-aware exits).
 * CSS (slider-stack.css) owns all motion off those classes.
 *
 * ── WHY IMPERATIVE (off Embla events) AND NOT RENDER-DERIVED ──────────────────
 * The first cut derived these classes in React render from a ref/state "previous
 * index". That FAILED two ways: (1) a ref mutated during render collapses
 * (leaving === selected) so `is-removed` never lands; (2) state-via-effect lags a
 * frame or two, so fast drag/flick left stale or wrong `is-removed` layers → flashes
 * and jank. The reference Flickity build avoids this by swapping classes IMPERATIVELY
 * inside the slider's own select/settle events, synchronously, clearing stale state
 * first. We mirror that exactly using Embla's native API:
 *   • api.on('select')  → the moment selection changes. We read selectedScrollSnap()
 *     and previousScrollSnap() (both synchronous, no React lag), clear is-removed
 *     from ALL layers first (so a fast flick can't leave two removed), then stamp the
 *     new selected + the leaving one.
 *   • api.on('settle')  → motion finished. Clear is-removed so the stack rests clean
 *     (only is-selected remains) — this is what kills the "card flashing behind".
 *   • api.on('reInit')  → re-stamp after a re-measure (page-transition settle).
 *
 * The layers' STATIC classes (positioning) are applied once via cloneElement; their
 * STATE classes (is-selected/is-removed) are stamped imperatively on the live DOM
 * nodes in the effect — React never re-renders them on slide change, so the CSS
 * transition runs on a stable node (another reason the snap/flash went away).
 *
 * Compose as many SliderStacks as the design needs inside ONE SliderProvider — one
 * for images, one for headings, one for body — each independently listening to the
 * same index, like the reference's parallel <ul> lists. The (usually invisible)
 * engine SliderViewport on top drives them all. See StackedSliderDemo.
 *
 *   <SliderStack className="absolute inset-0">
 *     {images.map((src) => (
 *       <div key={src} data-slider-mask>
 *         <img src={src} alt="" />
 *       </div>
 *     ))}
 *   </SliderStack>
 *
 * Put the reveal-intent attribute (data-slider-mask / data-slider-rise /
 * data-slider-fade / data-slider-words) on each direct child or its descendants;
 * the CSS keys off the `.is-selected` / `.is-removed` the stack stamps here.
 */
export function SliderStack({
    children,
    className,
    layerClassName,
}: {
    children: React.ReactNode;
    /** The frame. Give it position + size (e.g. `absolute inset-0` or `relative aspect-square`). */
    className?: string;
    /** Extra classes applied to every stacked layer. */
    layerClassName?: string;
}) {
    const { api, slideCount } = useSliderContext();
    const frameRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame || !api) return;

        const layers = () => Array.from(frame.children) as HTMLElement[];

        const stamp = () => {
            const selected = api.selectedScrollSnap();
            const previous = api.previousScrollSnap();
            // Wrap-aware direction: forward step (incl. last→first wrap) is "next",
            // backward step (incl. first→last wrap) is "prev". A plain >= compare
            // gets the wrap backwards. n = slide count for the modulo.
            const n = slideCount || Math.max(selected, previous) + 1;
            let dir: "next" | "prev" = "next";
            if (selected === (previous + 1) % n) dir = "next";
            else if (selected === (previous - 1 + n) % n) dir = "prev";
            else dir = selected >= previous ? "next" : "prev"; // multi-step jump (tab click): fall back to ordinal
            frame.setAttribute("data-dir", dir);

            layers().forEach((el, i) => {
                // Clear stale state from EVERY layer first — a fast flick must never
                // leave two layers marked removed.
                el.classList.remove("is-removed");
                el.classList.toggle("is-selected", i === selected);
                if (i === previous && previous !== selected) {
                    el.classList.add("is-removed");
                }
            });
        };

        // Motion finished → drop is-removed so the stack rests clean (only the
        // selected layer stays marked). This is what stops a leaving layer lingering
        // visible / flashing behind.
        const settle = () => {
            layers().forEach((el) => el.classList.remove("is-removed"));
        };

        // Initial paint: mark the current selected layer (no removed yet).
        const init = () => {
            const selected = api.selectedScrollSnap();
            frame.setAttribute("data-dir", "next");
            layers().forEach((el, i) => {
                el.classList.remove("is-removed");
                el.classList.toggle("is-selected", i === selected);
            });
        };

        init();
        api.on("select", stamp);
        api.on("settle", settle);
        api.on("reInit", init);

        return () => {
            api.off("select", stamp);
            api.off("settle", settle);
            api.off("reInit", init);
        };
    }, [api, slideCount]);

    // Apply STATIC layer classes once (positioning + any caller layerClassName).
    // State classes are NOT set here — they're stamped imperatively above so React
    // never re-keys the nodes mid-transition.
    const items = Children.toArray(children).filter(isValidElement) as ReactElement<{ className?: string }>[];

    return (
        <div ref={frameRef} className={cn("relative", className)} data-dir="next">
            {items.map((child, i) =>
                cloneElement(child, {
                    key: child.key ?? i,
                    className: cn("absolute inset-0", layerClassName, child.props.className),
                })
            )}
        </div>
    );
}
