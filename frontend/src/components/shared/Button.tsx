"use client";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "ink" | "ghost" | "light";
  size?: "default" | "sm";
  children: React.ReactNode;
}

export function Button({ variant = "ink", size = "default", children, className = "", ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.04em] cursor-pointer border-[1.5px] transition-all duration-150";
  const sizes = {
    default: "h-10 px-[18px] text-xs",
    sm: "h-8 px-3.5 text-[11px]",
  };
  const variants = {
    ink: "bg-ink text-white border-ink hover:-translate-y-px hover:bg-pulp hover:text-ink hover:border-pulp hover:shadow-[4px_4px_0_0_var(--ink)]",
    ghost: "bg-transparent text-ink border-ink hover:bg-ink hover:text-white",
    light: "bg-white text-ink border-line hover:border-ink",
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
