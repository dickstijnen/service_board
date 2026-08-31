"use client";

import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap-config";
import { markPreloaderComplete } from "@/lib/intro-gates";

// Module-scoped: survives client-side remounts (e.g. a locale switch remounting
// the layout) but resets on a real document load (fresh module evaluation).
// So the intro plays once per genuine page load — never on a soft in-app nav.
let hasPlayed = false;

export function Preloader() {
    const root = useRef<HTMLDivElement>(null);
    const [done, setDone] = useState(() => hasPlayed);

    useGSAP(
        () => {
            if (hasPlayed) {
                markPreloaderComplete();
                setDone(true);
                return;
            }

            // Mark complete at the END (not the start) so React's dev double-mount
            // doesn't flag it as already-played and skip the very first run.
            const finish = () => {
                hasPlayed = true;
                markPreloaderComplete();
                setDone(true);
            };

            // Start hidden BEFORE anything paints — GSAP owns the transform.
            gsap.set("[data-preloader-text]", { yPercent: 110, opacity: 0 });

            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduce) {
                gsap.set("[data-preloader-text]", { yPercent: 0, opacity: 1 });
                gsap.delayedCall(0.3, finish);
                return;
            }

            const tl = gsap.timeline({ onComplete: finish });

            // ── Your intro goes here ──────────────────────────────
            tl.to("[data-preloader-text]", { yPercent: 0, opacity: 1, duration: 0.7, ease: "power3.out" }).to("[data-preloader-text]", { yPercent: -110, opacity: 0, duration: 0.5, ease: "power3.in" }, "+=0.4").to(root.current, { yPercent: -100, duration: 0.8, ease: "power4.inOut" }, "-=0.1");
            // ──────────────────────────────────────────────────────
        },
        { scope: root }
    );

    if (done) return null;

    return (
        <div ref={root} data-motion-only className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-white">
            <div className="overflow-hidden">
                <span data-preloader-text className="block font-mono text-sm uppercase tracking-widest" style={{ opacity: 0 }}>
                    Strapi + Next
                </span>
            </div>
        </div>
    );
}
