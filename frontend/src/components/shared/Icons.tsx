export function SliceMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-5 20 285 240"
      overflow="visible"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform="translate(10 0)">
        <g transform="rotate(30 120 90) scale(1 -1) translate(0 -180)">
          <path
            strokeWidth="11"
            d="M20 150 L220 150 M20 150 A 100 110 0 0 1 220 150"
          />
          <g strokeWidth="4.5">
            <line x1="120" y1="150" x2="120" y2="48" />
            <line x1="120" y1="150" x2="74" y2="62" />
            <line x1="120" y1="150" x2="166" y2="62" />
            <line x1="120" y1="150" x2="44" y2="98" />
            <line x1="120" y1="150" x2="196" y2="98" />
          </g>
        </g>
        <g strokeWidth="5">
          <path d="M250 108 C 264 130, 264 148, 250 152 C 236 148, 236 130, 250 108 Z" />
        </g>
      </g>
    </svg>
  );
}

export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 16 16">
      <path
        d="M3 8 H13 M9 4 L13 8 L9 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
