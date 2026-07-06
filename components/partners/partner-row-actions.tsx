"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivatePartnerAction } from "@/app/actions/partners";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

export function PartnerDeactivateButton({ id, name, disabled }: { id: string; name: string; disabled?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deactivate = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await deactivatePartnerAction(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "停用失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        className="text-red-600 hover:text-red-700"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        停用
      </Button>

      {confirming && (
        <ConfirmDialog
          open
          title="确认停用合作方"
          description={`确认停用「${name}」吗？相关合作关系也会同步停用。`}
          confirmText="确认停用"
          cancelText="取消"
          loading={loading}
          tone="danger"
          error={error}
          onConfirm={deactivate}
          onCancel={() => {
            setError(null);
            setConfirming(false);
          }}
        />
      )}
    </>
  );
}
