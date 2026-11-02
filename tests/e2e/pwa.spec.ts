import { expect, test } from "@playwright/test";
import { ir } from "./util";

test("PWA (marco 5): manifest, service worker e horários dos lembretes", async ({ page, request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect((await request.get("/sw.js")).status()).toBe(200);

  await ir(page, "/ajustes");
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)).toBe(true);
  await expect(page.getByRole("button", { name: "Ativar notificações" })).toBeVisible();
  const horarios = page.getByLabel("Horário", { exact: true });
  await expect(horarios).toHaveCount(3);
  await expect(horarios.nth(0)).toHaveValue("08:00");
  await expect(horarios.nth(1)).toHaveValue("13:00");
  await expect(horarios.nth(2)).toHaveValue("23:00");
});
