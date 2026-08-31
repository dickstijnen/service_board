"use client";

import { useEffect, useRef } from "react";
import { playIn, playLayerIn, playOut, setIdle, revertSlideReveals } from "./slide-reveal-core";
import { useSliderContext } from "./use-slider";

/**
 * SliderReveal — the slide-change reveal TRIGGER (THE BENOIST LENS).
 *
 * Drop it ANYWHERE inside a <SliderProvider> (renders nothing). On every slide
 * change it fires, via GSAP (see slide-reveal-core.ts):
 *   • IN  on the ARRIVING slide's [data-reveal] targets, and
 *   • OUT on the LEAVING slide's targets (the inverse of the entrance).
 *
 * It does NOT revert or cancel the previous fire. That's deliberate and is the
 * whole point: each fire spawns fresh GSAP tweens, and because separate slides are
 * separate elements (overwrite:false across them), mashing next/prev makes the
 * slides' reveals STACK and CLIMB over each other — every one finishing on its own
 * clock, fluid, never restarting. On a single unit that gets re-triggered mid-flight
 * the core uses overwrite:"auto" so it retargets from its current position instead
 * of snapping. CSS transitions cannot do this; that's why this is GSAP.
 *
 * -- AUTHOR API (identical vocabulary to scroll/page reveals) ------------------
 *   - `data-slide-reveal` on a SLIDE -- "fire my reveals when I become active".
 *   - `data-reveal` on elements inside -- the trigger-neutral marker (NOT
 *     data-scroll-animate/data-on-enter, so the global provider never double-fires
 *     them) + the normal END-state attrs: data-split, data-split-mask,
 *     data-translate-*, data-opacity, the "-from" family, data-duration/-delay/
 *     -ease/-stagger.
 *   - Exit defaults to the INVERSE of the entrance. Override per element with
 *     data-exit-y / data-exit-x / data-exit-opacity / data-exit-duration /
 *     data-exit-ease.
 *   - THE #1 LAW holds: each target ships its own start state (opacity-0 + a start
 *     transform) -- except data-split-mask, which owns its start (yPercent:100).
 *
 * Scope: scans the slider SUBTREE via a mounted anchor's parent — NOT the engine
 * viewport. The invisible Embla engine and the visible [data-slide-reveal] slides are
 * SIBLINGS under the slider wrapper, so scoping to the engine viewport finds zero
 * slides. We mount a display:contents anchor and scan from its parentElement (the
 * wrapper holding both slides and engine), so it always finds them. Still local.
 */
export function SliderReveal({ stacked = false }: { stacked?: boolean } = {}) {
    const { api } = useSliderContext();
    const anchorRef = useRef<HTMLSpanElement | null>(null);
    const regionsRef = useRef<HTMLElement[][]>([]);

    useEffect(() => {
        const anchor = anchorRef.current;
        if (!api || !anchor) return;

        const root = anchor.parentElement ?? document.body;
        const allSlides = Array.from(root.querySelectorAll<HTMLElement>("[data-slide-reveal]"));
        if (allSlides.length === 0) return;

        // A slider can have MULTIPLE synced regions (e.g. a text column AND an image
        // card), each a stack of [data-slide-reveal] slides. selectedScrollSnap() is a
        // single index shared by all of them, so we group slides by their REGION
        // (parent element) and index 0..n within each region. On change we fire the
        // matching slide in EVERY region together — that's how the whole composition
        // moves as one. Without grouping, a flat list would only ever touch region 1.
        const byParent = new Map<HTMLElement, HTMLElement[]>();
        allSlides.forEach((slide) => {
            const parent = slide.parentElement as HTMLElement;
            const arr = byParent.get(parent) ?? [];
            arr.push(slide);
            byParent.set(parent, arr);
        });
        const regions = Array.from(byParent.values());
        regionsRef.current = regions;

        // TWO MODES — because there are two slider archetypes and hiding is only correct
        // for one of them:
        //   • MOVING (default): a real scrolling carousel (Embla translates the track),
        //     slides sit side by side and you SEE the peeking neighbours. Here we must
        //     NEVER hide non-active slides — they scroll in/out naturally. The reveal
        //     just FIRES playIn when a slide becomes active. Hiding here is exactly the
        //     "next slide is hidden" bug (every neighbour visibility:hidden).
        //   • STACKED (stacked=true): slides are absolutely stacked at inset-0 (the
        //     "invisible engine" pattern), all at the same position, so non-active ones
        //     MUST be hidden + the active one plays IN while the leaving one plays OUT.
        //     PER-REGION LAYER VARIANT: a region whose slides carry `data-slide-layer`
        //     does NOT swap — each arriving slide wipes in ON TOP (lifted z-index) and
        //     PERSISTS; nothing is ever hidden or played out after it shows. Use it for a
        //     stack that should accumulate (images revealing over each other, no fade-out).
        //     One SliderReveal can mix a normal region + a layer region under one index.
        if (!stacked) {
            // Moving carousel: fire IN on the active slide, every region. No hiding,
            // no OUT, no idle — the carousel's own scroll handles visibility.
            const fire = () => {
                const selected = api.selectedScrollSnap();
                regions.forEach((region) => {
                    if (region[selected]) playIn(region[selected]);
                });
            };
            fire();
            api.on("select", fire);
            api.on("reInit", fire);
            return () => {
                api.off("select", fire);
                api.off("reInit", fire);
                revertSlideReveals(regionsRef.current.flat());
            };
        }

        // STACKED mode below —
        // A region is a LAYER region if its slides carry data-slide-layer: its slides
        // PERSIST and stack (newest wipes in on top, nothing is ever hidden/played out
        // after it's been shown). A normal stacked region SWAPS (active in, leaving out,
        // rest idled). We decide per region by sniffing the first slide.
        const isLayerRegion = (region: HTMLElement[]) => region[0]?.dataset.slideLayer !== undefined;

        // Initial paint: index `first` shows in every region; all others hidden.
        //   - normal region: first plays IN, the rest are idled (hidden + parked).
        //   - layer region: first wipes in (playLayerIn); the rest are hidden by
        //     visibility ONLY (NOT setIdle — setIdle forces opacity:0 on targets, but a
        //     layer image has no opacity channel to recover, so it'd stay invisible).
        //     Their clip stays at the inline hidden start, ready to wipe when first shown.
        const first = api.selectedScrollSnap();
        regions.forEach((region) => {
            const layer = isLayerRegion(region);
            region.forEach((slide, i) => {
                if (i === first) (layer ? playLayerIn : playIn)(slide);
                else if (layer) slide.style.visibility = "hidden";
                else setIdle(slide);
            });
        });
        // Track the index WE actually showed last — our own source of truth, not
        // Embla's previousScrollSnap(). On a fast spin / loop wrap / drag-settle,
        // Embla can emit a `select` whose previousScrollSnap() is NOT the slide that's
        // visually at rest on screen, so keying the OUT off it skips the real leaving
        // slide → it never animates out and strands visible (the "doesn't go out" bug).
        // We instead remember the last index we played IN and OUT exactly that one.
        let shownIndex = first;

        // On each change: in EVERY region, show the arriving index.
        //   - normal region: arriving plays IN, the slide WE last showed plays OUT, every
        //     other index is force-idled (so a slide skipped past in a fast mash can't
        //     pile up visible). No reverts on in/out — tweens overlap and climb.
        //   - layer region: arriving wipes in ON TOP (playLayerIn) and NOTHING else is
        //     touched — previous layers persist underneath, so picks add climbing layers.
        const onSelect = () => {
            const selected = api.selectedScrollSnap();
            if (selected === shownIndex) return; // settle re-fire for the same slide — nothing to do
            const leaving = shownIndex;
            const count = regions[0]?.length ?? 1;
            // DIRECTION (loop-aware): next => +1 (content moves up), previous => -1 (moves
            // down). Measured leaving→selected so it survives the loop wrap — forward if
            // the forward distance around the ring is the shorter one, backward otherwise.
            const forwardDist = (selected - leaving + count) % count;
            const backwardDist = (leaving - selected + count) % count;
            const dir: 1 | -1 = forwardDist <= backwardDist ? 1 : -1;

            regions.forEach((region) => {
                if (isLayerRegion(region)) {
                    // Persistent layers: only ever wipe the new one in on top. Never OUT,
                    // never idle — the previous layers stay exactly where they are.
                    if (region[selected]) playLayerIn(region[selected], dir);
                    return;
                }
                region.forEach((slide, i) => {
                    if (i === selected) playIn(slide, dir);
                    else if (i === leaving) playOut(slide, dir);
                    else setIdle(slide);
                });
            });
            shownIndex = selected;
        };

        api.on("select", onSelect);
        api.on("reInit", onSelect);

        return () => {
            api.off("select", onSelect);
            api.off("reInit", onSelect);
            revertSlideReveals(regionsRef.current.flat());
        };
    }, [api, stacked]);

    return <span ref={anchorRef} style={{ display: "contents" }} aria-hidden />;
}
