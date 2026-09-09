import { Loader2, PackageCheck } from "lucide-react";

export default function CollaborationTasksLoading() {
  return (
    <main className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 md:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PackageCheck className="h-5 w-5" />
          </span>
          <p className="font-semibold">外部任务协作</p>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-12 text-sm text-muted-foreground md:px-6">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        正在加载你的任务协作关系…
      </div>
    </main>
  );
}
