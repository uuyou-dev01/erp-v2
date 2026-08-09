import { describe, expect, it } from "vitest";
import {
  listCapturePlatformAdapters,
  resolveCapturePlatform,
} from "@/lib/capture/platform-adapters";

describe("capture platform adapters", () => {
  it("extracts a deterministic Xianyu listing identity", () => {
    const result = resolveCapturePlatform({
      normalizedUrl: "https://www.goofish.com/item?id=123456",
      sourceText: "¥ 1,288",
    });
    expect(result.platformName).toBe("闲鱼");
    expect(result.externalListingId).toBe("123456");
    expect(result.claims).toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldName: "amount", value: "1288" })])
    );
  });

  it("recognizes Qiandao and Mercari source ids", () => {
    expect(
      resolveCapturePlatform({ normalizedUrl: "https://www.qiandaoapp.com/goods/QD-88" })
        .externalListingId
    ).toBe("QD-88");
    expect(
      resolveCapturePlatform({ normalizedUrl: "https://m.qiandao.com/item/QD-MOBILE-1" })
    ).toMatchObject({ platformName: "千岛", externalListingId: "QD-MOBILE-1" });
    const mercari = resolveCapturePlatform({
      normalizedUrl: "https://jp.mercari.com/item/m123456789",
    });
    expect(mercari.platformName).toBe("Mercari");
    expect(mercari.externalListingId).toBe("m123456789");
    const mercariShops = resolveCapturePlatform({
      normalizedUrl: "https://jp.mercari.com/shops/product/PPGnk2WZvc2dY5eViefAJC",
    });
    expect(mercariShops.platformName).toBe("Mercari");
    expect(mercariShops.externalListingId).toBe("PPGnk2WZvc2dY5eViefAJC");
  });

  it("extracts order and tracking claims without trusting them as confirmed fields", () => {
    const result = resolveCapturePlatform({
      platformHint: "微信",
      sourceText: "订单号: WX-998877 物流单号: SF1234567890",
    });
    expect(result.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldName: "externalOrderNo", value: "WX-998877" }),
        expect.objectContaining({ fieldName: "trackingNo", value: "SF1234567890" }),
      ])
    );
  });

  it("identifies common platform families before deep content optimization exists", () => {
    expect(
      resolveCapturePlatform({ normalizedUrl: "https://www.amazon.co.jp/dp/B0ABC12345" })
    ).toMatchObject({ platformName: "Amazon", externalListingId: "B0ABC12345" });
    expect(
      resolveCapturePlatform({
        normalizedUrl: "https://page.auctions.yahoo.co.jp/jp/auction/x123456789",
      })
    ).toMatchObject({ platformName: "Yahoo拍卖", externalListingId: "x123456789" });
    expect(
      resolveCapturePlatform({
        normalizedUrl: "https://www.atmos-tokyo.com/products/example-shoe",
      })
    ).toMatchObject({ platformName: "Atmos", externalListingId: "example-shoe" });
    expect(
      resolveCapturePlatform({
        normalizedUrl: "https://www.atmos-tokyo.com/item/atmos/mabsu-ac049",
      })
    ).toMatchObject({ platformName: "Atmos", externalListingId: "mabsu-ac049" });
  });

  it("reports optimized, generic and identity-only adapter capabilities", () => {
    const adapters = listCapturePlatformAdapters();
    expect(adapters.find((adapter) => adapter.code === "MERCARI")).toMatchObject({
      parsingTier: "OPTIMIZED",
      contentVersion: "3",
    });
    expect(adapters.find((adapter) => adapter.code === "AMAZON")).toMatchObject({
      parsingTier: "IDENTITY_ONLY",
      contentVersion: null,
    });
    expect(adapters.find((adapter) => adapter.code === "ATMOS")).toMatchObject({
      parsingTier: "OPTIMIZED",
      contentVersion: "1",
    });
    expect(adapters.find((adapter) => adapter.code === "GOOFISH")).toMatchObject({
      parsingTier: "OPTIMIZED",
      contentVersion: "1",
    });
    expect(adapters.find((adapter) => adapter.code === "GENERIC")).toMatchObject({
      parsingTier: "GENERIC",
    });
  });
});
