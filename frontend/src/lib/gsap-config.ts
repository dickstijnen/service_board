import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// ── Optional plugins — uncomment to enable (all free, no auth token needed) ──
import { SplitText } from "gsap/SplitText";
import { InertiaPlugin } from "gsap/InertiaPlugin";
// import { CustomEase } from "gsap/CustomEase";
// import { Flip } from "gsap/Flip";
// import { Observer } from "gsap/Observer";
// import { ScrollToPlugin } from "gsap/ScrollToPlugin";

gsap.registerPlugin(
    ScrollTrigger,
    SplitText,
    InertiaPlugin
    // CustomEase,
    // Flip,
    // Observer,
    // ScrollToPlugin,
);

// ── Project-wide easing / defaults (optional) ──
// Requires CustomEase uncommented above:
// CustomEase.create("osmo", "0.625, 0.05, 0, 1");
// gsap.defaults({ ease: "osmo", duration: 0.6 });

export {
    gsap,
    ScrollTrigger,
    SplitText,
    InertiaPlugin,
    // CustomEase,
    // Flip,
    // Observer,
    // ScrollToPlugin,
};
