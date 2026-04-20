"use client";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-[10px] tracking-[0.22em] uppercase text-ink-70 mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full h-[46px] border-[1.5px] border-ink rounded-full bg-white text-ink px-[18px] font-mono text-[13px] outline-none transition-shadow duration-150 focus:shadow-[4px_4px_0_0_var(--ink)] ${className}`}
        {...props}
      />
    </div>
  );
}
