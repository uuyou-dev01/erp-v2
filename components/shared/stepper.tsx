"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center gap-2 w-full">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={index} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isCompleted && "bg-brand-blue text-white",
                  isCurrent && "bg-brand-blue text-white ring-2 ring-brand-blue/30 ring-offset-2",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <div className="min-w-0 hidden sm:block">
                <p className={cn(
                  "text-sm font-medium truncate",
                  (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
                )}>
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                )}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "flex-1 h-px mx-3",
                isCompleted ? "bg-brand-blue" : "bg-border"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
