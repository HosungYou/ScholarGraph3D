/**
 * Jest global setup for ScholarGraph3D frontend tests.
 *
 * This file is loaded before each test suite via jest.config.js setupFilesAfterFramework.
 * Add global mocks and DOM extensions here.
 */

import "@testing-library/jest-dom";

// ==================== Global Mocks ====================

// Mock Next.js router (used in many components)
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Image component (avoids image optimization in tests)
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />;
  },
}));

// Mock react-force-graph-3d (WebGL not available in jsdom)
jest.mock("react-force-graph-3d", () => ({
  __esModule: true,
  default: () => <div data-testid="force-graph-3d-mock" />,
}));

// Mock Three.js (not needed in unit tests)
jest.mock("three", () => ({
  Color: jest.fn().mockImplementation((color: string) => ({ color })),
  Vector3: jest.fn().mockImplementation((x: number, y: number, z: number) => ({ x, y, z })),
  SphereGeometry: jest.fn(),
  MeshLambertMaterial: jest.fn(),
  Mesh: jest.fn(),
}));

// ==================== Browser API Mocks ====================

// Mock window.matchMedia (used by some UI libraries)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver (used by graph canvas)
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Silence console.error for expected React warnings in tests
// Uncomment if noise becomes a problem:
// const originalError = console.error;
// beforeAll(() => {
//   jest.spyOn(console, "error").mockImplementation((...args) => {
//     if (typeof args[0] === "string" && args[0].includes("Warning:")) return;
//     originalError(...args);
//   });
// });
// afterAll(() => {
//   (console.error as jest.Mock).mockRestore();
// });
