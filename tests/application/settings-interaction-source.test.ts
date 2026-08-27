import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings interaction source hygiene", () => {
  it("uses structured inline errors for team-member invitations", () => {
    const actionSource = readFileSync(
      join(process.cwd(), "app/actions/organization-invitations.ts"),
      "utf8"
    );
    const componentSource = readFileSync(
      join(process.cwd(), "components/team/team-member-table.tsx"),
      "utf8"
    );

    expect(actionSource).toMatch(/export async function createTeamInvitationAction/);
    expect(componentSource).toMatch(/createTeamInvitationAction/);
    expect(componentSource).not.toMatch(/action=\{createTeamMember\}/);
    expect(componentSource).toMatch(/role="alert"/);
  });

  it("uses structured inline errors for team-member deactivation", () => {
    const actionSource = readFileSync(join(process.cwd(), "app/actions/team.ts"), "utf8");
    const componentSource = readFileSync(
      join(process.cwd(), "components/team/team-member-table.tsx"),
      "utf8"
    );

    expect(actionSource).toMatch(/export async function deactivateTeamMemberAction/);
    expect(componentSource).toMatch(/deactivateTeamMemberAction/);
    expect(componentSource).not.toMatch(/action=\{deactivateTeamMember\}/);
    expect(componentSource).toMatch(/role="alert"/);
  });

  it("uses structured inline errors for managed-store creation", () => {
    const actionSource = readFileSync(join(process.cwd(), "app/actions/store-settings.ts"), "utf8");
    const componentSource = readFileSync(
      join(process.cwd(), "components/team/store-management-panel.tsx"),
      "utf8"
    );

    expect(actionSource).toMatch(/export async function createManagedStoreAction/);
    expect(componentSource).toMatch(/createManagedStoreAction/);
    expect(componentSource).not.toMatch(/action=\{createManagedStore\}/);
    expect(componentSource).toMatch(/storeCreateError/);
  });
});
