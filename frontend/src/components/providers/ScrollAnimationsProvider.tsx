"use client";

import { useEffect, useLayoutEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap-config";
import { resolveAnimationDelayFromElement } from "@/lib/animation-timing";
import { isPreloaderComplete, subscribePreloaderComplete } from "@/lib/intro-gates";
import { usePageTransition } from "@/components/transitions/PageTransition";
import { applySplitIfNeeded, revertSplits } from "@/lib/split-text";
import type { SplitText } from "@/lib/gsap-config";
import { buildFromProps, runScrollAnimation, runMaskedReveal, buildEnterTween } from "@/lib/reveal-core";

/**
 * Global scroll-animation provider — data-attribute driven.
 *
 * Mount ONCE in [locale]/layout.tsx (inside <PageTransition>, since it reads
 * settledKey from usePageTransition). Scopes to document.body, so EVERY element
 * with data-scroll-animate on EVERY page is picked up automatically — no
 * per-page hook calls, no refs. Rebuilds on each settledKey bump (i.e. after
 * each page-transition enter settles), so animations re-arm on navigation.
 *
 * Supported data attributes:
 * - data-scroll-animate: Enables animation on the element
 * - data-animation-breakpoint: Minimum viewport width (px) for animation (default: 0)
 * - data-translate-y / data-translate-x: Target offset to animate TO (supports %, vh, rem, px)
 * - data-translate-z: Target Z offset to animate TO (supports px/rem)
 * - data-opacity: Target opacity value to animate TO (set matching Tailwind initial state on the element, e.g. opacity-0)
 * - data-scale: Target scale value to animate TO
 * - data-scale-y / data-scale-x: Target scale axis value to animate TO
 * - data-rotate: Target rotation value to animate TO (e.g., "360deg")
 * - data-rotate-x / data-rotate-y: Target 3D rotation values to animate TO (e.g., "0deg")
 * - data-blur: Target blur filter to animate TO (e.g., "10px")
 * - data-height: Target height to animate TO (supports %, vh, rem, px)
 * - data-width: Target width to animate TO (supports %, vw, rem, px)
 * - data-radius: Target border-radius to animate TO (supports %, rem, px)
 * - data-flex-grow: Target flex-grow to animate TO (number; parent must be flex)
 * - data-clip / data-clip-from: Target and starting CSS clip-path (use both for reliable interpolation)
 * - data-blur-from: Starting blur (e.g. "12px") that resolves to sharp (blur 0). The "-from" family declares a
 *   START and always resolves to NEUTRAL — no end attribute needed (do NOT pair with data-blur).
 * - data-skew-from: Starting skewX (deg, italic-style lean) that resolves to 0 (upright). Same -from rule as above.
 * - data-skew-from-y: Starting skewY (deg, vertical shear) that resolves to 0. Use with data-skew-from for compound lean.
 *   Composes with data-blur-from for the cinematic split reveal (letters lean + blur, resolving sharp + upright).
 *   Like data-blur-from, this OWNS the units' start state (skew + opacity + y), so it works on split units.
 * - data-mask: Target CSS mask-image (e.g. radial-gradient(...))
 * - data-duration: Animation duration in seconds
 * - data-delay: Animation delay in seconds (or ms, e.g. "400ms") before animation starts
 * - data-first-load-delay: Delay used only on the initial document load (overrides data-delay); falls back to data-delay on in-app navigations
 * - data-ease: Easing function (default: "power1.out")
 * - data-stagger: Stagger delay for child animations
 * - data-split: Split element text into "chars" | "words" | "lines" before animating. The
 *   animation target becomes the split units, and stagger defaults to a sensible per-type
 *   value if data-stagger isn't set. Use with any data-* animation attribute (opacity,
 *   translate, rotate, scale, etc.) — the system applies it to each unit.
 * - data-split-mask: "true" enables GSAP's built-in overflow-hidden mask and automatically
 *   applies the canonical yPercent:100 → 0 reveal. Pair this with data-split for the classic
 *   masked-rise headline reveal. Any data-translate-y you set is ignored — masked reveals
 *   always use yPercent. Duration / stagger / ease are still customizable.
 * - data-scrub: Scroll-linked animation (true or numeric value for smoothing)
 * - data-toggle-actions: Toggle actions for non-scrub animations (default: "play none none reverse")
 * - data-toggle-class: Toggle a class on the element between start/end
 * - data-start / data-end: ScrollTrigger positions
 * - data-trigger-start / data-trigger-end: Custom trigger element selectors
 * - data-trigger-parent: Use parent element as trigger (and endTrigger fallback)
 * - data-markers: Show debug markers for ScrollTrigger (dev only)
 * - data-lerp-scroll: Enables per-character lerp scroll effect (requires split chars)
 * - data-lerp-amp: Lerp amplitude in px (default: 12)
 * - data-lerp-speed: Lerp speed multiplier (default: 6)
 * - data-lerp-axis: Axis for lerp offset (x or y, default: y)
 * - data-lerp-stagger: Per-character phase offset (default: 0.35)
 * - data-lerp-factor: Smoothing factor (0-1, default: 0.2)
 * - data-lerp-stop-threshold: Stop detection threshold (default: 0.0005)
 * - data-lerp-return-factor: Return-to-zero easing (default: 0.08)
 * - data-lerp-curve: Curve falloff power (default: 1.8)
 * - data-lerp-direction: Direction mode (down | up | mirror, default: down)
 * - data-lerp-mirror-invert: Invert mirror direction (true/false)
 *
 * @example
 * ```tsx
 * // Just add the attributes to any element on any page — no wiring needed:
 * <div data-scroll-animate data-opacity="0" data-translate-y="20%">Content</div>
 * ```
 */

export function ScrollAnimationsProvider({ children }: { children: React.ReactNode }) {
    const { settledKey } = usePageTransition();

    useLayoutEffect(() => {
        if (settledKey === 0) return;

        // Accessibility: if the user/OS prefers reduced motion, skip every tween
        // and APPLY the data-attribute target values immediately as inline styles.
        // Inline styles win over Tailwind classes by CSS specificity, so an element
        // that started with `opacity-0` for FOUC prevention ends up correctly at its
        // intended final state (e.g. opacity 1) rather than stuck invisible.
        // Covers every attribute the library tweens — opacity, transforms, blur,
        // clip-path, mask, size, radius — by reading the same data-* values the
        // animation path would have animated TO.
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReducedMotion) {
            const items = gsap.utils.toArray<HTMLElement>("[data-scroll-animate]");
            items.forEach((el) => {
                const end: gsap.TweenVars = {};
                if (el.dataset.opacity !== undefined) end.opacity = parseFloat(el.dataset.opacity);
                if (el.dataset.translateY !== undefined) end.y = el.dataset.translateY;
                if (el.dataset.translateX !== undefined) end.x = el.dataset.translateX;
                if (el.dataset.translateZ !== undefined) end.z = el.dataset.translateZ;
                if (el.dataset.scale !== undefined) end.scale = parseFloat(el.dataset.scale);
                if (el.dataset.scaleY !== undefined) end.scaleY = parseFloat(el.dataset.scaleY);
                if (el.dataset.scaleX !== undefined) end.scaleX = parseFloat(el.dataset.scaleX);
                if (el.dataset.rotate !== undefined) end.rotate = el.dataset.rotate;
                if (el.dataset.rotateX !== undefined) end.rotateX = el.dataset.rotateX;
                if (el.dataset.rotateY !== undefined) end.rotateY = el.dataset.rotateY;
                if (el.dataset.skewFrom !== undefined) end.skewX = 0;
                if (el.dataset.skewFromY !== undefined) end.skewY = 0;
                if (el.dataset.blur !== undefined) end.filter = `blur(${el.dataset.blur || "0px"})`;
                if (el.dataset.height !== undefined) end.height = el.dataset.height;
                if (el.dataset.width !== undefined) end.width = el.dataset.width;
                if (el.dataset.radius !== undefined) end.borderRadius = el.dataset.radius;
                if (el.dataset.flexGrow !== undefined) end.flexGrow = parseFloat(el.dataset.flexGrow);
                if (el.dataset.clip !== undefined) {
                    end.clipPath = el.dataset.clip;
                    end.WebkitClipPath = el.dataset.clip;
                }
                if (el.dataset.mask !== undefined) {
                    end.maskImage = el.dataset.mask;
                    end.WebkitMaskImage = el.dataset.mask;
                }
                if (el.dataset.maskSize !== undefined) {
                    end.maskSize = el.dataset.maskSize;
                    end.WebkitMaskSize = el.dataset.maskSize;
                }
                gsap.set(el, end);
            });
            return;
        }

        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        const lerpRetryTimers: ReturnType<typeof setTimeout>[] = [];
        const lerpObservers: MutationObserver[] = [];
        const lerpCleanups: Array<() => void> = [];
        const parallaxTriggers: ScrollTrigger[] = [];
        const parallaxEls: HTMLElement[] = [];
        let attempt = 0;
        const maxRetries = 10;

        // Collected SplitText instances created during this effect's lifetime.
        // Reverted in the cleanup function so the DOM unmounts clean.
        const collectedSplits: SplitText[] = [];

        const initAnimations = () => {
            const mm = gsap.matchMedia();
            const ctx = gsap.context(() => {
                const items = gsap.utils.toArray<HTMLElement>("[data-scroll-animate]");

                if (items.length === 0 && attempt < maxRetries) {
                    attempt += 1;
                    retryTimer = setTimeout(initAnimations, 100);
                    return;
                }

                items.forEach((el) => {
                    // Get breakpoint from data attribute, default to 0 (all screens)
                    const breakpoint = el.dataset.animationBreakpoint || "0";
                    const mobileBreakpoint = el.dataset.mobileBreakpoint || "639";
                    const hasMobileOverrides = el.dataset.translateYMobile !== undefined || el.dataset.translateXMobile !== undefined || el.dataset.translateZMobile !== undefined || el.dataset.rotateXMobile !== undefined || el.dataset.rotateYMobile !== undefined;

                    const buildAnimProps = (useMobileOverrides: boolean) => {
                        const animProps: gsap.TweenVars = {};

                        const translateY = useMobileOverrides && el.dataset.translateYMobile ? el.dataset.translateYMobile : el.dataset.translateY;
                        const translateX = useMobileOverrides && el.dataset.translateXMobile ? el.dataset.translateXMobile : el.dataset.translateX;
                        const translateZ = useMobileOverrides && el.dataset.translateZMobile ? el.dataset.translateZMobile : el.dataset.translateZ;
                        const rotateX = useMobileOverrides && el.dataset.rotateXMobile ? el.dataset.rotateXMobile : el.dataset.rotateX;
                        const rotateY = useMobileOverrides && el.dataset.rotateYMobile ? el.dataset.rotateYMobile : el.dataset.rotateY;

                        if (translateY !== undefined) {
                            animProps.y = translateY;
                        }
                        if (translateX !== undefined) {
                            animProps.x = translateX;
                        }
                        if (translateZ !== undefined) {
                            animProps.z = translateZ;
                        }

                        // Opacity
                        if (el.dataset.opacity !== undefined) {
                            animProps.opacity = parseFloat(el.dataset.opacity);
                        }

                        // Scale
                        if (el.dataset.scale !== undefined) {
                            animProps.scale = parseFloat(el.dataset.scale);
                        }

                        if (el.dataset.scaleY !== undefined) {
                            animProps.scaleY = parseFloat(el.dataset.scaleY);
                        }

                        if (el.dataset.scaleX !== undefined) {
                            animProps.scaleX = parseFloat(el.dataset.scaleX);
                        }

                        // Rotate
                        if (el.dataset.rotate !== undefined) {
                            animProps.rotate = el.dataset.rotate;
                        }
                        if (rotateX !== undefined) {
                            animProps.rotateX = rotateX;
                        }
                        if (rotateY !== undefined) {
                            animProps.rotateY = rotateY;
                        }

                        // Blur filter
                        if (el.dataset.blur !== undefined) {
                            animProps.filter = `blur(${el.dataset.blur || "0px"})`;
                        }

                        // Height - treat as string to support CSS units
                        if (el.dataset.height !== undefined) {
                            animProps.height = el.dataset.height;
                        }

                        // Width - treat as string to support CSS units
                        if (el.dataset.width !== undefined) {
                            animProps.width = el.dataset.width;
                        }

                        // Border radius - treat as string to support CSS units
                        if (el.dataset.radius !== undefined) {
                            animProps.borderRadius = el.dataset.radius;
                        }

                        if (el.dataset.flexGrow !== undefined) {
                            animProps.flexGrow = parseFloat(el.dataset.flexGrow);
                        }

                        // Clip path - use data-clip-from + data-clip for matching string structures
                        if (el.dataset.clip !== undefined) {
                            animProps.clipPath = el.dataset.clip;
                            animProps.WebkitClipPath = el.dataset.clip;
                        }

                        // Mask image - treat as string
                        if (el.dataset.mask !== undefined) {
                            animProps.maskImage = el.dataset.mask;
                            animProps.WebkitMaskImage = el.dataset.mask;
                        }

                        // Mask size - treat as string
                        if (el.dataset.maskSize !== undefined) {
                            animProps.maskSize = el.dataset.maskSize;
                            animProps.WebkitMaskSize = el.dataset.maskSize;
                        }

                        // Duration
                        animProps.duration = el.dataset.duration ? parseFloat(el.dataset.duration) : 1;

                        // Delay (data-first-load-delay on initial document load, else data-delay)
                        const delay = resolveAnimationDelayFromElement(el);
                        if (delay !== undefined) {
                            animProps.delay = delay;
                        }

                        // Ease: default to linear for scrubbed animations
                        const isScrub = el.dataset.scrub !== undefined;
                        animProps.ease = el.dataset.ease || (isScrub ? "none" : "power1.out");

                        // Stagger for children
                        if (el.dataset.stagger !== undefined) {
                            animProps.stagger = parseFloat(el.dataset.stagger);
                        }

                        return animProps;
                    };

                    const buildScrollTriggerConfig = (useScrub: boolean): ScrollTrigger.Vars => {
                        const useParentAsTrigger = el.dataset.triggerParent !== undefined;
                        const triggerElement = useParentAsTrigger ? el.parentElement || el : el.dataset.triggerStart ? document.querySelector(el.dataset.triggerStart) || el : el;

                        const config: ScrollTrigger.Vars = {
                            trigger: triggerElement,
                            start: el.dataset.start || "top bottom",
                            end: el.dataset.end || "top top",
                            scrub: useScrub ? (el.dataset.scrub === "true" || el.dataset.scrub === "" ? true : parseFloat(el.dataset.scrub || "1")) : false,
                            toggleActions: useScrub ? undefined : el.dataset.toggleActions || "play none none reverse",
                            markers:
                                el.dataset.markers !== undefined
                                    ? {
                                          startColor: "green",
                                          endColor: "red",
                                          fontSize: "18px",
                                          fontWeight: "bold",
                                          indent: 20,
                                      }
                                    : false,
                        };

                        if (el.dataset.triggerEnd) {
                            const endTrigger = document.querySelector(el.dataset.triggerEnd);
                            if (endTrigger) {
                                config.endTrigger = endTrigger;
                            }
                        } else if (useParentAsTrigger && el.parentElement) {
                            config.endTrigger = el.parentElement;
                        }

                        return config;
                    };

                    let lerpAttempt = 0;
                    const setupLerpScroll = () => {
                        if (el.dataset.lerpScroll === undefined) {
                            return;
                        }

                        if (el.dataset.lerpInitialized === "true") {
                            return;
                        }

                        const initLerp = (chars: HTMLElement[]) => {
                            if (chars.length === 0) {
                                return;
                            }
                            el.dataset.lerpInitialized = "true";

                            const amplitude = parseFloat(el.dataset.lerpAmp || "12");
                            const speed = parseFloat(el.dataset.lerpSpeed || "6");
                            const axis = (el.dataset.lerpAxis || "y").toLowerCase();
                            const stagger = parseFloat(el.dataset.lerpStagger || "0.35");
                            const lerpFactor = parseFloat(el.dataset.lerpFactor || "0.2");

                            const setters = chars.map((char) => gsap.quickSetter(char, axis === "x" ? "x" : "y", "px"));
                            const offsets = new Array(chars.length).fill(0);
                            const stopThreshold = parseFloat(el.dataset.lerpStopThreshold || "0.0005");
                            const returnFactor = parseFloat(el.dataset.lerpReturnFactor || "0.08");
                            const velocity = { value: 0 };
                            const velocityNorm = { value: 0 };
                            const amplitudeState = { current: 0, target: 0 };
                            let isScrollUp = false;
                            const directionMode = (el.dataset.lerpDirection || "down").toLowerCase();
                            const mirrorInvert = el.dataset.lerpMirrorInvert === "true";
                            const curvePower = parseFloat(el.dataset.lerpCurve || "1.8") + speed * 0 + stagger * 0;
                            const ticker = () => {
                                amplitudeState.current += (amplitudeState.target - amplitudeState.current) * lerpFactor;
                                if (amplitudeState.target < stopThreshold) {
                                    amplitudeState.target += (0 - amplitudeState.target) * returnFactor;
                                }
                                const amp = amplitudeState.current;
                                const mirrorSign = isScrollUp ? -1 : 1;
                                const directionSign = directionMode === "mirror" ? (mirrorInvert ? -mirrorSign : mirrorSign) : directionMode === "up" ? -1 : 1;
                                chars.forEach((_, index) => {
                                    const t = chars.length > 1 ? index / (chars.length - 1) : 1;
                                    const distance = Math.abs(t - 0.5) * 2;
                                    const falloff = Math.pow(distance, curvePower);
                                    const sideSign = t < 0.5 ? -1 : 1;
                                    const target = amp * falloff * sideSign * directionSign;
                                    offsets[index] += (target - offsets[index]) * lerpFactor;
                                    setters[index](offsets[index]);
                                });
                            };
                            gsap.ticker.add(ticker);

                            const trigger = ScrollTrigger.create({
                                ...buildScrollTriggerConfig(true),
                                onUpdate: (self) => {
                                    const currentVelocity = self.getVelocity();
                                    velocity.value = Math.abs(currentVelocity);
                                    if (directionMode === "mirror") {
                                        isScrollUp = currentVelocity < 0;
                                    }
                                    velocityNorm.value = Math.min(1, velocity.value / 1000);
                                    amplitudeState.target = amplitude * velocityNorm.value;
                                },
                                onScrubComplete: () => {
                                    velocity.value = 0;
                                    velocityNorm.value = 0;
                                    amplitudeState.target = 0;
                                },
                            });
                            const cleanupTrigger = () => {
                                gsap.ticker.remove(ticker);
                                trigger.kill();
                            };
                            lerpCleanups.push(cleanupTrigger);
                        };

                        const chars = Array.from(el.querySelectorAll<HTMLElement>(".split-char"));
                        if (chars.length === 0) {
                            if (lerpAttempt < maxRetries) {
                                lerpAttempt += 1;
                                const timer = setTimeout(setupLerpScroll, 100);
                                lerpRetryTimers.push(timer);
                            }
                            const observer = new MutationObserver(() => {
                                const observedChars = Array.from(el.querySelectorAll<HTMLElement>(".split-char"));
                                if (observedChars.length > 0) {
                                    observer.disconnect();
                                    initLerp(observedChars);
                                }
                            });
                            observer.observe(el, { childList: true, subtree: true });
                            lerpObservers.push(observer);
                            return;
                        }

                        initLerp(chars);
                    };

                    const setupToggleClass = (useScrub: boolean) => {
                        if (!el.dataset.toggleClass) {
                            return;
                        }

                        const config = buildScrollTriggerConfig(useScrub);
                        ScrollTrigger.create({
                            ...config,
                            toggleClass: { targets: el, className: el.dataset.toggleClass },
                        });
                    };

                    // Create responsive media query
                    const desktopMinWidth = hasMobileOverrides && breakpoint === "0" ? `${Number(mobileBreakpoint) + 1}` : breakpoint;
                    mm.add(`(min-width: ${desktopMinWidth}px)`, () => {
                        const animProps = buildAnimProps(false);

                        const isScrub = el.dataset.scrub !== undefined;

                        animProps.scrollTrigger = buildScrollTriggerConfig(isScrub);

                        // data-split lever: split text into chars/words/lines.
                        // - Masked splits use the canonical yPercent:100 → 0 reveal
                        //   (the helper has already set yPercent:100 as the start state).
                        // - Unmasked splits use the existing data-* vocabulary on the units.
                        // Either way, the SplitText instance is collected for cleanup so
                        // the DOM unmounts clean (hydration-safe).
                        const split = applySplitIfNeeded(el);
                        if (split) {
                            collectedSplits.push(split.instance);
                            if (animProps.stagger === undefined) animProps.stagger = split.defaultStagger;
                        }
                        const target = split ? split.target : el.dataset.stagger !== undefined ? el.children : el;

                        if (el.dataset.clipFrom !== undefined) {
                            delete animProps.clipPath;
                            delete animProps.WebkitClipPath;
                            gsap.fromTo(el, { clipPath: el.dataset.clipFrom, WebkitClipPath: el.dataset.clipFrom }, { clipPath: el.dataset.clip, WebkitClipPath: el.dataset.clip, duration: animProps.duration, ease: animProps.ease, scrollTrigger: buildScrollTriggerConfig(isScrub) });
                        }

                        // data-blur-from / data-skew-from: the canonical "reveal into place" levers.
                        // Both declare a START on the actual units (split chars/words or the element)
                        // and resolve to neutral (sharp / upright). They share ONE fromTo so blur,
                        // skew, opacity and y move in perfect lockstep under a single stagger — the
                        // cinematic showpiece reveal. Either attribute alone triggers this branch;
                        // when only one is set, the other simply isn't added to the tween.
                        //   START: blur(data-blur-from), skewX(data-skew-from), skewY(data-skew-from-y), opacity 0, x/y = data-translate-x/y
                        //   END:   sharp (blur 0), upright (skew 0), opacity (data-opacity||1), x/y 0
                        if (el.dataset.blurFrom !== undefined || el.dataset.skewFrom !== undefined || el.dataset.skewFromY !== undefined) {
                            delete animProps.filter;
                            delete animProps.opacity;
                            delete animProps.y;
                            delete animProps.x;
                            const fromY = el.dataset.translateY ?? "0px";
                            const fromX = el.dataset.translateX ?? "0px";
                            const toOpacity = el.dataset.opacity !== undefined ? parseFloat(el.dataset.opacity) : 1;
                            const fromVars: gsap.TweenVars = { opacity: 0, y: fromY, x: fromX };
                            const toVars: gsap.TweenVars = { opacity: toOpacity, y: 0, x: 0, duration: animProps.duration, delay: animProps.delay, ease: animProps.ease, stagger: animProps.stagger, immediateRender: true, scrollTrigger: buildScrollTriggerConfig(isScrub) };
                            if (el.dataset.blurFrom !== undefined) {
                                fromVars.filter = `blur(${el.dataset.blurFrom})`;
                                fromVars.WebkitFilter = `blur(${el.dataset.blurFrom})`;
                                toVars.filter = "blur(0px)";
                                toVars.WebkitFilter = "blur(0px)";
                            }
                            if (el.dataset.skewFrom !== undefined) {
                                fromVars.skewX = parseFloat(el.dataset.skewFrom);
                                toVars.skewX = 0;
                            }
                            if (el.dataset.skewFromY !== undefined) {
                                fromVars.skewY = parseFloat(el.dataset.skewFromY);
                                toVars.skewY = 0;
                            }
                            gsap.fromTo(target, fromVars, toVars);
                        }

                        if (split?.useMask) {
                            runMaskedReveal(split, animProps, isScrub);
                        } else if (el.dataset.blurFrom === undefined && el.dataset.skewFrom === undefined && el.dataset.skewFromY === undefined) {
                            runScrollAnimation(target, animProps, isScrub);
                        }

                        setupToggleClass(isScrub);
                        setupLerpScroll();
                    });

                    if (hasMobileOverrides) {
                        mm.add(`(max-width: ${mobileBreakpoint}px)`, () => {
                            const animProps = buildAnimProps(true);

                            const isScrub = el.dataset.scrub !== undefined;
                            animProps.scrollTrigger = buildScrollTriggerConfig(isScrub);

                            // Mobile branch — same split logic as desktop.
                            const split = applySplitIfNeeded(el);
                            if (split) {
                                collectedSplits.push(split.instance);
                                if (animProps.stagger === undefined) animProps.stagger = split.defaultStagger;
                            }
                            const target = split ? split.target : el.dataset.stagger !== undefined ? el.children : el;

                            if (el.dataset.clipFrom !== undefined) {
                                delete animProps.clipPath;
                                delete animProps.WebkitClipPath;
                                gsap.fromTo(el, { clipPath: el.dataset.clipFrom, WebkitClipPath: el.dataset.clipFrom }, { clipPath: el.dataset.clip, WebkitClipPath: el.dataset.clip, duration: animProps.duration, ease: animProps.ease, scrollTrigger: buildScrollTriggerConfig(isScrub) });
                            }

                            if (el.dataset.blurFrom !== undefined || el.dataset.skewFrom !== undefined || el.dataset.skewFromY !== undefined) {
                                delete animProps.filter;
                                delete animProps.opacity;
                                delete animProps.y;
                                delete animProps.x;
                                const fromY = el.dataset.translateY ?? "0px";
                                const fromX = el.dataset.translateX ?? "0px";
                                const toOpacity = el.dataset.opacity !== undefined ? parseFloat(el.dataset.opacity) : 1;
                                const fromVars: gsap.TweenVars = { opacity: 0, y: fromY, x: fromX };
                                const toVars: gsap.TweenVars = { opacity: toOpacity, y: 0, x: 0, duration: animProps.duration, delay: animProps.delay, ease: animProps.ease, stagger: animProps.stagger, immediateRender: true, scrollTrigger: buildScrollTriggerConfig(isScrub) };
                                if (el.dataset.blurFrom !== undefined) {
                                    fromVars.filter = `blur(${el.dataset.blurFrom})`;
                                    fromVars.WebkitFilter = `blur(${el.dataset.blurFrom})`;
                                    toVars.filter = "blur(0px)";
                                    toVars.WebkitFilter = "blur(0px)";
                                }
                                if (el.dataset.skewFrom !== undefined) {
                                    fromVars.skewX = parseFloat(el.dataset.skewFrom);
                                    toVars.skewX = 0;
                                }
                                if (el.dataset.skewFromY !== undefined) {
                                    fromVars.skewY = parseFloat(el.dataset.skewFromY);
                                    toVars.skewY = 0;
                                }
                                gsap.fromTo(target, fromVars, toVars);
                            }

                            if (split?.useMask) {
                                runMaskedReveal(split, animProps, isScrub);
                            } else if (el.dataset.blurFrom === undefined && el.dataset.skewFrom === undefined && el.dataset.skewFromY === undefined) {
                                runScrollAnimation(target, animProps, isScrub);
                            }

                            setupToggleClass(isScrub);
                            setupLerpScroll();
                        });
                    }
                });

            }, document.body);

            // Cleanup function
            return () => {
                mm.revert();
                ctx.revert();
            };
        };

        const cleanup = initAnimations();

        // ── data-parallax — ScrollSmoother-style scroll parallax ────────────
        // Rebuilds GSAP ScrollSmoother's data-speed on our Lenis+ScrollTrigger
        // (Lenis runs window-scroll mode, so a scrubbed ScrollTrigger reads the
        // smoothed position for free — no ScrollSmoother, no scrollerProxy).
        // Framework-native rebuild, NOT a lift of GSAP code.
        //
        //   data-parallax="0.5"  → half speed (lags up the page)
        //   data-parallax="2"    → double speed (leads)
        //   data-parallax="1"    → no-op
        //   data-parallax="auto" → THE no-gap one. See below.
        //
        // NUMERIC: element hits its natural document position when centered in
        // the viewport (start top bottom / end bottom top, scrubbed) — exactly
        // like GSAP. Travel = (1 - speed) * (viewportH + elH), split symmetric.
        //
        // AUTO (the beloved, never-a-gap behaviour):
        //   - If the element ALREADY overflows an overflow:hidden parent, use the
        //     EXACT gap-aware travel: it moves only as far as the real slack
        //     (parent - child gap, largest direction), so an edge is NEVER
        //     revealed. This is GSAP's behaviour and rewards a proper oversized
        //     frame.
        //   - If there's NO overflow (someone tagged a normal image), the lever
        //     GUARANTEES slack itself: forces the parent to overflow:hidden,
        //     scales the element up by data-parallax-amount (default 1.2 = 20%
        //     slack), and parallaxes strictly within that slack. Add the tag →
        //     it works → no gap, ever. The stupidly-simple contract.
        //   data-parallax-amount tunes the scale/slack for the guarantee path.
        const initParallax = () => {
            const els = gsap.utils.toArray<HTMLElement>("[data-parallax]");
            els.forEach((el) => {
                const raw = (el.dataset.parallax || "").trim();
                if (raw === "" || raw === "1") return; // no-op

                const scrubVal = el.dataset.parallaxScrub ? parseFloat(el.dataset.parallaxScrub) : true;
                const markers = el.dataset.parallaxMarkers !== undefined;

                if (raw === "auto") {
                    const parent = el.parentElement;
                    if (!parent) return;
                    parent.style.overflow = "hidden";

                    const overflow = el.offsetHeight - parent.offsetHeight;

                    // CASE A — no real overflow (e.g. an object-cover image that
                    // exactly fills an aspect-ratio frame): manufacture slack by
                    // scaling the element up from its center. Center scaling adds
                    // EQUAL slack top + bottom, so symmetric travel within it can
                    // never expose an edge. This is the common real-world path.
                    if (overflow <= 0) {
                        const amount = parseFloat(el.dataset.parallaxAmount || "1.2");
                        gsap.set(el, { scale: amount, transformOrigin: "center center" });
                        const slack = el.offsetHeight * (amount - 1); // total, split top/bottom
                        parallaxEls.push(el);
                        if (slack <= 0) return;
                        const tween = gsap.fromTo(
                            el,
                            { y: slack / 2 },
                            { y: -slack / 2, ease: "none", scrollTrigger: { trigger: parent, start: "top bottom", end: "bottom top", scrub: scrubVal, markers, invalidateOnRefresh: true } }
                        );
                        if (tween.scrollTrigger) parallaxTriggers.push(tween.scrollTrigger);
                        return;
                    }

                    // CASE B — real oversized child: travel within its ACTUAL slack,
                    // pinned to where it currently rests. topGap = how far its top
                    // sits below the frame top; bottomGap = the remaining overflow
                    // below. Animating y from +topGap → -bottomGap keeps the child
                    // covering the frame at EVERY scroll position — no edge ever
                    // shows, for any alignment (top / centered / bottom). GSAP's
                    // largest-gap behaviour.
                    const topGap = el.offsetTop;
                    const bottomGap = overflow - topGap;
                    const tween = gsap.fromTo(
                        el,
                        { y: topGap },
                        { y: -bottomGap, ease: "none", scrollTrigger: { trigger: parent, start: "top bottom", end: "bottom top", scrub: scrubVal, markers, invalidateOnRefresh: true } }
                    );
                    if (tween.scrollTrigger) parallaxTriggers.push(tween.scrollTrigger);
                    return;
                }

                const speed = parseFloat(raw);
                if (!Number.isFinite(speed)) return;
                const trigger = el.dataset.parallaxTrigger ? document.querySelector(el.dataset.parallaxTrigger) || el : el;
                const distance = (1 - speed) * (window.innerHeight + el.offsetHeight);
                // clamp() (GSAP 3.12+) keeps an above-the-fold element at its natural
                // position at scrollTop 0 instead of starting pre-offset. Without it, a
                // numeric-parallax element near the top of the page renders shifted —
                // visible as a placeholder gap on a framed image. Below-the-fold
                // elements are unaffected. The auto path doesn't need this (its travel
                // is bounded by the frame slack, so it can't expose an edge).
                const tween = gsap.fromTo(
                    el,
                    { y: distance / 2 },
                    {
                        y: -distance / 2,
                        ease: "none",
                        scrollTrigger: { trigger, start: "clamp(top bottom)", end: "clamp(bottom top)", scrub: scrubVal, markers, invalidateOnRefresh: true },
                    }
                );
                if (tween.scrollTrigger) parallaxTriggers.push(tween.scrollTrigger);
            });
        };
        initParallax();

        return () => {
            if (retryTimer) {
                clearTimeout(retryTimer);
            }
            lerpRetryTimers.forEach((timer) => clearTimeout(timer));
            lerpObservers.forEach((observer) => observer.disconnect());
            lerpCleanups.forEach((cleanup) => cleanup());
            parallaxTriggers.forEach((t) => t.kill());
            // Clear the scale we baked onto guarantee-path elements so a remount starts clean.
            parallaxEls.forEach((el) => gsap.set(el, { clearProps: "scale,transform,transformOrigin" }));
            if (cleanup) {
                cleanup();
            }
            revertSplits(collectedSplits);
        };
    }, [settledKey]);

    // ── FOUC pre-pass for data-on-enter + data-split + data-split-mask ──────
    // Runs IMMEDIATELY on settledKey (before the preloader gate), purely to
    // bake in the hidden start state of any masked-split element bound to
    // data-on-enter. Without this, on a hard load there's a window between
    // page render and the preloader-complete gate where the masked text is
    // visible in its natural state — a brief flash before the helper hides it.
    // We split + gsap.set(yPercent:100) here so the elements are hidden from
    // the moment the provider sees them. The actual tween still fires from
    // the data-on-enter effect below (which waits for the gate).
    useLayoutEffect(() => {
        if (settledKey === 0) return;
        const items = Array.from(document.querySelectorAll<HTMLElement>("[data-on-enter][data-split][data-split-mask='true']"));
        if (items.length === 0) return;
        const splits: SplitText[] = [];
        items.forEach((el) => {
            const split = applySplitIfNeeded(el);
            if (split) splits.push(split.instance);
        });
        return () => {
            revertSplits(splits);
        };
    }, [settledKey]);

    // ── data-on-enter — fires AFTER the preloader curtain is GONE ───────────
    // The safe default. Waits for BOTH PageTransition's settledKey AND the
    // preloader-complete gate, so on a hard refresh the element animates
    // ONLY after the curtain has fully cleared ("boom, comes in after").
    // On in-app navigation there's no preloader, so the gate is already open
    // and this fires as soon as the page-fade settles. Use for hero content,
    // headings, CTAs, anything that should land cleanly on a clean canvas.
    // For elements that should animate DURING the curtain (cinematic overlap,
    // background motion), use data-on-enter-now instead.
    //
    // Split-text aware: if an element has data-split, the helper runs
    // SplitText, the tween target becomes the split units (or their masked
    // __inner wrappers), and stagger defaults to a per-type value when
    // data-stagger isn't set. Splits are reverted on cleanup so unmounts
    // leave the DOM clean (matters for hydration on locale switch / nav).
    useEffect(() => {
        if (settledKey === 0) return;

        const splits: SplitText[] = [];

        const playAll = () => {
            const items = Array.from(document.querySelectorAll<HTMLElement>("[data-on-enter]"));
            if (items.length === 0) return null;
            const ctx = gsap.context(() => {
                items.forEach((el) => {
                    const tween = buildEnterTween(el);
                    const split = applySplitIfNeeded(el);
                    if (split) {
                        splits.push(split.instance);
                        if (tween.stagger === undefined) tween.stagger = split.defaultStagger;
                    }
                    const target = split ? split.target : el;
                    if (split?.useMask) {
                        runMaskedReveal(split, tween, false);
                    } else {
                        runScrollAnimation(target, tween, false);
                    }
                });
            }, document.body);
            return ctx;
        };

        // Preloader already done (in-app nav, or hard refresh after curtain
        // gone) → fire immediately. Otherwise → wait for the gate.
        if (isPreloaderComplete()) {
            const ctx = playAll();
            return () => {
                ctx?.revert();
                revertSplits(splits);
            };
        }

        let ctx: gsap.Context | null = null;
        const unsubscribe = subscribePreloaderComplete(() => {
            ctx = playAll();
        });
        return () => {
            unsubscribe();
            ctx?.revert();
            revertSplits(splits);
        };
    }, [settledKey]);

    // ── data-on-enter-now — fires IMMEDIATELY on first render ───────────────
    // Plays as soon as the element exists in the DOM, BEFORE PageTransition
    // settles. Designed for cinematic overlap (e.g. background content moving
    // while the preloader curtain slides away). Most page content should use
    // data-on-enter instead — this one races with page transitions by design.
    //
    // Split-text aware: same lever as data-on-enter, just fires sooner.
    useEffect(() => {
        const items = Array.from(document.querySelectorAll<HTMLElement>("[data-on-enter-now]"));
        if (items.length === 0) return;
        const splits: SplitText[] = [];
        const ctx = gsap.context(() => {
            items.forEach((el) => {
                const tween = buildEnterTween(el);
                const split = applySplitIfNeeded(el);
                if (split) {
                    splits.push(split.instance);
                    if (tween.stagger === undefined) tween.stagger = split.defaultStagger;
                }
                const target = split ? split.target : el;
                if (split?.useMask) {
                    runMaskedReveal(split, tween, false);
                } else {
                    runScrollAnimation(target, tween, false);
                }
            });
        }, document.body);
        return () => {
            ctx.revert();
            revertSplits(splits);
        };
    }, [settledKey]);

    return <>{children}</>;
}
