"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  placement?: "center" | "end";
  size?: "sm" | "md" | "lg";
  closeDisabled?: boolean;
};

const CENTER_WIDTHS = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
} as const;

const END_WIDTHS = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  placement = "center",
  size = "md",
  closeDisabled = false,
}: ActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      requestAnimationFrame(() => {
        dialog
          .querySelector<HTMLElement>(
            "[data-action-dialog-content] input:not([type='hidden']):not([disabled]), [data-action-dialog-content] select:not([disabled]), [data-action-dialog-content] textarea:not([disabled]), [data-action-dialog-content] button:not([disabled])"
          )
          ?.focus();
      });
    }
    if (!open && dialog.open) {
      dialog.close();
      requestAnimationFrame(() => returnFocusRef.current?.focus());
    }
  }, [open]);

  function requestClose() {
    if (!closeDisabled) onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "fixed m-0 max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] overflow-hidden border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/45",
        placement === "center"
          ? cn(
              "bottom-auto left-1/2 right-auto top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl",
              CENTER_WIDTHS[size]
            )
          : cn(
              "bottom-0 left-auto right-0 top-0 h-dvh max-h-dvh rounded-none border-y-0 border-r-0 sm:w-[calc(100%-3rem)]",
              END_WIDTHS[size]
            )
      )}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        requestClose();
      }}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label={`关闭${title}`}
            disabled={closeDisabled}
            onClick={requestClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div data-action-dialog-content className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
      </div>
    </dialog>
  );
}
