import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMissingSetupLabels, type SetupStatus } from "@/lib/application/setup-status";

export function SetupResumeBanner({ status }: { status: SetupStatus }) {
  if (!status.shouldShowWorkbenchPrompt) return null;
  const missing = getMissingSetupLabels(status);

  return (
    <aside
      aria-label="继续企业配置"
      className="mb-6 flex flex-col gap-4 border-l-4 border-primary bg-primary/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium">继续完成企业启用配置</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            还差 {missing.join("、")}。清单会根据已经创建的数据自动恢复进度。
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link href="/setup">
          继续配置
          <ArrowRight />
        </Link>
      </Button>
    </aside>
  );
}
