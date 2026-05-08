import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-all",
  {
    variants: {
      variant: {
        default: "bg-blue-50 text-blue-700 border border-blue-200/60",
        secondary: "bg-purple-50 text-purple-700 border border-purple-200/60",
        destructive: "bg-red-50 text-red-700 border border-red-200/60",
        outline: "border border-gray-200 text-gray-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
