# Route Navigation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the ERP sidebar around the current operating model, expose team/store/account configuration, and remove duplicated dashboard reporting entry points.

**Architecture:** Keep existing business URLs for detail and workflow pages, but rebuild the navigation configuration as the source of truth. Merge the old dashboard statistics entry into `/reports` by deleting the `/dashboard` page and redirecting the root route to `/workbench`. Use tests to guard the intended navigation groups and command shortcuts.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Playwright, lucide-react navigation metadata.

---

## Tasks

### Task 1: Guard the new navigation structure

**Files:**
- Create: `tests/application/navigation.test.ts`
- Modify: `config/navigation.ts`

- [x] Write a failing Vitest test that asserts the sidebar groups include operations, business documents, inventory/product, listing/platform, reports, and system settings.
- [x] Assert `/settings/team`, `/settings/stores`, `/notifications`, and `/reports/team` are reachable from navigation.
- [x] Assert `/dashboard` is no longer a sidebar or command-palette entry.
- [x] Run `npm run test -- tests/application/navigation.test.ts` and verify it fails before implementation.

### Task 2: Rebuild navigation metadata

**Files:**
- Modify: `config/navigation.ts`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/command/command-palette.tsx` only if command shortcuts require shape changes.

- [x] Replace the old operations/settings split with the approved groups.
- [x] Keep submenu behavior but make system settings a normal navigation group.
- [x] Add notifications, team report, team member, store management, and login switcher entries.
- [x] Remove dashboard from sidebar and command shortcuts.
- [x] Run the navigation test and verify it passes.

### Task 3: Remove duplicated dashboard reporting route

**Files:**
- Delete: `app/(dashboard)/dashboard/page.tsx`
- Delete if unused: `components/dashboard/dashboard-stats.tsx`
- Delete if unused: `components/dashboard/dashboard-charts.tsx`
- Modify: `app/page.tsx`
- Modify: actions that revalidate `/dashboard`

- [x] Change `/` to redirect to `/workbench`.
- [x] Remove the old `/dashboard` page and unused dashboard-only components.
- [x] Replace `revalidatePath("/dashboard")` with `/reports` where reporting cache refresh is intended.
- [x] Search for `/dashboard` references and remove or justify any remaining references.

### Task 4: E2E coverage and verification

**Files:**
- Modify: `tests/e2e/workbench-collaboration.spec.ts`

- [x] Add smoke assertions for sidebar links: 通知, 采购单据, 销售平台, 团队工作量, 团队成员, 店铺管理.
- [x] Run `npx tsc --noEmit`, `npm run test`, `npm run build`, and `npm run test:e2e`.
- [x] Commit the scoped route/navigation consolidation.
