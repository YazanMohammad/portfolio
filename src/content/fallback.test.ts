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

  it("keeps the current CV role and its approved details", () => {
    const current = fallback.experience.filter((e) => e.current);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({company:"MenaDevs",startDate:"2026-08",endDate:null});
    expect(current[0].bullets).toHaveLength(2);
  });

  it("uses the shared copy, three projects and thirty skills", () => {
    expect(fallback.profile.intro).toBe(PROFILE_INTRO);
    expect(fallback.profile.about).toBe(PROFILE_ABOUT);
    expect(fallback.projects.map((p) => p.slug)).toEqual(["spitfire", "zakat-calculator", "chat-app"]);
    expect(fallback.skills).toHaveLength(30);
  });
});
