import Link from "next/link";
import { Boxes, CheckCircle2, Globe2, ShieldCheck } from "lucide-react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1.15fr)]">
      <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Boxes className="h-5 w-5" />
            </span>
            跨境贸易 ERP
          </Link>
        </div>
        <div className="relative max-w-lg space-y-7">
          <p className="text-sm font-medium text-blue-300">从账号开始，保持每笔生意归属清楚</p>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            人、企业与合作方，
            <br />
            各自有清晰边界。
          </h2>
          <div className="space-y-4 text-sm text-slate-300">
            <p className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-blue-300" />
              企业权限按成员与店铺独立控制
            </p>
            <p className="flex items-center gap-3">
              <Globe2 className="h-4 w-4 text-blue-300" />
              一个账号可以参与多个经营主体
            </p>
            <p className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-blue-300" />
              供应商档案不强制注册登录
            </p>
          </div>
        </div>
        <p className="relative text-xs text-slate-500">内部测试版 · 邮箱验证将在生产化阶段启用</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="mb-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {eyebrow}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
