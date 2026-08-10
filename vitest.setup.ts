import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; Polaris' breakpoint utilities call it on
// mount. Stub it so any component test can render Polaris components.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
