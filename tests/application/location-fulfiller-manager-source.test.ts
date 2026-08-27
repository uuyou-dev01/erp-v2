import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(process.cwd(), "components/inventory/location-fulfiller-manager.tsx"),
  "utf8"
);
const uiGuideSource = readFileSync(join(process.cwd(), "docs/ui.md"), "utf8");

describe("location fulfiller progressive disclosure", () => {
  it("keeps invitation fields inside an explicitly opened dialog", () => {
    const dialogIndex = componentSource.indexOf("<dialog");
    const invitationFormIndex = componentSource.indexOf("<form onSubmit={invite}");

    expect(componentSource).toContain("添加仓库协作人");
    expect(dialogIndex).toBeGreaterThan(-1);
    expect(invitationFormIndex).toBeGreaterThan(dialogIndex);
    expect(componentSource).toContain('aria-labelledby="fulfiller-dialog-title"');
  });

  it("documents state-first progressive disclosure as a shared UI rule", () => {
    expect(uiGuideSource).toContain("核心交互原则：状态优先、模式分离与渐进披露");
    expect(uiGuideSource).toContain("Progressive Disclosure（渐进披露）是系统级交互原则");
    expect(uiGuideSource).toContain("页面主层级先呈现当前对象、名单、状态、摘要与历史");
    expect(uiGuideSource).toContain("默认模式必须唯一");
    expect(uiGuideSource).toContain("何时允许平铺表单");
    expect(uiGuideSource).toContain("合理例外");
    expect(uiGuideSource).toContain("设计与开发验收");
  });
});
