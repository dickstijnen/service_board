"use client";

import { useEffect } from "react";
import { useLenis } from "@/components/providers/LenisProvider";

export function ScrollLockWatcher() {
    const lenis = useLenis();

    useEffect(() => {
        const sync = () => {
            if (document.body.hasAttribute("data-scroll-locked")) {
                lenis?.stop();
            } else {
                lenis?.start();
            }
        };

        sync();

        const observer = new MutationObserver(sync);
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["data-scroll-locked"],
        });

        return () => {
            observer.disconnect();
        };
    }, [lenis]);

    return null;
}
