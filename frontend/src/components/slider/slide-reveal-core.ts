// frontend/src/components/slider/slide-reveal-core.ts
//
// THE BENOIST ENGINE — GSAP-driven, two-sided, interruptible slide reveals.
//
// This is the heart of the stacked slider. On every slide-change it fires:
//   • an IN  animation on the ARRIVING slide's [data-reveal] targets, and
//   • an OUT animation on the LEAVING slide's targets (the inverse of the entrance).
//
// Why GSAP and not CSS class-toggles (the approach we deliberately scrapped):
//   CSS transitions are ONE per property per element and they RESTART when
//   re-triggered — so mashing the button cuts each wipe off and it feels cheap.
//   GSAP tweens are independent instances. With overwrite:false across SEPARATE
//   layer elements, mashing spawns overlapping tweens that STACK and CLIMB over
//   each other, each finishing on its own clock — the "five colours climbing"
//   fluid feel. On a SINGLE element that reverses mid-flight (a word told to go
//   IN and then immediately OUT) we use overwrite:"auto" so only the conflicting
//   property is retargeted from its current value — no fight, no snap. This is
//   the documented GSAP behaviour and the whole reason the motion can be
//   award-grade. (THE BENOIST LENS.)
//
// VOCABULARY: identical to scroll/page reveals (data-split, data-split-mask,
// data-translate-*, data-opacity, the "-from" family, data-duration/-delay/-ease/
// -stagger). Slide-change is just a THIRD trigger for the same vocabulary — no new
// attributes to learn. The OUT animation is, by default, the INVERSE of the IN
// (words that rose up from a mask leave upward through it; risen text goes back up
// and fades). Authors can override per-element with data-exit-* (see buildExit).
//
// SPLIT HANDLING: a slide's split text is split ONCE (lazily) and cached on the
// element. We never revert-and-re-split per fire — that would destroy units
// mid-climb. Units persist; each fire just retargets them. Revert only on unmount.

import { gsap, SplitText } from "@/lib/gsap-config";
import { applySplitIfNeeded } from "@/lib/split-text";
import { buildEnterTween } from "@/lib/reveal-core";

/** A reveal target plus its (optional, cached) split units. */
type RevealTarget = {
    el: HTMLElement;
    split: ReturnType<typeof applySplitIfNeeded>;
};

/** Per-slide cache so we split once and reuse the units across every fire. */
const slideTargetsCache = new WeakMap<HTMLElement, RevealTarget[]>();
/** Every SplitText instance we created, for revert on unmount. */
const createdSplits = new WeakMap<HTMLElement, SplitText[]>();
/**
 * Per-slide PENDING HIDE tween. playOut schedules a delayed "hide this slide when its
 * exit finishes"; if the slide is re-entered before that fires (next-then-immediately-
 * back, or any mash that lands back here), playIn must CANCEL it explicitly. We can't
 * rely on overwrite:"auto" for this — the hide tween animates no real property (it's a
 * timer carrying an onComplete), so GSAP's property-based overwrite never sees a
 * conflict and won't kill it. The stale onComplete then hides a now-active slide → the
 * "empty after next-then-back" bug. Tracking + explicit .kill() is the deterministic fix.
 */
const pendingHide = new WeakMap<HTMLElement, gsap.core.Tween>();
/**
 * Per-slide current reveal STATE: "in" (active, units at rest) or "idle" (hidden,
 * units parked below the mask). Needed because data-split="lines" uses GSAP autoSplit,
 * which re-splits on font-load/resize and creates BRAND-NEW unit divs. Those fresh
 * units default to no transform (visible) — so a re-split on an idle slide would flash
 * its heading, and a re-split mid-rest would be fine but a re-split on a hidden slide
 * strands it visible. On every re-split (via split.onResplit, wired in getTargets) we
 * re-apply the parked/at-rest state from here so lines never strand. Words/chars don't
 * autoSplit so this is a no-op for them.
 */
const slideState = new WeakMap<HTMLElement, "in" | "idle">();

/**
 * Monotonic z-index counter for LAYER-mode slides (data-slide-layer). Each time a layer
 * slide is played in, it's lifted above every previous layer so the NEWEST wipe always
 * sits on top of the stack — regardless of the slides' DOM order or which index you
 * jumped to. This is what makes rapid clicks ADD climbing layers (newest covering
 * oldest) instead of swapping. Layers are never removed, so this only ever grows; an
 * integer is fine for any realistic session.
 */
let layerZ = 1;

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Collect (and lazily split, once) the [data-reveal] targets inside a slide.
 * Cached per slide element so repeated fires reuse the same units — essential for
 * the climb (re-splitting every fire would orphan in-flight tweens).
 */
function getTargets(slide: HTMLElement): RevealTarget[] {
    const cached = slideTargetsCache.get(slide);
    if (cached) return cached;

    const els = Array.from(slide.querySelectorAll<HTMLElement>("[data-reveal]"));
    const splits: SplitText[] = [];
    const targets: RevealTarget[] = els.map((el) => {
        const split = applySplitIfNeeded(el);
        if (split) {
            splits.push(split.instance);
            // LINES SAFETY: autoSplit re-fires (font load, resize) replace the unit divs
            // with fresh ones that have no transform — visible. Re-park them to match the
            // slide's current state so a re-split never strands the heading visible or
            // mid-flight. Only masked splits need this; non-masked have their own start.
            if (split.useMask) {
                split.onResplit = (units) => {
                    const state = slideState.get(slide) ?? "idle";
                    gsap.set(units, { yPercent: state === "in" ? 0 : 100 });
                };
            }
        }
        return { el, split };
    });

    slideTargetsCache.set(slide, targets);
    createdSplits.set(slide, splits);
    return targets;
}

/** The element(s) GSAP should tween for a target: split units if split, else the element. */
function tweenTarget(t: RevealTarget): gsap.TweenTarget {
    if (!t.split) return t.el;
    return t.split.target;
}

/**
 * IN — the entrance. Same semantics as a page-arrival reveal, but always rebuilt
 * fresh (so it can overlap a still-running OUT on the same units via overwrite:auto).
 * Masked splits use the canonical yPercent:100 → 0 rise; everything else animates
 * from its start state (Tailwind class / inline) TO the data-* END values.
 */
export function playIn(slide: HTMLElement, dir: 1 | -1 = 1): void {
    // Cancel any pending "hide after exit" from a prior playOut on THIS slide. Explicit
    // kill (not overwrite) because the hide tween carries no animatable property for
    // overwrite to match — see pendingHide. Without this, next-then-immediately-back
    // leaves a stale timer that hides the slide we just re-activated (empty screen).
    const hide = pendingHide.get(slide);
    if (hide) {
        hide.kill();
        pendingHide.delete(slide);
    }

    // Show the slide instantly (visibility only — NO opacity fade). Each element owns
    // its own reveal: masked words clip (never fade), image/body fade via their own
    // data-opacity.
    gsap.set(slide, { visibility: "visible" });
    slideState.set(slide, "in");

    // DIRECTION-AWARE: dir=1 (next) => new content rises from BELOW (+ → 0). dir=-1
    // (previous) => new content drops from ABOVE (− → 0). A pure sign flip on the
    // entry offset, so the motion reflects the travel direction. (THE BENOIST LENS —
    // two-sided, input-responsive.)
    const fromPct = 100 * dir;

    if (prefersReduced()) {
        // Snap every target to its END state, legible, no motion.
        getTargets(slide).forEach((t) => {
            const end = buildEnterTween(t.el);
            delete end.duration;
            delete end.delay;
            delete end.ease;
            if (t.split?.useMask) {
                gsap.set(tweenTarget(t), { yPercent: 0 });
            } else {
                gsap.set(tweenTarget(t), end);
            }
        });
        return;
    }

    getTargets(slide).forEach((t) => {
        const vars = buildEnterTween(t.el);
        const stagger = t.el.dataset.stagger !== undefined ? parseFloat(t.el.dataset.stagger) : t.split?.defaultStagger;
        const target = tweenTarget(t);

        if (t.split?.useMask) {
            gsap.fromTo(
                target,
                { yPercent: fromPct },
                { yPercent: 0, duration: vars.duration, delay: vars.delay, ease: vars.ease, stagger, overwrite: "auto" }
            );
            return;
        }

        // Non-masked: fromTo so a re-fire restarts cleanly from the start state. The
        // entry y offset flips with direction (below on next, above on previous).
        const fromVars = buildInverseStart(t.el, vars, dir);
        gsap.fromTo(target, fromVars, { ...vars, stagger, overwrite: "auto" });
    });
}

/**
 * LAYER IN — the persistent-layer entrance (data-slide-layer). Identical reveal to
 * playIn, but the slide is FIRST lifted to the top of the layer z-stack so the newest
 * wipe always covers the previous ones. Crucially, a layer slide is NEVER played OUT or
 * idled by SliderReveal — it stays put after wiping in. The result: each pick wipes a
 * fresh image OVER the stack (clip-only, no fade), and rapid picks add climbing layers
 * with nothing fading out underneath. (THE BENOIST LENS — reveal-only, additive.)
 */
export function playLayerIn(slide: HTMLElement, dir: 1 | -1 = 1): void {
    slide.style.zIndex = String(++layerZ);
    playIn(slide, dir);
}

/**
 * OUT — the exit, the INVERSE of the entrance (the Benoist two-sided rule). Masked
 * units roll UP and out through their mask (yPercent 0 → -100). Risen/faded text
 * goes back the way it came (up + transparent). Authors can override the exit
 * vector per element with data-exit-y / data-exit-x / data-exit-opacity.
 *
 * overwrite:"auto" so if a unit is mid-IN when OUT fires (mash), only the
 * conflicting transform is retargeted from its CURRENT position — it peels away
 * smoothly instead of snapping. Across different slides (different elements) the
 * INs and OUTs don't conflict, so they all stack and climb.
 */
export function playOut(slide: HTMLElement, dir: 1 | -1 = 1): void {
    slideState.set(slide, "idle");
    if (prefersReduced()) {
        getTargets(slide).forEach((t) => {
            if (t.split?.useMask) gsap.set(tweenTarget(t), { yPercent: 100 });
            else gsap.set(tweenTarget(t), { opacity: 0 });
        });
        gsap.set(slide, { visibility: "hidden" });
        return;
    }

    // DIRECTION-AWARE exit: dir=1 (next) => leaving content exits UP (0 → −). dir=-1
    // (previous) => leaving content exits DOWN (0 → +). Mirror of the entry sign flip,
    // so old and new always travel the SAME way (next = everything moves up; previous =
    // everything moves down).
    const toPct = -100 * dir;
    let maxEnd = 0;

    getTargets(slide).forEach((t) => {
        const enter = buildEnterTween(t.el);
        const ease = t.el.dataset.exitEase || (enter.ease as string) || "power3.out";
        const stagger = t.el.dataset.stagger !== undefined ? parseFloat(t.el.dataset.stagger) : t.split?.defaultStagger;
        const target = tweenTarget(t);
        const baseDur = (enter.duration as number) ?? 0.7;
        // EXIT SPEED differs by reveal type to control overlap with the incoming slide:
        //   - MASKED (clip-roll, e.g. eyebrow): full mirror duration — it clips, so it can
        //     take its time and still never visually overlaps the new line.
        //   - NON-MASKED (translate+fade, e.g. headline/paragraph): FASTER (0.55×) so the
        //     leaving faded text clears quickly — a faded element lingering at half-opacity
        //     over the arriving one is exactly the "too much overlap" Eugene flagged. A
        //     touch of overlap is fine here, a lot is not.
        // Author overrides via data-exit-duration / data-exit-ease.
        const dur = t.el.dataset.exitDuration
            ? parseFloat(t.el.dataset.exitDuration)
            : t.split?.useMask
              ? baseDur
              : baseDur * 0.55;

        // Track the latest finish so we hide the whole slide only AFTER its content
        // has left (otherwise the slide vanishes before the exit is seen).
        const units = gsap.utils.toArray<Element>(target).length || 1;
        const end = dur + (stagger ? stagger * Math.max(0, units - 1) : 0);
        if (end > maxEnd) maxEnd = end;

        if (t.split?.useMask) {
            gsap.to(target, { yPercent: toPct, duration: dur, ease, stagger, overwrite: "auto" });
            return;
        }

        const out = buildExit(t.el, enter, dir);
        gsap.to(target, { ...out, duration: dur, ease, stagger, overwrite: "auto" });
    });

    // Keep the slide VISIBLE through its exit, then hide it when the exit completes.
    // Tracked in pendingHide so a re-entering playIn can explicitly .kill() it (the
    // hide carries no animatable property, so overwrite can't cancel it — that gap was
    // the "empty after next-then-back" bug). The onComplete clears its own registry slot.
    const hideTween = gsap.delayedCall(maxEnd, () => {
        gsap.set(slide, { visibility: "hidden" });
        pendingHide.delete(slide);
    });
    pendingHide.set(slide, hideTween as unknown as gsap.core.Tween);
}

/**
 * The start state for a non-masked IN — the inverse of where it animates TO, so a
 * fromTo restarts cleanly. We read the element's authored start (its data-* END is
 * the destination; the START is the Tailwind/inline state). For robustness we
 * derive a sensible "from" by inverting translate/opacity END values: if the END is
 * y:0 / opacity:1, the START is the element's offset / 0. We lean on the data-*
 * the author set (e.g. data-translate-y="0px" + class "translate-y-4 opacity-0")
 * by letting GSAP read current computed values for anything we don't override.
 */
function buildInverseStart(el: HTMLElement, end: gsap.TweenVars, dir: 1 | -1 = 1): gsap.TweenVars {
    // Minimal, robust: start from opacity 0 + an offset on the travel axis unless the
    // author declared explicit start offsets via data-from-*. The y offset flips with
    // direction: enters from BELOW on next (+), from ABOVE on previous (−).
    const from: gsap.TweenVars = {};
    if (end.opacity !== undefined) from.opacity = 0;
    const mag = 16 * dir;
    const fromY = el.dataset.fromY ?? (end.y !== undefined ? `${mag}px` : undefined);
    const fromX = el.dataset.fromX ?? undefined;
    if (fromY !== undefined) from.y = fromY;
    if (fromX !== undefined) from.x = fromX;
    // CLIP: if the entrance animates clip-path (data-clip), the START clip must be the
    // element's authored hidden clip (the inline class), NOT its current value — otherwise
    // the SECOND time a slide enters its clip is already open (the exit doesn't touch clip)
    // and it would just fade with no wipe. We read the authored start from the computed
    // style ONCE per element and re-use it so the wipe replays on every entrance.
    if (end.clipPath !== undefined) {
        const start = el.dataset.clipFrom ?? gsap.getProperty(el, "clipPath") as string;
        // Cache the very first observed clip as the canonical hidden start (subsequent
        // entrances read this, not the now-open live value).
        if (el.dataset.clipFrom === undefined) el.dataset.clipFrom = start;
        from.clipPath = el.dataset.clipFrom;
        from.WebkitClipPath = el.dataset.clipFrom;
    }
    return from;
}

/**
 * The exit vector for a non-masked target — the INVERSE of the entrance, but it ONLY
 * moves channels the entrance actually moved. Critical: an element that faded in with
 * NO y (e.g. the image: data-opacity only) must fade out with NO y — otherwise the
 * exit shoves it up -16px and the IN (which never writes y) never brings it back, so
 * the offset accumulates every loop (the "image creeps up / gap at bottom after a
 * full cycle" bug). Author can still force an explicit exit with data-exit-y/-x/
 * -opacity regardless of the entrance.
 */
function buildExit(el: HTMLElement, enter: gsap.TweenVars, dir: 1 | -1 = 1): gsap.TweenVars {
    const out: gsap.TweenVars = {};
    // Opacity: exit to 0 if the entrance touched opacity, or if explicitly set.
    if (el.dataset.exitOpacity !== undefined) out.opacity = parseFloat(el.dataset.exitOpacity);
    else if (enter.opacity !== undefined) out.opacity = 0;
    // Y: only if the entrance moved y (or author forces data-exit-y). Exits the SAME
    // way the travel is going — up on next (−), down on previous (+) — so leaving and
    // arriving content move together in one direction.
    const mag = -16 * dir;
    if (el.dataset.exitY !== undefined) out.y = el.dataset.exitY;
    else if (enter.y !== undefined) out.y = `${mag}px`;
    // X: same rule.
    if (el.dataset.exitX !== undefined) out.x = el.dataset.exitX;
    else if (enter.x !== undefined) out.x = "-16px";
    return out;
}

/**
 * Set the resting/idle state for a slide that is neither entering nor leaving.
 * Hides the WHOLE slide (autoAlpha = opacity 0 + visibility hidden) AND parks each
 * target at its hidden start, so a stacked non-active slide contributes nothing
 * visible or interactive. This slide-level hide is what stops every slide's heading
 * showing at once — it doesn't rely on each masked word holding position. Mirrors
 * the reference's `.sliderNav li > div { visibility:hidden }` + only-selected-visible.
 */
export function setIdle(slide: HTMLElement): void {
    gsap.set(slide, { visibility: "hidden" });
    slideState.set(slide, "idle");
    getTargets(slide).forEach((t) => {
        if (t.split?.useMask) gsap.set(tweenTarget(t), { yPercent: 100 });
        else gsap.set(tweenTarget(t), { opacity: 0 });
    });
}

/** Revert all splits created for these slides (call on unmount). */
export function revertSlideReveals(slides: HTMLElement[]): void {
    slides.forEach((slide) => {
        const splits = createdSplits.get(slide);
        if (splits) {
            splits.forEach((s) => {
                try {
                    s.revert();
                } catch {
                    /* already gone */
                }
            });
        }
        slideTargetsCache.delete(slide);
        createdSplits.delete(slide);
    });
}
