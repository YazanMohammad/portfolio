import { describe, it, expect } from "vitest";
import { disableKit } from "./kit";

describe("kit", () => {
  it("disableKit disables kit stylesheets", () => {
    document.head.innerHTML = '<link rel="stylesheet" href="/a.css" data-kit><link rel="stylesheet" href="/b.css">';
    disableKit();
    const [kit, other] = Array.from(document.querySelectorAll<HTMLLinkElement>("link"));
    expect(kit.disabled).toBe(true);
    expect(other.disabled).toBeFalsy();
  });
});
