import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dither } from "./Dither";
const clearRect = vi.fn(), fillRect = vi.fn();
function setup(reduced: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ clearRect, fillRect, setTransform: vi.fn() } as unknown as CanvasRenderingContext2D);
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });
it("hides the dither canvas and draws a static frame under reduced motion", () => {
  setup(true); const raf = vi.fn(); vi.stubGlobal("requestAnimationFrame", raf);
  const { container } = render(<Dither animate />);
  expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
  expect(fillRect).toHaveBeenCalled(); expect(raf).not.toHaveBeenCalled();
});
let observe: IntersectionObserverCallback;
it("pauses off-screen and resumes only when visible", () => {
  setup(false); const raf = vi.fn(() => 42), cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf); vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { observe = callback; } observe() {} disconnect() {} });
  const { unmount } = render(<Dither animate />);
  observe([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver);
  expect(cancel).toHaveBeenCalledWith(42);
  expect(raf).toHaveBeenCalledTimes(1);
  observe([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
  expect(raf).toHaveBeenCalledTimes(2); unmount();
});
it("cancels its animation loop and disconnects observation on unmount", () => {
  setup(false); const cancel = vi.fn(), disconnect = vi.fn();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 42)); vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect = disconnect; });
  const { unmount } = render(<Dither animate />); unmount();
  expect(cancel).toHaveBeenCalledWith(42); expect(disconnect).toHaveBeenCalled();
});
