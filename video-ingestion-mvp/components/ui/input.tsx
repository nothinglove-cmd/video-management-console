import * as React from "react";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        skin.formControl,
        "file:border-0 file:bg-transparent file:text-[length:var(--skin-text-button)] file:font-medium",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
