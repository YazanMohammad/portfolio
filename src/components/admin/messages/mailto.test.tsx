import { describe, expect, it } from "vitest";
import { replyHref } from "./mailto";

describe("replyHref", () => {
  it.each([
    ["Hello", "Re%3A%20Hello"],
    ["& # مرحبا", encodeURIComponent("Re: & # مرحبا")],
    ["Re: Hello", "Re%3A%20Hello"],
    [null, "Re%3A%20your%20message"],
    ["", "Re%3A%20your%20message"],
    ["re: Hello", "re%3A%20Hello"],
  ])("encodes subject %s without repeating Re", (subject, encoded) => {
    expect(replyHref({ email: "a@b.co", subject })).toBe(`mailto:a@b.co?subject=${encoded}`);
  });
});
