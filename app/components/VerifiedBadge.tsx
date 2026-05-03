interface VerifiedBadgeProps {
  size?: number;
  className?: string;
}

export default function VerifiedBadge({ size = 16, className = '' }: VerifiedBadgeProps) {
  return (
    <span
      role="img"
      aria-label="Verified"
      title="Verified"
      className={`inline-flex items-center justify-center bg-blue-500 rounded-sm shrink-0 ${className}`}
      style={{ width: size, height: size, transform: 'rotate(30deg)' }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.7}
        height={size * 0.7}
        style={{ transform: 'rotate(-30deg)' }}
        aria-hidden="true"
      >
        <path
          d="M5 12.5l4 4 10-10"
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
