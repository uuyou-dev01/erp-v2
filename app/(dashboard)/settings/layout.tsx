import { SettingsNav } from "@/components/settings/settings-nav";
import { requireUserContext } from "@/lib/auth/user-context";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const context = await requireUserContext();
  return (
    <div className="mx-auto w-full max-w-5xl">
      <SettingsNav role={context.role} />
      {children}
    </div>
  );
}
