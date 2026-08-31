/**
 * Tracks whether animations should use first-load timing (preloader / hard refresh)
 * vs. shorter delays on in-app navigations. Resets on a genuine document reload.
 */
let initialEnterComplete = false;

export function isFirstDocumentLoad(): boolean {
    return !initialEnterComplete;
}

/** Call once the initial page enter has settled — persists across layout remounts (e.g. locale switch). */
export function markInitialEnterComplete(): void {
    initialEnterComplete = true;
}
