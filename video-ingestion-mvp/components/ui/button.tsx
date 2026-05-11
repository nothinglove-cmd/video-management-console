import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    skin.typography.button,
    skin.buttonBase
  ),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        secondary: "border border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] text-foreground shadow-[var(--skin-shadow-card)] hover:bg-[color:var(--skin-surface-hover)]",
        outline: "border border-[color:var(--skin-border)] bg-transparent hover:bg-[color:var(--skin-surface-hover)]",
        ghost: "hover:bg-[color:var(--skin-surface-hover)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      },
      size: {
        default: "h-[var(--skin-control-height-md)] px-3 py-2",
        sm: "h-[var(--skin-control-height-sm)] px-2.5",
        lg: "h-[var(--skin-control-height-lg)] px-5"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
