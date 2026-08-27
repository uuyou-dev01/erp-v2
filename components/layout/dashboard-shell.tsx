"use client";

import { Suspense, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/command/command-palette";

function SidebarFallback() {
  return <div className="hidden w-56 shrink-0 border-r bg-sidebar md:block" />;
}

export function DashboardShell({
  children,
  stores,
  activeStoreId,
  organizations,
  activeOrganizationId,
  account,
  role,
  collaboration,
}: {
  children: React.ReactNode;
  stores: Array<{ id: string; name: string }>;
  activeStoreId: string;
  organizations: Array<{ id: string; name: string }>;
  activeOrganizationId: string;
  account: {
    name: string;
    email: string;
    organizationName: string;
  };
  role: string;
  collaboration: {
    hasWarehouseCollaboration: boolean;
    pendingTaskCount: number;
  };
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen bg-muted/30">
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar
          storeId={activeStoreId}
          role={role}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
          collaboration={collaboration}
        />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          role={role}
          stores={stores}
          activeStoreId={activeStoreId}
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          account={account}
          onMenuClick={() => setMobileMenuOpen(true)}
          onCommandOpen={() => setCommandOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} role={role} />
    </div>
  );
}
