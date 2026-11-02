import { expect, test as setup } from "@playwright/test";
import { E2E } from "./ambiente";

setup("entra com e-mail e senha", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/entrar/);
  await page.waitForLoadState("networkidle");
  await page.fill("#email", E2E.email);
  await page.fill("#senha", E2E.senha);
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/hoje/, { timeout: 30_000 }); // no modo dev, a 1ª compilação do Hoje pode passar de 10 s
  await page.context().storageState({ path: "tests/e2e/.sessao.json" });
});
