import { describe, expect, it } from "vitest";
import { PROFILE_ABOUT, PROFILE_INTRO, siteCopy } from "./copy";

const BANNED = /(passionate|seamless|leverag|cutting-edge|\d+\+ )/i;
const VERBS = /^(See|Download|Send|Email|Contact|Read|Get)\b/;

describe("profile copy", () => {
  it("keeps the intro between 1 and 200 characters", () => {
    expect(PROFILE_INTRO.length).toBeGreaterThanOrEqual(1);
    expect(PROFILE_INTRO.length).toBeLessThanOrEqual(200);
  });

  it("keeps the about text within 3000 characters and without triple line breaks", () => {
    expect(PROFILE_ABOUT.length).toBeLessThanOrEqual(3000);
    expect(PROFILE_ABOUT).not.toContain("\n\n\n");
  });

  it("uses no banned words", () => {
    expect(PROFILE_INTRO).not.toMatch(BANNED);
    expect(PROFILE_ABOUT).not.toMatch(BANNED);
  });

  it("dates Xocialive only with Sep 2024 and Jan 2025", () => {
    for (const text of [PROFILE_INTRO, PROFILE_ABOUT]) {
      for (const sentence of text.split(/(?<=\.)\s+/)) {
        if (!sentence.includes("Xocialive")) continue;
        const dates = sentence.match(/\b(19|20)\d{2}\b/g) ?? [];
        for (const year of dates) expect(["2024", "2025"]).toContain(year);
        const months = sentence.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}/g) ?? [];
        for (const m of months) expect(["Sep 2024", "Jan 2025"]).toContain(m);
      }
    }
  });

  it("names no employer for the AI Engineer role", () => {
    const text = `${PROFILE_INTRO}\n${PROFILE_ABOUT}`;
    expect(text).toMatch(/AI engineer/i);
    expect(text).not.toMatch(/AI engineer (at|for|with) /i);
    expect(text).not.toMatch(/\b(RFP|tender|OCR)\b/i);
  });

  it("does not retain the removed hero tagline",() => {
    expect(siteCopy.hero).not.toHaveProperty("heading");
  });

  it("starts the hero buttons with a button verb", () => {
    expect(siteCopy.hero.primary).toMatch(VERBS);
    expect(siteCopy.hero.secondary).toMatch(VERBS);
  });
});
