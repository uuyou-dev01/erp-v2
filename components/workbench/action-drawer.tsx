"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function ActionDrawer({ open, onClose, children, className }: ActionDrawerProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-xl",
          className
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 z-10 h-8 w-8"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </Button>
        {children}
      </aside>
    </>
  );
}
