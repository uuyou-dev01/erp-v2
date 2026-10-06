"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function ActionDrawer({
  open,
  onClose,
  children,
  className,
  title = "任务详情",
}: ActionDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
      className={cn(
        "fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-md border-l bg-background p-0 text-foreground shadow-xl backdrop:bg-black/30",
        className
      )}
    >
      {open && (
        <div className="relative flex h-full flex-col">
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
        </div>
      )}
    </dialog>
  );
}
