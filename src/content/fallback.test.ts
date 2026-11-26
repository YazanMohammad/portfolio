import { describe, expect, it } from "vitest";
import type { PublicContent } from "@shared/index";
import fallbackJson from "./fallback.json";
import { PROFILE_ABOUT, PROFILE_INTRO } from "./copy";

import { mergeSettings } from "@shared/settings";
const fallback = { ...fallbackJson, settings: mergeSettings(fallbackJson.settings) } satisfies PublicContent;

describe("fallback snapshot", () => {
  it("has no CV", () => {
    expect(fallback.profile.cvUrl).toBeNull();
  });

  it("gives no current role a company or start date", () => {
    const current = fallback.experience.filter((e) => e.current);
    expect(current.length).toBeGreaterThan(0);
    for (const e of current) {
      expect(e.company).toBeNull();
      expect(e.startDate).toBeNull();
    }
  });

  it("uses the shared copy, three projects and fourteen skills", () => {
    expect(fallback.profile.intro).toBe(PROFILE_INTRO);
    expect(fallback.profile.about).toBe(PROFILE_ABOUT);
    expect(fallback.projects.map((p) => p.slug)).toEqual(["portfolio-v1", "chat-app", "tic-tac-toe"]);
    expect(fallback.skills).toHaveLength(14);
  });
});
