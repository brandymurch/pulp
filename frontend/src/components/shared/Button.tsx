"use client";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "ink" | "ghost" | "light";
  size?: "default" | "sm";
  children: React.ReactNode;
}

export function Button({ variant = "ink", size = "default", children, className = "", ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold cursor-pointer border transition-all duration-150";
  const sizes = {
    default: "h-10 px-4 text-sm",
    sm: "h-8 px-3 text-xs",
  };
  const variants = {
    ink: "bg-ink text-white border-ink hover:bg-[#1f2940] hover:border-[#1f2940] hover:shadow-card-md",
    ghost: "bg-white text-ink border-line hover:border-ink-40 hover:bg-line-soft",
    light: "bg-white text-ink-70 border-line hover:border-ink-40 hover:text-ink",
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
