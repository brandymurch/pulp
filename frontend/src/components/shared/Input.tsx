"use client";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-ink-40 mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full h-10 border border-line rounded-lg bg-white text-ink px-3 text-[13px] outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 ${className}`}
        {...props}
      />
    </div>
  );
}
