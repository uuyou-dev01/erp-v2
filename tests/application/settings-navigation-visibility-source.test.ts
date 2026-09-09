import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("settings navigation visibility source", () => {
  it("passes the active role through the dashboard shell and settings layout", () => {
    expect(source("components/layout/dashboard-shell.tsx")).toContain(
      "<Header\n          role={role}"
    );
    expect(source("app/(dashboard)/settings/layout.tsx")).toContain(
      "<SettingsNav role={context.role} />"
    );
  });

  it("only renders settings areas with an allowed destination", () => {
    const header = source("components/layout/header.tsx");
    const settingsNav = source("components/settings/settings-nav.tsx");

    expect(header).toContain('settingsAreaRoutes["/settings/company"].find');
    expect(header).toContain('settingsAreaRoutes["/settings/system"].find');
    expect(header).toContain("href={companySettingsHref}");
    expect(header).toContain("href={systemSettingsHref}");
    expect(settingsNav).toContain(
      "area.matches.find((href) => isNavigationHrefAllowed(role, href))"
    );
    expect(settingsNav).toContain("allowedHref ? [{ ...area, href: allowedHref }] : []");
  });

  it("labels the header icon controls", () => {
    const header = source("components/layout/header.tsx");
    expect(header).toContain('aria-label="打开主导航"');
    expect(header).toContain('aria-label="打开全局搜索"');
    expect(header).toContain('<Settings2 className="h-3.5 w-3.5 text-muted-foreground" />');
  });

  it("exposes task collaboration as an enterprise relationship view", () => {
    const company = source("app/(dashboard)/settings/company/page.tsx");
    const overview = source("app/(dashboard)/settings/warehouse-collaboration/page.tsx");
    expect(company).toContain('title: "任务协作"');
    expect(company).toContain('href: "/settings/warehouse-collaboration"');
    expect(overview).toContain("外部任务协作者");
    expect(overview).toContain("暂停某个仓库只会撤销该协作范围");
  });

  it("links shipment warehouses to settings with a preserved return path", () => {
    const shippingForm = source("components/workbench/action-drawer-forms/index.tsx");
    const locationPage = source("app/(dashboard)/inventory/locations/[id]/page.tsx");
    expect(shippingForm).toContain("仓库设置");
    expect(shippingForm).toContain("encodeURIComponent(returnTo)");
    expect(locationPage).toContain("safeInternalReturnPath(returnTo)");
    expect(locationPage).toContain("返回上一页");
  });
});
