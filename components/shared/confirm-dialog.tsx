"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  tone?: "danger" | "default";
  error?: string | null;
  children?: ReactNode;
  confirmDisabled?: boolean;
  hideConfirm?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  loading = false,
  tone = "default",
  error,
  children,
  confirmDisabled = false,
  hideConfirm = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmClassName = tone === "danger" ? "bg-red-600 hover:bg-red-700 text-white" : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !loading && onCancel()} />
      <Card className="relative z-10 w-full max-w-md text-left">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          {children}
          {error && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              {cancelText}
            </Button>
            {!hideConfirm ? (
              <Button
                type="button"
                className={confirmClassName}
                onClick={onConfirm}
                disabled={loading || confirmDisabled}
              >
                {loading ? "处理中..." : confirmText}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
