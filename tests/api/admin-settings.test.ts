import { beforeEach, expect, it } from "vitest";
import handler from "../../netlify/functions/admin-settings";
import content from "../../netlify/functions/content";
import { call, resetDb, seedMinimal, loginCookie, purgeSpy } from "./helpers";
import { describeDb } from "./describe-db";
import { db } from "../../db/client";
import { siteSettings } from "../../db/schema";
import { runSeed } from "../../db/seed";
describeDb("site settings round trip (TEST DB)", () => {
 let cookie: string;
 beforeEach(async () => {await resetDb(); await seedMinimal(); cookie = await loginCookie();});
 it("GET defaults, PUT, fresh GET and public merge round trip", async () => {
  const initial = await call(handler,{path:"/api/admin/settings",cookie});
  expect(await initial.json()).toMatchObject({copy:{},theme:{},updatedAt:null});
  const saved = await call(handler,{path:"/api/admin/settings",method:"PUT",cookie,json:{copy:{work:{heading:"Live heading"}},theme:{hue:240}}});
  expect(saved.status).toBe(200);
  const again = await call(handler,{path:"/api/admin/settings",cookie});
  expect(await again.json()).toMatchObject({copy:{work:{heading:"Live heading"}},theme:{hue:240},updatedAt:expect.any(String)});
  const pub = await call(content,{path:"/api/content"});
  expect((await pub.json()).settings).toMatchObject({copy:{work:{heading:"Live heading",viewCode:"See the code"}},theme:{hue:240,grid:true}});
  expect(purgeSpy).toHaveBeenCalledWith({tags:["content"]});
  const partial = await call(handler,{path:"/api/admin/settings",method:"PUT",cookie,json:{copy:{}}});
  expect(partial.status).toBe(200);expect((await partial.json()).theme.hue).toBe(240);
 });
 it("plain seed counts settings and --force clears them",async()=>{
  await resetDb();await db.insert(siteSettings).values({copy:{work:{heading:"Keep"}}});
  expect(await runSeed({force:false})).toEqual({skipped:true});
  await runSeed({force:true,fetchCv:async()=>new Response("",{status:503}),uploadFile:async()=>{throw new Error("offline fixture");}});
  expect(await db.query.siteSettings.findFirst()).toBeUndefined();
 });
});
