import Link from "next/link";
import { ArrowLeft, CircleHelp, Home } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CircleHelp className="h-6 w-6" />
        </span>
        <p className="mt-5 text-sm font-medium text-primary">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">没有找到这个页面</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          记录可能已被删除、链接已经失效，或当前账号没有访问权限。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/workbench" className={cn(buttonVariants({ size: "sm" }))}>
            <Home className="mr-1.5 h-4 w-4" />
            返回工作台
          </Link>
          <Link
            href="/notifications"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            返回通知
          </Link>
        </div>
      </div>
    </main>
  );
}
