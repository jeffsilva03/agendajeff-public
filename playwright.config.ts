import { defineConfig, devices } from "@playwright/test";

// Testes de ponta a ponta contra o app local (npm run dev) e o Supabase local.
// Cada execução cria um usuário próprio (e2e@local.test) e o apaga no fim.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/preparar.ts",
  globalTeardown: "./tests/e2e/limpar.ts",
  use: { baseURL: process.env.E2E_URL ?? "http://localhost:3000", trace: "retain-on-failure", locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  projects: [
    { name: "login", testMatch: /login\.setup\.ts/ },
    { name: "pc", dependencies: ["login"], use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.sessao.json" }, testIgnore: /celular\.spec\.ts/ },
    { name: "iphone", dependencies: ["login"], use: { ...devices["iPhone 15"], storageState: "tests/e2e/.sessao.json" }, testMatch: /celular\.spec\.ts/ },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3000/entrar", reuseExistingServer: true, timeout: 120_000 },
});
