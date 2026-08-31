"use client";

import { useRef, useEffect, useCallback, createContext, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap-config";
import { markInitialEnterComplete } from "@/lib/first-document-load";
import { useLenis } from "@/components/providers/LenisProvider";
import { getAnchorScroll } from "@/lib/anchor-scroll";

/**
 * Page transition — remount-independent, with built-in smooth anchor scrolling.
 *
 * ONE wrapper around all page content. The ENTER animation fires from a
 * usePathname() effect (not from template.tsx remounting), so it is immune to
 * folder structure / route groups — move routes anywhere and it still works.
 *
 * TRANSITION model (per-page background color, no fetch, no per-link map):
 *  - Each page sets a real bg color on its root AND declares it via data-bg.
 *  - <body> bg only covers the transition gap; it holds the CURRENT page color.
 *  - LEAVE (global click listener): fade the wrapper out, then navigate.
 *  - ENTER (pathname effect): fade the wrapper in, then update body color.
 *  - First load: set body instantly. prefers-reduced-motion: instant, no fade.
 *
 * SMOOTH ANCHOR SCROLL (baked in — works on any normal <a href="#..."> / <Link>):
 *  - Same-page hash (#team): preventDefault -> Lenis smooth-scroll, URL updated.
 *  - Cross-page hash (/about#team): fade + navigate, land at top, then smooth-
 *    scroll to the target once the new page has entered (handled in the enter
 *    effect via the pendingHash ref). No separate component, no styling wrapper.
 *  - Direct loads (/about#team typed/refreshed) use the browser's native jump.
 *
 * Also exposes usePageTransition().playLeave(onComplete) so PROGRAMMATIC
 * navigations (e.g. the locale switcher) can run the SAME leave fade.
 */

type PageTransitionApi = {
    /** Run the leave fade, then call onComplete (where you navigate). */
    playLeave: (onComplete: () => void) => void;
    /** Increments once new layout has painted — scroll hooks rebuild on this beat. */
    settledKey: number;
};

const PageTransitionContext = createContext<PageTransitionApi>({
    // Fallback if used outside the provider: navigate with no fade.
    playLeave: (cb) => cb(),
    settledKey: 0,
});

export const usePageTransition = () => useContext(PageTransitionContext);

export function PageTransition({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const router = useRouter();
    const lenis = useLenis();
    const animating = useRef(false);
    const firstLoad = useRef(true);
    // Holds a "#hash" to scroll to AFTER a cross-page navigation completes.
    const pendingHash = useRef<string | null>(null);
    const [settledKey, setSettledKey] = useState(0);

    // Single post-settle refresh after all scroll hooks have rebuilt.
    // NOTE: markInitialEnterComplete() used to fire here too, but that
    // races with ScrollAnimationsProvider's settledKey effects in Strict
    // Mode (dev double-mount), causing inconsistent first-load timing.
    // The flag is now flipped exclusively from playLeave below — "first
    // load" stays true until the user actually navigates, which is the
    // correct semantic anyway.
    useEffect(() => {
        if (settledKey === 0) return;
        requestAnimationFrame(() => {
            ScrollTrigger.refresh();
        });
    }, [settledKey]);

    // ENTER: fade the new page in whenever the path changes (and on first mount).
    useGSAP(
        () => {
            setSettledKey(0);

            const bg = ref.current?.querySelector("[data-bg]")?.getAttribute("data-bg");
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            gsap.killTweensOf(ref.current);

            // Scroll to a hash that was stashed by a cross-page anchor click.
            const consumeHash = (immediate: boolean) => {
                const hash = pendingHash.current;
                pendingHash.current = null;
                if (!hash || hash.length <= 1) return;
                const target = document.getElementById(hash.slice(1));
                if (target) lenis?.scrollTo(target, getAnchorScroll({ immediate }));
            };

            if (reduced) {
                gsap.set(ref.current, { autoAlpha: 1, clearProps: "visibility,opacity" });
                if (bg) document.body.style.backgroundColor = bg;
                firstLoad.current = false;
                consumeHash(true);
                lenis?.resize();
                setSettledKey((k) => k + 1);
                return;
            }

            requestAnimationFrame(() => {
                lenis?.resize();
                setSettledKey((k) => k + 1);
            });

            if (bg && firstLoad.current) document.body.style.backgroundColor = bg;

            gsap.fromTo(
                ref.current,
                { autoAlpha: 0 },
                {
                    autoAlpha: 1,
                    duration: 0.6,
                    ease: "power1.inOut",
                    onComplete: () => {
                        if (bg && !firstLoad.current) document.body.style.backgroundColor = bg;
                        firstLoad.current = false;
                        consumeHash(false);
                    },
                }
            );
        },
        { dependencies: [pathname], scope: ref }
    );

    // LEAVE fade — shared by the <a> interceptor AND programmatic navigations.
    const playLeave = useCallback((onComplete: () => void) => {
        markInitialEnterComplete();

        if (animating.current) return;
        animating.current = true;

        const go = () => {
            animating.current = false;
            onComplete();
        };

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            go();
            return;
        }

        gsap.to(ref.current, {
            autoAlpha: 0,
            duration: 0.5,
            ease: "power1.inOut",
            onComplete: go,
        });
    }, []);

    // Global click listener: handles transitions AND smooth anchor scrolling.
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = (e.target as Element | null)?.closest?.("a");
            const href = a?.getAttribute("href");
            if (!a || !href) return;
            if (a.target === "_blank" || a.hasAttribute("download") || a.hasAttribute("data-no-transition")) return;

            // Resolve against the FULL current URL so bare "#hash" keeps the current path.
            const dest = new URL(href, location.href);
            if (dest.origin !== location.origin) return; // external — let the browser handle it.

            const samePath = dest.pathname === location.pathname;

            // Same page + hash → smooth-scroll in place, no transition.
            if (samePath) {
                if (dest.hash && dest.hash.length > 1) {
                    const target = document.getElementById(dest.hash.slice(1));
                    if (target) {
                        e.preventDefault();
                        lenis?.scrollTo(target, getAnchorScroll());
                        history.replaceState(null, "", dest.hash); // reflect in URL, no history spam
                    }
                }
                return; // same path, no usable hash → leave it alone.
            }

            // Cross-page navigation (with or without a hash).
            e.preventDefault();
            if (animating.current) return;
            pendingHash.current = dest.hash || null; // scrolled to after enter (if any)
            playLeave(() => {
                // Push WITHOUT the hash so Next doesn't do its own instant jump —
                // the enter effect performs the smooth scroll instead.
                router.push(dest.pathname + dest.search);
                lenis?.scrollTo(0, { immediate: true });
            });
        };

        document.addEventListener("click", onClick, { capture: true });
        return () => document.removeEventListener("click", onClick, { capture: true });
    }, [router, lenis, playLeave]);

    return (
        <PageTransitionContext.Provider value={{ playLeave, settledKey }}>
            <div ref={ref} data-transition-page className="flex min-h-full flex-1 flex-col">
                {children}
            </div>
        </PageTransitionContext.Provider>
    );
}
