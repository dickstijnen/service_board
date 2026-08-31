"use client";

import { cn } from "@/lib/utils";
import { useSliderContext } from "./use-slider";

/**
 * SliderViewport — the overflow-clip viewport + the moving flex track.
 *
 * Pure markup + the engine ref. Embla reads slide widths from the DOM, so LAYOUT
 * (how many slides show, peek, gaps) is controlled by Tailwind classes on the slides
 * themselves — NOT by an options API. This is the headless pattern: the engine moves
 * the track, your CSS decides what it looks like.
 *
 *   <SliderViewport trackClassName="gap-4">
 *     {items.map(i => (
 *       <div key={i} className="min-w-0 shrink-0 grow-0 basis-[80%] md:basis-[40%]">
 *         ...slide content...
 *       </div>
 *     ))}
 *   </SliderViewport>
 *
 * `basis-*` per slide = the responsive "slidesPerView" equivalent (basis-[40%] ≈ 2.5
 * slides in view). Always pair each slide with `min-w-0 shrink-0 grow-0` so flex
 * doesn't squeeze them.
 */
export function SliderViewport({
    children,
    className,
    trackClassName,
}: {
    children: React.ReactNode;
    className?: string;
    trackClassName?: string;
}) {
    const { sliderRef } = useSliderContext();

    // select-none on the track: dragging a slider must never paint a text/image
    // selection (the blue-highlight-on-drag artifact). Baked in here so EVERY slider
    // built on this wrapper is drag-clean by default — no per-demo opt-in needed.
    return (
        <div ref={sliderRef} className={cn("overflow-hidden", className)}>
            <div className={cn("flex select-none", trackClassName)}>{children}</div>
        </div>
    );
}
