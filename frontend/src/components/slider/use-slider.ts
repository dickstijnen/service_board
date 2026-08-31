"use client";

import { useContext } from "react";
import { SliderContext, type SliderContextValue } from "./SliderProvider";

/**
 * useSliderContext — read the slider's broadcast state (selectedIndex, progress,
 * nav controls) from anywhere inside a <SliderProvider>.
 *
 * Throws if used outside a provider. Fail-loud is deliberate: a silent null here
 * would surface as a confusing "cannot read selectedIndex of null" deep in a child.
 * The throw names the exact cause.
 */
export function useSliderContext(): SliderContextValue {
    const ctx = useContext(SliderContext);
    if (!ctx) {
        throw new Error("useSliderContext must be used inside a <SliderProvider>.");
    }
    return ctx;
}
