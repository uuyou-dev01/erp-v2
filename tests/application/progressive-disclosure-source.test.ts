import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("system progressive disclosure", () => {
  it("provides one accessible action container for dialogs and drawers", () => {
    const component = source("components/ui/action-dialog.tsx");

    expect(component).toContain("dialog.showModal()");
    expect(component).toContain("aria-labelledby={titleId}");
    expect(component).toContain('placement?: "center" | "end"');
    expect(component).toContain("onCancel");
  });

  it("keeps warehouse details visible and moves editing into a drawer", () => {
    const page = source("app/(dashboard)/inventory/locations/[id]/page.tsx");
    const dialog = source("components/inventory/location-edit-dialog.tsx");

    expect(page).toContain("<LocationEditDialog");
    expect(page).not.toContain("<LocationForm");
    expect(dialog).toContain('placement="end"');
    expect(dialog).toContain('mode="dialog"');
  });

  it("moves store creation behind the list action", () => {
    const component = source("components/team/store-management-panel.tsx");
    const dialogIndex = component.indexOf("<ActionDialog");
    const formIndex = component.indexOf("<form onSubmit={submitStoreCreate}");

    expect(component).toContain("店铺列表");
    expect(component).toContain("新增店铺");
    expect(dialogIndex).toBeGreaterThan(-1);
    expect(formIndex).toBeGreaterThan(dialogIndex);
  });

  it("moves sales and procurement line creation into list actions", () => {
    const salesPage = source("app/(dashboard)/sales/[id]/page.tsx");
    const purchasePage = source("app/(dashboard)/procurement/[id]/page.tsx");

    expect(salesPage).toContain("<AddOrderLineDialog");
    expect(salesPage).not.toContain("<AddOrderLineForm");
    expect(purchasePage).toContain("<AddPurchaseLineDialog");
    expect(purchasePage).not.toContain("<AddPurchaseLineForm");
  });

  it("keeps connection and business-structure forms inside action containers", () => {
    const connections = source("components/settings/organization-connections-manager.tsx");
    const businessStructure = source("components/settings/business-structure-manager.tsx");

    expect(connections.indexOf("<form onSubmit={request}")).toBeGreaterThan(
      connections.indexOf("<ActionDialog")
    );
    expect(businessStructure).toContain('title="创建服务协议"');
    expect(businessStructure).toContain('placement="end"');
    expect(businessStructure).toContain('title="授予对象权限"');
  });

  it("keeps personal settings in read mode until an edit action is chosen", () => {
    const personalSettings = source("components/settings/account-settings-form.tsx");
    const organizations = source("components/settings/my-organizations.tsx");
    const firstDialogIndex = personalSettings.indexOf("<ActionDialog");
    const profileFormIndex = personalSettings.indexOf("<form onSubmit={submitProfile}");
    const passwordFormIndex = personalSettings.indexOf("<form onSubmit={submitPassword}");

    expect(personalSettings).toContain("编辑资料");
    expect(personalSettings).toContain("修改密码");
    expect(firstDialogIndex).toBeGreaterThan(-1);
    expect(profileFormIndex).toBeGreaterThan(firstDialogIndex);
    expect(passwordFormIndex).toBeGreaterThan(firstDialogIndex);
    expect(organizations).not.toContain('<p className="flex items-center gap-2 font-medium">');
    expect(organizations).toContain('<div className="flex items-center gap-2 font-medium">');
  });
});
