"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

interface ProductImageProps {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-10 h-10",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

const iconSizes = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

export function ProductImage({ src, alt, size = "md", className = "" }: ProductImageProps) {
  const [imageError, setImageError] = useState(false);

  if (!src || imageError) {
    return (
      <div
        className={`${sizeClasses[size]} rounded border bg-muted flex items-center justify-center ${className}`}
      >
        <ImageIcon className={`${iconSizes[size]} text-muted-foreground`} />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded border bg-muted flex items-center justify-center overflow-hidden ${className}`}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
}
