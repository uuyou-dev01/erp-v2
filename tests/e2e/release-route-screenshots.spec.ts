import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type ConsoleMessage } from "@playwright/test";

const evidenceDir = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");

mkdirSync(evidenceDir, { recursive: true });

const desktopRoutes = [
  ["workbench", "/workbench"],
  ["notifications", "/notifications"],
  ["procurement", "/procurement"],
  ["procurement-new", "/procurement/new"],
  ["consolidations", "/logistics/consolidations"],
  ["fulfillment", "/fulfillment/requests"],
  ["inventory-home", "/inventory"],
  ["inventory-sellable", "/inventory/sellable"],
  ["inventory-items", "/inventory/items"],
  ["inventory-lots", "/inventory/lots"],
  ["inventory-opening", "/inventory/opening-stock"],
  ["inventory-stocktake", "/inventory/stocktake"],
  ["inventory-skus", "/inventory/skus"],
  ["inventory-locations", "/inventory/locations"],
  ["inventory-coverage", "/inventory/coverage"],
  ["inventory-sold", "/inventory/sold"],
  ["listing", "/listing"],
  ["listing-new", "/listing/new"],
  ["listing-platforms", "/listing/platforms"],
  ["sales", "/sales"],
  ["sales-new", "/sales/new"],
  ["after-sales", "/sales/after-sales"],
  ["marketplace", "/marketplace"],
  ["my-offers", "/marketplace/my-offers"],
  ["offer-new", "/marketplace/new"],
  ["resale", "/resale"],
  ["wallet", "/finance/wallet"],
  ["settlements", "/finance/settlements"],
  ["charges", "/finance/charges"],
  ["channel-statements", "/finance/channel-statements"],
  ["reports", "/reports"],
  ["workload", "/reports/workload"],
  ["team-performance", "/reports/team-performance"],
  ["settings", "/settings"],
  ["settings-personal", "/settings/personal"],
  ["settings-company", "/settings/company"],
  ["settings-team", "/settings/team"],
  ["settings-stores", "/settings/stores"],
  ["settings-connections", "/settings/connections"],
  ["settings-partners", "/settings/partners"],
  ["settings-warehouse", "/settings/warehouse-collaboration"],
  ["settings-structure", "/settings/business-structure"],
  ["settings-system", "/settings/system"],
  ["settings-categories", "/settings/categories"],
  ["product-intelligence", "/product-intelligence"],
  ["product-captures", "/product-intelligence/captures"],
] as const;

const mobileRoutes = [
  ["home", "/m"],
  ["capture", "/m/capture"],
  ["capture-purchase", "/m/capture/purchase"],
  ["capture-price", "/m/capture/price"],
  ["tasks", "/m/tasks"],
  ["tasks-batch", "/m/tasks/batch"],
  ["tasks-ship", "/m/tasks/ship"],
  ["items", "/m/items"],
  ["prices", "/m/prices"],
  ["notifications", "/m/notifications"],
  ["me", "/m/me"],
] as const;

test.describe("v0.9.0 production route screenshot smoke", () => {
  test.describe.configure({ mode: "serial" });

  test("desktop routes", async ({ page }) => {
    test.setTimeout(300_000);

    for (const [slug, route] of desktopRoutes) {
      const runtimeErrors: string[] = [];
      const onPageError = (error: Error) => runtimeErrors.push(error.message);
      const onConsole = (message: ConsoleMessage) => {
        if (message.type() === "error") runtimeErrors.push(message.text());
      };
      page.on("pageerror", onPageError);
      page.on("console", onConsole);

      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), `${route} HTTP status`).toBeLessThan(400);
      await expect(page.locator("main")).toBeVisible();
      await page.screenshot({
        path: path.join(evidenceDir, `18-desktop-${slug}-rc1.png`),
        fullPage: true,
        animations: "disabled",
      });
      expect(
        runtimeErrors.filter((line) =>
          /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line)
        ),
        `${route} runtime errors`
      ).toEqual([]);

      page.off("pageerror", onPageError);
      page.off("console", onConsole);
    }
  });

  test("mobile routes", async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({
      storageState: process.env.E2E_AUTH_FILE ?? ".data/e2e-auth-3100.json",
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    for (const [slug, route] of mobileRoutes) {
      const runtimeErrors: string[] = [];
      const onPageError = (error: Error) => runtimeErrors.push(error.message);
      const onConsole = (message: ConsoleMessage) => {
        if (message.type() === "error") runtimeErrors.push(message.text());
      };
      page.on("pageerror", onPageError);
      page.on("console", onConsole);

      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), `${route} HTTP status`).toBeLessThan(400);
      await expect(page.locator("body")).toBeVisible();
      await page.screenshot({
        path: path.join(evidenceDir, `18-mobile-${slug}-rc1.png`),
        fullPage: true,
        animations: "disabled",
      });
      expect(
        runtimeErrors.filter((line) =>
          /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line)
        ),
        `${route} runtime errors`
      ).toEqual([]);

      page.off("pageerror", onPageError);
      page.off("console", onConsole);
    }

    await context.close();
  });
});
