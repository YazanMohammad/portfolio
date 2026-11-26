import { expect, it } from "vitest";
import { derivePalette, contrastPairs } from "./palette";
it("every integer tone guarantees all five contrast pairs",()=>{
 for(let hue=0;hue<360;hue++){
  const palette=derivePalette(hue);
  expect(palette.bg).toBe("#0c0c0c");
  for(const colour of Object.values(palette))expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  for(const pair of contrastPairs(palette))expect(pair.ratio,`${hue} ${pair.foreground}/${pair.background}`).toBeGreaterThanOrEqual(4.5);
 }
});
it("tone changes accent and lightly tints the non-background neutrals",()=>{
 const a=derivePalette(75),b=derivePalette(240);
 for(const key of ["accent","surface","line","muted","text"] as const)expect(a[key]).not.toBe(b[key]);
});
