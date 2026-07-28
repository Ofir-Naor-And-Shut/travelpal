export default function ProgressRing({
  value,
  total,
  size = 52,
  stroke = 4,
  over = false,
  label,
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = total > 0 ? Math.min(1, value / total) : 0

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${value}/${total}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className={over ? 'stroke-subtle' : 'stroke-accent'}
          style={{ transition: 'stroke-dashoffset .35s ease' }}
        />
      </svg>
      <span className="tabular absolute inset-0 grid place-items-center text-[11px] font-semibold text-fg">
        {value}/{total}
      </span>
    </div>
  )
}
