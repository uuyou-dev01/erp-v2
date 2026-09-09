import {
  getCollaborationArrivalTasks,
  getCollaborationShippingTasks,
  getMyCollaborationWorkMetrics,
} from "@/app/actions/collaboration-tasks";
import { ArrivalTaskList } from "@/components/collaboration/arrival-task-list";
import { ShippingTaskList } from "@/components/collaboration/shipping-task-list";
import { requireAuthenticatedUser } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function CollaborationTasksPage() {
  const user = await requireAuthenticatedUser();
  const [tasks, arrivalTasks, workload] = await Promise.all([
    getCollaborationShippingTasks(),
    getCollaborationArrivalTasks(),
    getMyCollaborationWorkMetrics(),
  ]);
  const myRow = workload.rows.find((row) => row.userId === user.id);
  const recentRecords = workload.records.slice(0, 10);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">我的任务</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          这里统一显示你有权处理的外部任务，包括集运到货确认和订单发货；未授权的企业数据不会显示。
        </p>
      </div>
      <div className="mb-8 space-y-6">
        {tasks.length || !arrivalTasks.length ? <ShippingTaskList tasks={tasks} /> : null}
        <ArrivalTaskList tasks={arrivalTasks} />
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
      <section className="mb-6" aria-labelledby="my-completed-work-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="my-completed-work-title" className="text-base font-semibold">
              我的完成记录
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              最近完成的任务、实际处理量以及对应委托方和仓库。
            </p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            共 {workload.eventCount} 条
          </span>
        </div>
        {recentRecords.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">完成任务</th>
                  <th className="px-3 py-2.5 font-medium">完成量</th>
                  <th className="px-3 py-2.5 font-medium">委托方 / 仓库</th>
                  <th className="px-3 py-2.5 font-medium">完成时间</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="px-3 py-3 font-medium">{record.workName}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {record.quantity} {record.unit}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {[record.organizationName, record.locationName].filter(Boolean).join(" · ") ||
                        "—"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(record.occurredAt).toLocaleString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
            完成任务后，这里会按任务类型显示你做了什么以及处理了多少件。
          </div>
        )}
      </section>
    </div>
  );
}
