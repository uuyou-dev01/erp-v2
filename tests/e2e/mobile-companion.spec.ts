import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { deleteMobileAsset } from "@/lib/mobile/asset-storage";

const prisma = new PrismaClient();

test.describe("ERP mobile companion", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("records a market price and a purchase, then continues the purchase task", async ({
    page,
  }) => {
    const runId = Date.now().toString(36);

    await page.goto("/m");
    await expect(page.getByRole("heading", { name: /好，E2E/ })).toBeVisible();
    await expect(page.getByText("现在需要处理")).toBeVisible();
    await expect
      .poll(async () => (await page.request.get("/api/v1/mobile/devices")).status())
      .toBe(200);

    await page.goto("/m/capture/price");
    await expect(page.getByRole("heading", { name: "记录市场价格" })).toBeVisible();
    await page.getByPlaceholder("例如：Bearbrick 1000% 黑色").fill(`E2E 市场价格 ${runId}`);
    await page.getByPlaceholder("0.00").fill("1288");
    await page
      .getByPlaceholder("粘贴 Mercari、闲鱼等商品链接")
      .fill(`https://www.goofish.com/item?id=price-${runId}&utm_source=e2e`);
    await page.getByRole("button", { name: "保存价格事实" }).click();
    await expect(page.getByText("价格证据已保存，等待匹配 SKU")).toBeVisible();

    const capturesAfterPrice = await page.request.get("/api/v1/product-intelligence/captures");
    expect(capturesAfterPrice.ok()).toBe(true);
    const pricePayload = (await capturesAfterPrice.json()) as {
      captures: Array<{ title: string | null; status: string; businessIntent: string }>;
    };
    expect(
      pricePayload.captures.some(
        (capture) =>
          capture.title === `E2E 市场价格 ${runId}` &&
          capture.status === "NEEDS_REVIEW" &&
          capture.businessIntent === "OBSERVE_PRICE"
      )
    ).toBe(true);

    await page.goto("/m/capture/purchase");
    await expect(page.getByRole("heading", { name: "登记已经购买" })).toBeVisible();
    await page.getByPlaceholder("卖家备注名").fill(`E2E 卖家 ${runId}`);
    await page.getByPlaceholder("可留空").fill(`ORDER-${runId}`);
    await page.getByLabel("商品 1 名称").fill(`E2E 手机购入 ${runId}`);
    await page.getByLabel("商品 1 规格").fill("蓝色");
    await page.getByLabel("商品 1 数量").fill("1");
    await page.getByLabel("商品 1 单价").fill("399");
    await page.getByRole("button", { name: "这是新商品，创建待整理 SKU" }).click();
    await page.getByRole("button", { name: "确认已经购买" }).click();
    await expect(page.getByText("购入已登记，后续物流节点已进入待办")).toBeVisible();

    await page.goto("/m/tasks");
    await expect(page.getByRole("heading", { name: "待办" })).toBeVisible();
    const task = page
      .locator("a")
      .filter({ hasText: `E2E 卖家 ${runId}` })
      .first();
    await expect(task).toBeVisible();
    await task.click();
    await expect(page.getByText("填写物流", { exact: true }).first()).toBeVisible();
    await page.getByPlaceholder("扫描或粘贴单号").fill(`SF${runId.toUpperCase()}123456`);
    const destination = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "选择仓库或集运点" }) });
    await destination.selectOption({ index: 1 });
    await page.getByRole("button", { name: "填写物流" }).click();
    await expect(page).toHaveURL(/\/m$/);
    await expect
      .poll(async () => {
        const response = await page.request.get("/api/v1/mobile/tasks?scope=today&limit=80");
        const body = (await response.json()) as {
          items: Array<{ title: string; primaryAction: string }>;
        };
        return body.items.some(
          (item) =>
            item.title.includes(`E2E 卖家 ${runId}`) && item.primaryAction === "receivePurchase"
        );
      })
      .toBe(true);
  });

  test("mobile API exposes paginated tasks and notification controls", async ({ page }) => {
    await page.goto("/m");
    await expect(page.getByRole("heading", { name: /好，E2E/ })).toBeVisible();
    const home = await page.request.get("/api/v1/mobile/home");
    expect(home.ok()).toBe(true);
    const tasks = await page.request.get("/api/v1/mobile/tasks?scope=today&limit=2");
    expect(tasks.ok()).toBe(true);
    const payload = (await tasks.json()) as { items: unknown[]; nextCursor: string | null };
    expect(payload.items.length).toBeLessThanOrEqual(2);
    const notifications = await page.request.get("/api/v1/mobile/notifications?limit=2");
    expect(notifications.ok()).toBe(true);
    expect((await page.request.post("/api/v1/mobile/notifications/read-all")).ok()).toBe(true);
  });

  test("uploads screenshot evidence and extracts an OCR price candidate", async ({ page }) => {
    await page.goto("/m");
    await expect(page.getByRole("heading", { name: /好，E2E/ })).toBeVisible();
    expect(
      (
        await page.request.post("/api/v1/mobile/devices/register", {
          data: { installationId: `ocr-${Date.now()}`, name: "OCR Test", clientKind: "MOBILE_PWA" },
        })
      ).ok()
    ).toBe(true);
    await page.setViewportSize({ width: 900, height: 420 });
    await page.setContent(
      '<main style="width:900px;height:420px;background:white;color:black;display:grid;place-items:center;font:700 180px monospace">1288</main>'
    );
    const screenshot = await page.screenshot({ type: "png" });
    const preparedResponse = await page.request.post("/api/v1/mobile/assets/presign", {
      data: { mimeType: "image/png", byteSize: screenshot.byteLength },
    });
    expect(preparedResponse.ok()).toBe(true);
    const prepared = (await preparedResponse.json()) as { assetId: string; uploadUrl: string };
    const upload = await page.request.put(prepared.uploadUrl, {
      data: screenshot,
      headers: { "content-type": "image/png" },
    });
    expect(upload.ok()).toBe(true);
    const ocr = await page.request.post("/api/v1/mobile/ocr", {
      data: { assetId: prepared.assetId, language: "eng" },
      timeout: 60_000,
    });
    expect(ocr.ok()).toBe(true);
    const result = (await ocr.json()) as {
      text: string;
      priceCandidates: Array<{ value: string }>;
    };
    expect(result.text).toContain("1288");
    expect(result.priceCandidates.some((candidate) => candidate.value.startsWith("1288"))).toBe(
      true
    );
  });

  test("captures a mobile photo directly into an item-unit inventory record", async ({ page }) => {
    const runId = Date.now().toString(36);
    const [sku, location] = await Promise.all([
      prisma.sKU.create({
        data: {
          storeId: "store_1",
          code: `PHOTO-${runId}`.toUpperCase(),
          name: `E2E 单件照片 ${runId}`,
          catalogRole: "SIMPLE",
          nameSource: "MANUAL",
          codeSource: "MANUAL",
        },
      }),
      prisma.location.findFirstOrThrow({ where: { storeId: "store_1" } }),
    ]);
    const item = await prisma.itemUnit.create({
      data: {
        storeId: "store_1",
        skuId: sku.id,
        locationId: location.id,
        unitCost: "1",
        costCurrency: "CNY",
        sourceType: "MANUAL",
        sourceId: `mobile-photo-e2e-${runId}`,
        status: "AVAILABLE",
        photos: [],
      },
    });

    try {
      await page.goto(`/m/items/${item.id}/photos`);
      await expect(page.getByRole("heading", { name: sku.name })).toBeVisible();
      await expect
        .poll(async () => (await page.request.get("/api/v1/mobile/devices")).status())
        .toBe(200);

      const onePixelPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=",
        "base64"
      );
      await page.locator('input[type="file"]').setInputFiles({
        name: `item-${runId}.png`,
        mimeType: "image/png",
        buffer: onePixelPng,
      });
      await expect(page.getByText("已同步 1 张照片到单件档案")).toBeVisible();

      const saved = await prisma.itemUnit.findUniqueOrThrow({ where: { id: item.id } });
      expect(Array.isArray(saved.photos) ? saved.photos : []).toHaveLength(1);
      expect(
        await prisma.mobileAsset.count({ where: { itemUnitId: item.id, status: "READY" } })
      ).toBe(1);
    } finally {
      const assets = await prisma.mobileAsset.findMany({
        where: { itemUnitId: item.id },
        select: { id: true, storageKey: true },
      });
      await prisma.itemUnit.delete({ where: { id: item.id } }).catch(() => undefined);
      for (const asset of assets) await deleteMobileAsset(asset.storageKey).catch(() => undefined);
      await prisma.mobileAsset.deleteMany({
        where: { id: { in: assets.map((asset) => asset.id) } },
      });
      await prisma.sKU.deleteMany({ where: { id: sku.id } });
    }
  });

  test("enforces idempotency and optimistic concurrency for mobile actions", async ({ page }) => {
    const runId = Date.now().toString(36);
    await page.goto("/m/capture/purchase");
    await expect(page.getByRole("heading", { name: "登记已经购买" })).toBeVisible();
    await page.getByPlaceholder("卖家备注名").fill(`E2E 幂等卖家 ${runId}`);
    await page.getByLabel("商品 1 名称").fill(`E2E 幂等商品 ${runId}`);
    await page.getByLabel("商品 1 单价").fill("88");
    await page.getByRole("button", { name: "这是新商品，创建待整理 SKU" }).click();
    await page.getByRole("button", { name: "确认已经购买" }).click();
    await expect(page.getByText("购入已登记，后续物流节点已进入待办")).toBeVisible();

    const tasksResponse = await page.request.get("/api/v1/mobile/tasks?scope=today&limit=80");
    const tasks = (await tasksResponse.json()) as {
      items: Array<{ id: string; title: string; primaryAction: string }>;
    };
    const workItem = tasks.items.find(
      (item) =>
        item.title.includes(`E2E 幂等卖家 ${runId}`) && item.primaryAction === "fillLogistics"
    );
    expect(workItem).toBeTruthy();
    const detailResponse = await page.request.get(
      `/api/v1/mobile/tasks/${encodeURIComponent(workItem!.id)}`
    );
    const detail = (await detailResponse.json()) as {
      expectedVersion: string;
      locations: Array<{ id: string }>;
    };
    expect(detail.locations.length).toBeGreaterThan(0);
    const key = crypto.randomUUID();
    const payload = {
      expectedVersion: detail.expectedVersion,
      fields: {
        purchaseTrackingNo: `IDEM-${runId}`,
        destinationLocationId: detail.locations[0].id,
      },
    };
    const url = `/api/v1/mobile/tasks/${encodeURIComponent(workItem!.id)}/actions/fillLogistics`;
    const first = await page.request.post(url, {
      headers: { "idempotency-key": key },
      data: payload,
    });
    expect(first.ok()).toBe(true);
    const replay = await page.request.post(url, {
      headers: { "idempotency-key": key },
      data: payload,
    });
    expect(replay.ok()).toBe(true);
    const keyReuse = await page.request.post(url, {
      headers: { "idempotency-key": key },
      data: { ...payload, fields: { ...payload.fields, purchaseTrackingNo: "DIFFERENT" } },
    });
    expect(keyReuse.status()).toBe(409);
    const stale = await page.request.post(url, {
      headers: { "idempotency-key": crypto.randomUUID() },
      data: payload,
    });
    expect(stale.status()).toBe(409);
  });

  test("selects an operational SKU and carries the exact skuId into procurement", async ({
    page,
  }) => {
    const runId = Date.now().toString(36);
    const sku = await prisma.sKU.create({
      data: {
        storeId: "store_1",
        code: `MATCH-${runId}`.toUpperCase(),
        name: `E2E 正式商品 ${runId}`,
        catalogRole: "SIMPLE",
        nameSource: "MANUAL",
        codeSource: "MANUAL",
      },
    });
    try {
      await page.goto("/m/capture/purchase");
      await page.getByPlaceholder("卖家备注名").fill(`E2E 匹配卖家 ${runId}`);
      await page.getByLabel("商品 1 名称").fill(sku.name);
      await page.getByLabel("商品 1 单价").fill("199");
      const candidate = page.locator("button").filter({ hasText: sku.code }).first();
      await expect(candidate).toBeVisible();
      await candidate.click();
      await expect(
        page.getByText("采购行将直接使用这个正式 SKU，不再按名称重新猜测。")
      ).toBeVisible();
      await page.getByRole("button", { name: "确认已经购买" }).click();
      await expect(page.getByText("购入已登记，后续物流节点已进入待办")).toBeVisible();

      const purchaseLine = await prisma.purchaseLine.findFirst({
        where: { skuId: sku.id, purchaseOrder: { supplierName: `E2E 匹配卖家 ${runId}` } },
      });
      expect(purchaseLine?.skuId).toBe(sku.id);
      const createdDuplicate = await prisma.sKU.count({
        where: { storeId: "store_1", name: sku.name },
      });
      expect(createdDuplicate).toBe(1);
    } finally {
      const orders = await prisma.purchaseOrder.findMany({
        where: { storeId: "store_1", supplierName: `E2E 匹配卖家 ${runId}` },
        select: { id: true },
      });
      await prisma.captureBusinessLink.deleteMany({ where: { refType: "SKU", refId: sku.id } });
      await prisma.productIntelligenceObservation.deleteMany({
        where: { item: { skuId: sku.id } },
      });
      await prisma.productIntelligenceItem.deleteMany({ where: { skuId: sku.id } });
      await prisma.skuAlias.deleteMany({ where: { skuId: sku.id } });
      await prisma.quickEntry.deleteMany({ where: { generatedSkuId: sku.id } });
      await prisma.purchaseLine.deleteMany({
        where: { purchaseOrderId: { in: orders.map((order) => order.id) } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { id: { in: orders.map((order) => order.id) } },
      });
      await prisma.sKU.delete({ where: { id: sku.id } });
    }
  });

  test("revoked devices cannot mutate and evidence is isolated by user", async ({
    page,
    browser,
  }) => {
    await page.goto("/m");
    const installationId = `security-${Date.now()}`;
    const registration = await page.request.post("/api/v1/mobile/devices/register", {
      data: { installationId, name: "Security Test", clientKind: "MOBILE_PWA" },
    });
    const registered = (await registration.json()) as { device: { id: string } };
    expect(registration.ok()).toBe(true);
    expect((await page.request.delete(`/api/v1/mobile/devices/${registered.device.id}`)).ok()).toBe(
      true
    );
    await page.context().addCookies([
      {
        name: "erp_mobile_device",
        value: registered.device.id,
        url: "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const denied = await page.request.post("/api/v1/mobile/assets/presign", {
      data: { mimeType: "image/png", byteSize: 20 },
    });
    expect(denied.status()).toBe(401);
    expect(
      (
        await page.request.post("/api/v1/mobile/devices/register", {
          data: { installationId, name: "Security Test", clientKind: "MOBILE_PWA" },
        })
      ).ok()
    ).toBe(true);

    const preparedResponse = await page.request.post("/api/v1/mobile/assets/presign", {
      data: { mimeType: "image/png", byteSize: 20 },
    });
    const prepared = (await preparedResponse.json()) as { assetId: string };
    expect(preparedResponse.ok()).toBe(true);

    const organization = await prisma.organization.findFirstOrThrow({
      where: { stores: { some: { id: "store_1" } } },
    });
    const email = `mobile-isolation-${Date.now()}@example.com`;
    const password = "mobile-isolation-password";
    const other = await prisma.user.create({
      data: {
        email,
        name: "隔离测试用户",
        password: await hashPassword(password),
        role: "VIEWER",
        storeId: "store_1",
      },
    });
    await prisma.membership.create({
      data: { organizationId: organization.id, userId: other.id, role: "VIEWER", status: "ACTIVE" },
    });
    await prisma.storeAccess.create({
      data: { storeId: "store_1", userId: other.id, role: "VIEWER" },
    });
    const context = await browser.newContext();
    try {
      const otherPage = await context.newPage();
      await otherPage.goto("/login");
      await otherPage.getByLabel("邮箱").fill(email);
      await otherPage.getByLabel("密码", { exact: true }).fill(password);
      await otherPage.getByRole("button", { name: "登录" }).click();
      await expect(otherPage.getByRole("heading", { name: "工作台" })).toBeVisible();
      await otherPage.goto("/m");
      await expect(otherPage.getByRole("heading", { name: /好，隔离测试用户/ })).toBeVisible();
      expect(
        (
          await otherPage.request.post("/api/v1/mobile/devices/register", {
            data: { installationId: `other-${Date.now()}`, name: "Other Device" },
          })
        ).ok()
      ).toBe(true);
      const crossUser = await otherPage.request.post("/api/v1/product-intelligence/captures", {
        headers: { "idempotency-key": crypto.randomUUID() },
        data: {
          captureType: "SCREENSHOT",
          businessIntent: "UNDECIDED",
          title: "越权测试",
          assetIds: [prepared.assetId],
        },
      });
      expect(crossUser.status()).toBe(401);
    } finally {
      await context.close();
      await prisma.pushSubscription.deleteMany({ where: { userId: other.id } });
      await prisma.companionDevice.deleteMany({ where: { userId: other.id } });
      await prisma.storeAccess.deleteMany({ where: { userId: other.id } });
      await prisma.membership.deleteMany({ where: { userId: other.id } });
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
