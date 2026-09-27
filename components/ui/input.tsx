import * as React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  endAdornment?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, hint, icon, endAdornment, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 text-zinc-400 pointer-events-none flex items-center">
              {icon}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            className={`w-full rounded-lg bg-zinc-900 border text-zinc-100 placeholder-zinc-500 text-sm transition-colors py-2.5 px-3.5 ${
              icon ? "pl-10" : ""
            } ${endAdornment ? "pr-10" : ""} ${
              error
                ? "border-rose-500/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                : "border-zinc-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            } outline-none ${className}`}
            {...props}
          />

          {endAdornment && (
            <div className="absolute right-3 text-zinc-400 flex items-center">
              {endAdornment}
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-rose-400 flex items-center gap-1 font-medium">
            <span>•</span> {error}
          </p>
        )}

        {hint && !error && (
          <p className="text-xs text-zinc-500 leading-normal">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
