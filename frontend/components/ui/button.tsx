import * as React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "relative inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-lg";

    const sizeStyles = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2.5 text-sm",
      lg: "px-5 py-3 text-base",
    };

    const variants = {
      primary:
        "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 active:scale-[0.99] font-semibold shadow-lg shadow-emerald-500/20",
      secondary:
        "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:scale-[0.99] border border-zinc-700",
      outline:
        "border border-zinc-700 text-zinc-200 hover:bg-zinc-800/80 active:scale-[0.99]",
      ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variants[variant]} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
