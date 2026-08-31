"use client";

// frontend/src/components/ScrollRestorationGuard.tsx
//
// Disables the browser's automatic scroll restoration and pins the initial
// load to the top, so a refresh or navigation never flashes a scrolled-down
// position before our Lenis/page-transition logic takes over.
//
// WHY A CLIENT COMPONENT, NOT AN INLINE <script>:
// This used to be an inline <script dangerouslySetInnerHTML> in layout.tsx.
// React 19 + Next 16.2 warn ("Encountered a script tag while rendering React
// component") for ANY <script> rendered inside a component, and the warning
// re-fires every time the layout re-renders (e.g. on locale switch) — showing
// a red error in the dev overlay and the terminal. Inline scripts also can't
// use next/script's beforeInteractive strategy. Running the same one-time
// setup from a layout effect removes the warning for good while keeping the
// behaviour: the effect runs before the browser paints scroll position on the
// first client render.
//
// Renders nothing.

import { useLayoutEffect } from "react";

export function ScrollRestorationGuard() {
    useLayoutEffect(() => {
        try {
            if ("scrollRestoration" in history) {
                history.scrollRestoration = "manual";
            }
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
        } catch {
            // no-op — defensive only
        }
    }, []);

    return null;
}
