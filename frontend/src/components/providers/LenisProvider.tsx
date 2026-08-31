"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap-config";
import "lenis/dist/lenis.css";

const LenisContext = createContext<Lenis | null>(null);

export function useLenis() {
    return useContext(LenisContext);
}

export function LenisProvider({ children }: { children: ReactNode }) {
    const [lenis, setLenis] = useState<Lenis | null>(null);

    useEffect(() => {
        const lenis = new Lenis({
            autoRaf: false,
        });

        setLenis(lenis);

        // Sync ScrollTrigger to Lenis's scroll (window-scroll mode — no scrollerProxy needed)
        lenis.on("scroll", ScrollTrigger.update);

        // ─── Scroll-aware body attributes ─────────────────────────────────
        // Writes two data-attrs on <body> that any project's CSS can use to
        // react to scroll position + direction. The boilerplate ships ONLY
        // the hook — no built-in hide/reveal CSS. Per-project, target e.g.
        // `body[data-scrolling-started="true"][data-scrolling-direction="down"] .your-nav { ... }`
        //
        // Hysteresis (pixel-based, no debounce — proven values from prior projects):
        //   120 — top dead-zone. Below this scrollY, data-scrolling-started="false"
        //         (the nav is "at the top", no hide logic should fire).
        //   28  — accumulated downward pixels needed before flipping to "down".
        //         Not per-frame; this builds up across scroll events so small
        //         jitter doesn't flip the state constantly.
        //   -4  — upward deadband. Direction flips to "up" only on a delta
        //         less than -4 in one tick. Tiny upward wiggles ignored.
        //
        // iOS NOTE — the URL bar show/hide on Safari produces 1–2px of phantom
        // scroll motion as the viewport resizes. We're protected because:
        //   (a) We read lenis.scroll (RAF-driven, decoupled from native scroll
        //       events), NOT window.scrollY which iOS unreliably updates.
        //   (b) The 28px accumulation and -4px deadband absorb the phantom motion.
        // DESIGN NOTE — auto-hiding a nav on mobile is often a UX mistake (no
        // hover-to-edge to bring it back). Per-project CSS should typically gate
        // the hide rule to desktop, e.g.:
        //   @media (min-width: 768px) { body[data-scrolling-direction="down"]... }
        document.body.dataset.scrollingDirection = "up";
        document.body.dataset.scrollingStarted = "false";

        let lastScrollY = lenis.scroll;
        let downwardSinceReveal = 0;
        const onScrollState = () => {
            const scrollY = lenis.scroll;
            if (scrollY <= 120) {
                document.body.dataset.scrollingStarted = "false";
                downwardSinceReveal = 0;
            } else {
                document.body.dataset.scrollingStarted = "true";
            }
            const delta = scrollY - lastScrollY;
            lastScrollY = scrollY;
            if (delta > 0) {
                downwardSinceReveal += delta;
                if (downwardSinceReveal >= 28 && document.body.dataset.scrollingDirection !== "down") {
                    document.body.dataset.scrollingDirection = "down";
                }
            } else if (delta < -4) {
                downwardSinceReveal = 0;
                document.body.dataset.scrollingDirection = "up";
            }
        };
        lenis.on("scroll", onScrollState);

        // Drive Lenis off GSAP's single ticker
        const raf = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);

        return () => {
            gsap.ticker.remove(raf);
            lenis.destroy();
            setLenis(null);
            // Reset scroll-state attrs so a remount starts clean.
            document.body.dataset.scrollingDirection = "up";
            document.body.dataset.scrollingStarted = "false";
        };
    }, []);

    return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
