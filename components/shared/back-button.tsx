"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  label?: string;
  className?: string;
  fallbackHref?: string;
}

function safeReturnPath(value: string | null, fallbackHref: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallbackHref;
  return value;
}

export function BackButton({ label = "返回", className, fallbackHref }: BackButtonProps) {
  const router = useRouter();

  const goBack = () => {
    if (!fallbackHref) {
      router.back();
      return;
    }

    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    router.push(safeReturnPath(returnTo, fallbackHref));
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? "default" : "icon"}
      className={className}
      aria-label={label || "返回"}
      title={label || "返回"}
      onClick={goBack}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
