"use client";

import { useEffect } from "react";
import { useLenis } from "@/components/providers/LenisProvider";

export function useLockScroll(isLocked: boolean) {
    const lenis = useLenis();

    useEffect(() => {
        if (!isLocked) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        lenis?.stop();

        return () => {
            document.body.style.overflow = previousOverflow;
            lenis?.start();
        };
    }, [isLocked, lenis]);
}
