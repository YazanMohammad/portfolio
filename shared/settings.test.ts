import { expect, it } from "vitest";
import { SettingsInput, mergeSettings, themeDefaults } from "./settings";
import { siteCopy } from "../src/content/copy";
it("merges missing, partial and empty overrides while ignoring unknown stored keys", () => {
 expect(mergeSettings()).toEqual({copy: siteCopy, theme: themeDefaults});
 const value=mergeSettings({copy:{work:{heading:" New ",viewCode:""},unknown:"ignored"},theme:{hue:"url(x)",accent:"#ffffff",unknown:true}});
 expect(value.copy.work.heading).toBe("New");expect(value.copy.work.viewCode).toBe(siteCopy.work.viewCode);expect(value.theme).toEqual(themeDefaults);expect(value.copy).not.toHaveProperty("unknown");
});
it.each(["url(x)","75",-1,360,1.5,null])("rejects invalid tone %j",hue=>{expect(SettingsInput.safeParse({theme:{hue}}).success).toBe(false);});
it("trims copy and accepts bounded integer tones",()=>{
 expect(SettingsInput.parse({theme:{hue:359},copy:{work:{heading:" New "}}})).toEqual({theme:{hue:359},copy:{work:{heading:"New"}}});
 expect(SettingsInput.safeParse({theme:{hue:0}}).success).toBe(true);
});
it("rejects unknown keys and oversized leaves",()=>{
 expect(SettingsInput.safeParse({theme:{unknown:true}}).success).toBe(false);
 expect(SettingsInput.safeParse({copy:{work:{unknown:"x"}}}).success).toBe(false);
 expect(SettingsInput.safeParse({copy:{work:{heading:"x".repeat(301)}}}).success).toBe(false);
});
