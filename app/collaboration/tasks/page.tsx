import {
  getCollaborationShippingTasks,
  getMyCollaborationWorkMetrics,
} from "@/app/actions/collaboration-tasks";
import { ShippingTaskList } from "@/components/collaboration/shipping-task-list";
import { requireAuthenticatedUser } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function CollaborationTasksPage() {
  const user = await requireAuthenticatedUser();
  const [tasks, workload] = await Promise.all([
    getCollaborationShippingTasks(),
    getMyCollaborationWorkMetrics(),
  ]);
  const myRow = workload.rows.find((row) => row.userId === user.id);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">我的任务</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          这里统一显示你有权处理的外部任务。当前已接入订单发货，之后的信息确认、库存盘点和质检也会进入同一个入口；未授权的企业数据不会显示。
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
          完成记录会长期保留；之后有新任务时仍会出现在当前账号下。
        </p>
      </section>
      <ShippingTaskList tasks={tasks} />
    </div>
  );
}
