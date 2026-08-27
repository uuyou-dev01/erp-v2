import { redirect } from "next/navigation";
import { clearCurrentUser } from "@/app/actions/session";
import {
  getCollaborationShippingTasks,
  getMyCollaborationWorkMetrics,
} from "@/app/actions/collaboration-tasks";
import { ShippingTaskList } from "@/components/collaboration/shipping-task-list";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedUser, requireUserContext } from "@/lib/auth/user-context";
import { LogOut, PackageCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CollaborationTasksPage() {
  const user = await requireAuthenticatedUser().catch(() => null);
  if (!user) redirect(`/login?next=${encodeURIComponent("/collaboration/tasks")}`);
  const dashboardContext = await requireUserContext().catch(() => null);
  if (dashboardContext) redirect("/workbench?scope=warehouse");
  const [tasks, workload] = await Promise.all([
    getCollaborationShippingTasks(),
    getMyCollaborationWorkMetrics(),
  ]);
  const myRow = workload.rows.find((row) => row.userId === user.id);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">仓库发货协作</p>
              <p className="text-xs text-muted-foreground">{user.name || user.email}</p>
            </div>
          </div>
          <form action={clearCurrentUser}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="h-4 w-4" />
              退出
            </Button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-7 md:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">我的发货任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            这里只显示指派给你的订单；企业采购、成本和其他仓库信息不会显示。
          </p>
        </div>
        <section className="mb-6 border-y py-4" aria-labelledby="my-workload-title">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p id="my-workload-title" className="text-xs text-muted-foreground">
                累计工作记录
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{workload.eventCount}</p>
            </div>
            {workload.types.map((type) => (
              <div key={type.id}>
                <p className="text-xs text-muted-foreground">{type.name}</p>
                <p className="mt-1 font-medium tabular-nums">
                  {myRow?.values[type.id]?.quantity ?? "0"} {type.unit}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            数据来自已完成的业务任务；下面的“已完成”保留每一笔发货记录和委托关系。
          </p>
        </section>
        <ShippingTaskList tasks={tasks} />
      </div>
    </div>
  );
}
