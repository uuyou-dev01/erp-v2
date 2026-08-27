import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Check,
  CircleDot,
  Globe2,
  PackageCheck,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SetupPath, SetupStatus } from "@/lib/application/setup-status";
import { cn } from "@/lib/utils";

function withSetupReturnTo(href: string, returnTo = "/setup") {
  return `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
}

type SetupStep = {
  title: string;
  description: string;
  done: boolean;
  countLabel: string;
  href: string;
  actionLabel: string;
  icon: typeof Warehouse;
};

function StepRow({
  step,
  index,
  canManage,
}: {
  step: SetupStep;
  index: number;
  canManage: boolean;
}) {
  const Icon = step.icon;

  return (
    <li className="group grid gap-4 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center">
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
          step.done
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-border bg-background text-muted-foreground"
        )}
        aria-label={step.done ? "已完成" : `第 ${index + 1} 步`}
      >
        {step.done ? <Check className="h-4 w-4" /> : index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">{step.title}</h3>
          <span className="text-xs text-muted-foreground">{step.countLabel}</span>
        </div>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{step.description}</p>
      </div>
      {canManage ? (
        <Button asChild variant={step.done ? "outline" : "default"} size="sm">
          <Link href={step.href}>
            {step.done ? "查看" : step.actionLabel}
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">需管理员完成</span>
      )}
    </li>
  );
}

export function SetupChecklist({
  status,
  selectedPath,
  welcome,
}: {
  status: SetupStatus;
  selectedPath: SetupPath | null;
  welcome: boolean;
}) {
  const setupReturnTo = selectedPath ? `/setup?path=${selectedPath}` : "/setup";
  const foundationSteps: SetupStep[] = [
    {
      title: "设置仓库位置",
      description: "确定库存实际所在位置、是否可售，以及这个节点可以服务的市场。",
      done: status.hasLocation,
      countLabel: status.hasLocation ? `${status.locationCount} 个位置` : "尚未创建",
      href: withSetupReturnTo(
        status.hasLocation ? "/inventory/locations" : "/inventory/locations?create=1",
        setupReturnTo
      ),
      actionLabel: "设置位置",
      icon: Warehouse,
    },
    {
      title: "建立可交易 SKU",
      description: "单一商品可直接建独立 SKU；多规格商品需要建立至少一个具体规格。",
      done: status.hasOperationalSku,
      countLabel: status.hasOperationalSku
        ? `${status.operationalSkuCount} 个可交易 SKU`
        : "尚无可交易 SKU",
      href: withSetupReturnTo(
        status.hasOperationalSku ? "/inventory/skus" : "/inventory/skus/new",
        setupReturnTo
      ),
      actionLabel: "创建商品",
      icon: Boxes,
    },
    {
      title: "配置销售平台",
      description: "添加实际经营的平台、所属市场和默认币种，上架记录会使用这些信息。",
      done: status.hasPlatform,
      countLabel: status.hasPlatform ? `${status.platformCount} 个平台` : "尚未配置",
      href: withSetupReturnTo(
        status.hasPlatform ? "/listing/platforms" : "/listing/platforms/new",
        setupReturnTo
      ),
      actionLabel: "添加平台",
      icon: Globe2,
    },
  ];

  const branchStep: SetupStep | null =
    selectedPath === "existing"
      ? {
          title: "录入已有库存",
          description: "把启用系统前已经存在的库存按商品、位置、数量和成本正式开账。",
          done: status.hasInventory,
          countLabel: status.hasInventory
            ? `${status.inventoryRecordCount || status.openingStockCount} 条库存记录`
            : "等待首次开账",
          href: withSetupReturnTo(
            status.hasInventory ? "/inventory/opening-stock" : "/inventory/opening-stock/new",
            setupReturnTo
          ),
          actionLabel: "录入期初库存",
          icon: PackageCheck,
        }
      : selectedPath === "purchase"
        ? {
            title: "建立首张采购单",
            description: "如果现在没有库存，从采购单开始；收货后系统会生成库存与流水。",
            done: status.hasPurchaseOrder,
            countLabel: status.hasPurchaseOrder
              ? `${status.purchaseOrderCount} 张采购单`
              : "尚未开始采购",
            href: withSetupReturnTo(
              status.hasPurchaseOrder ? "/procurement" : "/procurement/new",
              setupReturnTo
            ),
            actionLabel: "新建采购单",
            icon: ShoppingCart,
          }
        : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="border-b pb-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-primary">
                {welcome ? "企业空间已创建" : "企业启用清单"}
              </p>
              <Badge variant="outline">{status.storeCurrency}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              配置 {status.storeName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              清单按真实业务数据自动更新。可以随时离开，再从工作台继续。
            </p>
          </div>
          <div className="min-w-48">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>核心进度</span>
              <span className="font-medium">
                {status.completedCoreCount}/{status.coreStepCount}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={status.coreStepCount}
              aria-valuenow={status.completedCoreCount}
              aria-label="企业启用进度"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{
                  width: `${(status.completedCoreCount / status.coreStepCount) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {!status.canManageSetup ? (
        <div className="border-l-4 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm">
          当前角色可以查看启用状态，但不能管理企业基础配置。请联系企业所有者或管理员完成未配置项目。
        </div>
      ) : null}

      <section aria-labelledby="setup-foundation-title">
        <div className="mb-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            基础配置
          </p>
          <h2 id="setup-foundation-title" className="mt-1 text-lg font-semibold">
            先让商品有地方存、有渠道卖
          </h2>
        </div>
        <ol className="divide-y border-y">
          {foundationSteps.map((step, index) => (
            <StepRow key={step.title} step={step} index={index} canManage={status.canManageSetup} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="setup-path-title" className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            首批库存
          </p>
          <h2 id="setup-path-title" className="mt-1 text-lg font-semibold">
            选择符合现状的开始方式
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            两条路径都可以以后再用，这里只决定当前下一步。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/setup?path=existing"
            className={cn(
              "group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedPath === "existing" && "border-primary bg-primary/5"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <PackageCheck className="h-5 w-5 text-primary" />
              {status.hasInventory ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <CircleDot className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <h3 className="mt-3 font-medium">已有库存迁入</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              适合从表格或旧系统迁移当前库存，并保留成本起点。
            </p>
          </Link>
          <Link
            href="/setup?path=purchase"
            className={cn(
              "group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedPath === "purchase" && "border-primary bg-primary/5"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <ShoppingCart className="h-5 w-5 text-primary" />
              {status.hasPurchaseOrder ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <CircleDot className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <h3 className="mt-3 font-medium">从零采购</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              适合当前没有库存，从第一张采购单、物流和收货开始。
            </p>
          </Link>
        </div>

        {branchStep ? (
          <ol className="border-y">
            <StepRow step={branchStep} index={3} canManage={status.canManageSetup} />
          </ol>
        ) : (
          <div className="flex items-start gap-3 border-y py-5 text-sm text-muted-foreground">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border">
              4
            </span>
            <p className="pt-2">选择一种开始方式后，这里会显示对应的操作入口。</p>
          </div>
        )}
      </section>

      <footer className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">
            {status.isCoreComplete ? "核心配置已就绪" : "未完成的项目不会丢失"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.isCoreComplete
              ? "现在可以进入工作台处理采购、库存与上架任务。"
              : "先完成最符合当前业务的一项，也可以稍后继续。"}
          </p>
        </div>
        <Button asChild variant={status.isCoreComplete ? "default" : "outline"}>
          <Link href="/workbench">
            {status.isCoreComplete ? "进入工作台" : "暂时跳过"}
            <ArrowRight />
          </Link>
        </Button>
      </footer>
    </div>
  );
}
