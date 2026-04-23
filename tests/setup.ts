import "@testing-library/jest-dom/vitest";

// @xyflow/react uses ResizeObserver internally; jsdom does not provide it.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
