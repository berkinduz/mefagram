export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <svg
        width="29"
        height="29"
        viewBox="0 0 29 29"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 8v13M7 8l7.5 8L22 8v13"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="3.5" y="4.5" width="7" height="7" rx="2" fill="currentColor" />
        <rect
          x="18.5"
          y="4.5"
          width="7"
          height="7"
          rx="2"
          fill="currentColor"
        />
        <rect x="11" y="13" width="7" height="7" rx="2" fill="currentColor" />
      </svg>
      {!compact && (
        <span>
          mefagram<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
