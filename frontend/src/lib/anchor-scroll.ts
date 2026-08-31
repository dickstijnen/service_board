/** Softer anchor scroll — longer ease-out, less harsh than Lenis defaults. */
function anchorScrollEase(t: number): number {
    return 1 - (1 - t) ** 4;
}

const ANCHOR_SCROLL_BASE = {
    duration: 1.75,
    easing: anchorScrollEase,
} as const;

export function getNavHeight(): number {
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-height"));
    return Number.isFinite(navH) && navH > 0 ? navH : 74;
}

/** Lenis scrollTo options — smooth scroll to page top. */
export function getScrollToTop(extra?: { immediate?: boolean }) {
    return {
        ...ANCHOR_SCROLL_BASE,
        ...extra,
    };
}

/** Lenis scrollTo options — section top stops flush with the nav bottom. */
export function getAnchorScroll(extra?: { immediate?: boolean }) {
    return {
        ...ANCHOR_SCROLL_BASE,
        offset: -getNavHeight(),
        ...extra,
    };
}
