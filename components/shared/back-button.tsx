"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  label?: string;
  className?: string;
}

export function BackButton({ label = "返回", className }: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? "default" : "icon"}
      className={className}
      onClick={() => router.back()}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
