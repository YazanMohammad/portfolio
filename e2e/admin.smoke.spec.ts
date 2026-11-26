// Needs the backend: run `netlify dev` first (baseURL http://localhost:8888).
// Also needs E2E_ADMIN_PASSWORD; skipped without it.
import { test, expect } from "@playwright/test";

test.skip(!process.env.E2E_ADMIN_PASSWORD, "needs E2E_ADMIN_PASSWORD");
test.describe.configure({ mode: "serial" });

async function expectSummaryEventually(page: import("@playwright/test").Page, url: string, text: string) {
  await expect(async () => {
    await page.goto(url);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 90_000, intervals: [3000] });
}

test("site text, tone and preview save through the new admin", async ({page})=>{
 test.setTimeout(180_000);
 await page.goto('/admin');await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD!);await page.getByLabel('Password').press('Enter');await expect(page).toHaveURL(/\/admin\/dashboard$/);
 const original=await (await page.request.get('/api/admin/settings')).json();
 const heading=`Smoke work ${Date.now()}`;
 try {
  await page.goto('/admin/site-text');await page.getByRole('searchbox',{name:'Find site text'}).fill('Work heading');
  await page.getByLabel('Work heading',{exact:true}).fill(heading);
  await expect(page.getByRole('button',{name:'Work · 1 changed'})).toBeVisible();
  await expect(page.getByLabel('Site text has unsaved changes')).toBeVisible();
  await page.keyboard.press('Control+S');await expect(page.getByText('Saved',{exact:true}).first()).toBeVisible();
  await page.goto('/admin/look');const tone=page.getByRole('slider',{name:'Tone'});await tone.fill('200');
  await expect(page.getByTestId('site-preview')).toHaveAttribute('data-hue','200');
  await page.getByRole('checkbox',{name:/Hero sphere/}).uncheck();
  await expect(page.getByTestId('site-preview')).toHaveAttribute('data-sphere','false');
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Saved',{exact:true}).first()).toBeVisible();
  const saved=await (await page.request.get('/api/admin/settings')).json();expect(saved.copy.work.heading).toBe(heading);expect(saved.theme).toMatchObject({hue:200,sphere:false});expect(saved.theme).not.toHaveProperty('grid');
  await expectSummaryEventually(page,'/',heading);await expect(page.locator('.site-shell')).toHaveCSS('--accent','#3abdff');
 } finally {
  const restored=await page.request.put('/api/admin/settings',{headers:{Origin:new URL(page.url()).origin},data:{copy:original.copy,theme:original.theme}});expect(restored.status()).toBe(200);
  const readback=await (await page.request.get('/api/admin/settings')).json();expect(readback.copy).toEqual(original.copy);expect(readback.theme).toEqual(original.theme);
 }
});

test("admin edits, public reflects, contact message round trip", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const summary = `Smoke test ${stamp}`;

  // 1. login
  await page.goto("/admin");
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByLabel("Password").press("Enter");
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // 2. edit project summary
  await page.goto("/admin/projects");
  await page.getByText("Portfolio V1").first().click();
  const field = page.getByLabel("Summary");
  const original = await field.inputValue();
  await field.fill(summary);
  await page.keyboard.press("Control+S");
  await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();

  // 3. public site shows it
  await expectSummaryEventually(page, "/projects/portfolio-v1", summary);
  await expectSummaryEventually(page, "/", summary);

  // 4. restore
  await page.goto("/admin/projects");
  await page.getByText("Portfolio V1").first().click();
  await page.getByLabel("Summary").fill(original);
  await page.keyboard.press("Control+S");
  await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();

  // 5. contact form from a fresh context
  const anon = await browser.newContext();
  const visitor = await anon.newPage();
  await visitor.goto("/");
  await visitor.getByLabel("Name", { exact: true }).fill("Smoke Tester");
  await visitor.getByLabel("Email", { exact: true }).fill("smoke@example.com");
  // The inbox lists subject, not message body; keep its selector unique to this run.
  await visitor.getByLabel("Subject", { exact: true }).fill(`Smoke ${stamp}`);
  await visitor.getByLabel("Message", { exact: true }).fill(`Smoke ${stamp}`);
  await visitor.getByRole("button", { name: "Send message" }).click();
  await expect(visitor.getByText("Your message is sent.")).toBeVisible();
  await anon.close();

  // 6. messages: unread, sidebar badge, open, delete
  await page.goto("/admin/messages");
  const row = page.getByText(`Smoke ${stamp}`).first();
  await expect(row).toBeVisible();
  const unread = async () => {
    const label = await page.getByRole("link", { name: /^Messages/ }).first().getAttribute("aria-label");
    return Number(label?.match(/(\d+) unread/)?.[1] ?? 0);
  };
  await expect.poll(unread).toBeGreaterThan(0);
  const before = await unread();
  await row.click();
  await expect.poll(unread).toBe(before - 1);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete message", exact: true }).click();
  await expect(page.getByText(`Smoke ${stamp}`)).toHaveCount(0);
});
