export default function ProgressRing({
  value,
  total,
  size = 52,
  stroke = 4,
  over = false,
  label,
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  // Small rings (the mobile budget widget) need a smaller font, or two-digit
  // nights ("12/12") push past the circle's edge.
  const fontSize = size < 40 ? 8 : 11;

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
          className={over ? "stroke-subtle" : "stroke-accent"}
          style={{ transition: "stroke-dashoffset .35s ease" }}
        />
      </svg>
      <span
        className="tabular absolute inset-0 grid place-items-center whitespace-nowrap font-semibold leading-none text-fg"
        style={{ fontSize }}
      >
        {value}/{total}
      </span>
    </div>
  );
}
