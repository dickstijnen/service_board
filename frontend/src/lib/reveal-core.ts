// frontend/src/lib/reveal-core.ts
//
// Shared reveal CORE — the tween-building primitives used by every reveal
// trigger in the boilerplate. Extracted verbatim from ScrollAnimationsProvider
// so a SECOND trigger source (slide-change, in the slider) can reuse the EXACT
// same tween construction instead of reimplementing it (which would drift).
//
// THE MENTAL MODEL: there is ONE reveal vocabulary (data-opacity, data-translate-*,
// data-split, the "-from" family, masks, …) and N trigger sources that fire it:
//   1. scroll-driven    → ScrollAnimationsProvider, ScrollTrigger
//   2. page-arrival     → ScrollAnimationsProvider, settledKey + preloader gate
//   3. slide-change     → SliderReveal, emblaApi.on('select')   ← the new one
// All of them build their tweens with the helpers in THIS file. No new reveal
// attributes are ever added for a new trigger — only a new caller.
//
// This module is pure (no React, no providers). It depends only on gsap and the
// delay resolver. Nothing here was changed during extraction — behaviour is
// identical to when these lived inside ScrollAnimationsProvider.

import { gsap } from "@/lib/gsap-config";
import { resolveAnimationDelayFromElement } from "@/lib/animation-timing";

export const GSAP_FROM_PROP_MAP: Partial<Record<keyof gsap.TweenVars, string>> = {
    opacity: "opacity",
    x: "x",
    y: "y",
    z: "z",
    scale: "scale",
    scaleX: "scaleX",
    scaleY: "scaleY",
    rotate: "rotation",
    rotateX: "rotationX",
    rotateY: "rotationY",
    borderRadius: "borderRadius",
    flexGrow: "flexGrow",
};

export const buildFromProps = (target: gsap.TweenTarget, animProps: gsap.TweenVars): gsap.TweenVars => {
    const fromProps: gsap.TweenVars = {};
    const sample = gsap.utils.toArray<Element>(target)[0];
    if (!sample) return fromProps;

    for (const [prop, gsapProp] of Object.entries(GSAP_FROM_PROP_MAP)) {
        if (!gsapProp || animProps[prop as keyof gsap.TweenVars] === undefined) continue;
        fromProps[prop as keyof gsap.TweenVars] = gsap.getProperty(sample, gsapProp) as gsap.TweenVars[keyof gsap.TweenVars];
    }

    if (animProps.height !== undefined) fromProps.height = gsap.getProperty(sample, "height") as string;
    if (animProps.width !== undefined) fromProps.width = gsap.getProperty(sample, "width") as string;
    if (animProps.filter !== undefined) fromProps.filter = gsap.getProperty(sample, "filter") as string;
    if (animProps.clipPath !== undefined) {
        fromProps.clipPath = gsap.getProperty(sample, "clipPath") as string;
        fromProps.WebkitClipPath = fromProps.clipPath;
    }
    if (animProps.maskImage !== undefined) {
        fromProps.maskImage = gsap.getProperty(sample, "maskImage") as string;
        fromProps.WebkitMaskImage = fromProps.maskImage;
    }
    if (animProps.maskSize !== undefined) {
        fromProps.maskSize = gsap.getProperty(sample, "maskSize") as string;
        fromProps.WebkitMaskSize = fromProps.maskSize;
    }

    return fromProps;
};

/** Scrub stays `to`; incoming reveals use `fromTo` so Tailwind initial states aren't overwritten. */
export const runScrollAnimation = (target: gsap.TweenTarget, animProps: gsap.TweenVars, isScrub: boolean): void => {
    if (isScrub) {
        gsap.to(target, animProps);
        return;
    }

    gsap.fromTo(target, buildFromProps(target, animProps), {
        ...animProps,
        immediateRender: animProps.immediateRender ?? false,
    });
};

/**
 * Builds the masked reveal AND re-registers it to rebuild on every autoSplit
 * re-fire. The build closure captures the tween params and is called: once now,
 * and again on each re-split via split.onResplit (passing the fresh units). This
 * is what fixes the lines-only bug: lines use autoSplit, which destroys + recreates
 * unit divs on font/layout settle; without rebuild, the tween stays bound to the
 * old detached divs and the new visible lines never animate (snap to final state).
 * Chars/words don't autoSplit, so they only ever build once — same code path, no
 * special-casing.
 */
export const runMaskedReveal = (split: { target: HTMLElement[]; onResplit?: (units: HTMLElement[]) => void }, animProps: gsap.TweenVars, isScrub: boolean): void => {
    const { duration, delay, ease, stagger, scrollTrigger } = animProps;
    const build = (units: gsap.TweenTarget) => {
        if (isScrub) {
            gsap.fromTo(units, { yPercent: 100 }, { yPercent: 0, duration, ease, stagger, scrollTrigger });
            return;
        }
        gsap.fromTo(units, { yPercent: 100 }, { yPercent: 0, duration, delay, ease, stagger, immediateRender: true, scrollTrigger });
    };
    build(split.target);
    split.onResplit = (units) => build(units);
};

// Shared tween builder for data-on-enter + data-on-enter-now (and now the
// slide-change trigger). Reads the same data-* vocabulary as the scroll-reveal
// path so authors learn one mental model. END-state semantics: attributes
// describe where the element animates TO; the START state is on the element via
// Tailwind classes / inline style.
export function buildEnterTween(el: HTMLElement): gsap.TweenVars {
    const tween: gsap.TweenVars = {};
    if (el.dataset.translateY !== undefined) tween.y = el.dataset.translateY;
    if (el.dataset.translateX !== undefined) tween.x = el.dataset.translateX;
    if (el.dataset.translateZ !== undefined) tween.z = el.dataset.translateZ;
    if (el.dataset.opacity !== undefined) tween.opacity = parseFloat(el.dataset.opacity);
    if (el.dataset.scale !== undefined) tween.scale = parseFloat(el.dataset.scale);
    if (el.dataset.scaleY !== undefined) tween.scaleY = parseFloat(el.dataset.scaleY);
    if (el.dataset.scaleX !== undefined) tween.scaleX = parseFloat(el.dataset.scaleX);
    if (el.dataset.rotate !== undefined) tween.rotate = el.dataset.rotate;
    if (el.dataset.rotateX !== undefined) tween.rotateX = el.dataset.rotateX;
    if (el.dataset.rotateY !== undefined) tween.rotateY = el.dataset.rotateY;
    if (el.dataset.blur !== undefined) tween.filter = `blur(${el.dataset.blur || "0px"})`;
    if (el.dataset.height !== undefined) tween.height = el.dataset.height;
    if (el.dataset.width !== undefined) tween.width = el.dataset.width;
    if (el.dataset.radius !== undefined) tween.borderRadius = el.dataset.radius;
    if (el.dataset.clip !== undefined) {
        tween.clipPath = el.dataset.clip;
        tween.WebkitClipPath = el.dataset.clip;
    }
    if (el.dataset.mask !== undefined) {
        tween.maskImage = el.dataset.mask;
        tween.WebkitMaskImage = el.dataset.mask;
    }
    if (el.dataset.maskSize !== undefined) {
        tween.maskSize = el.dataset.maskSize;
        tween.WebkitMaskSize = el.dataset.maskSize;
    }
    tween.duration = el.dataset.duration ? parseFloat(el.dataset.duration) : 1;
    const delay = resolveAnimationDelayFromElement(el);
    if (delay !== undefined) tween.delay = delay;
    tween.ease = el.dataset.ease || "power2.out";
    return tween;
}
