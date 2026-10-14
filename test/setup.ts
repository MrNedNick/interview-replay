import "fake-indexeddb/auto";

/** jsdom has no matchMedia; the theme toggle only needs it to answer and accept listeners. */
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}
/** jsdom has no ResizeObserver either; the timeline only needs it to exist and stay quiet. */
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
