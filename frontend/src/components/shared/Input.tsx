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
        className={`w-full h-10 border-[1.5px] border-line rounded-lg bg-white text-ink px-3 text-[13px] outline-none transition-colors focus:border-ink ${className}`}
        {...props}
      />
    </div>
  );
}
