/**
 * Route legs are drawn as gentle arcs rather than straight segments: a bow
 * makes overlapping legs distinguishable and keeps back-and-forth hops from
 * collapsing onto the same line.
 *
 * The curve is a quadratic Bézier whose control point is pushed perpendicular
 * to the chord. Working directly in lat/lng distorts slightly away from the
 * equator, which is fine — the arc is decorative, not a flight path.
 */
export function arcPoints(a, b, { curvature = 0.18, segments = 96 } = {}) {
  const [lat1, lng1] = a
  const [lat2, lng2] = b

  const dLat = lat2 - lat1
  const dLng = lng2 - lng1

  const controlLat = (lat1 + lat2) / 2 - dLng * curvature
  const controlLng = (lng1 + lng2) / 2 + dLat * curvature

  const points = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const inv = 1 - t
    points.push([
      inv * inv * lat1 + 2 * inv * t * controlLat + t * t * lat2,
      inv * inv * lng1 + 2 * inv * t * controlLng + t * t * lng2,
    ])
  }
  return points
}

/**
 * Cut one arc into `parts` contiguous pieces.
 *
 * A multi-hop journey needs a colour per hop, but giving each hop its own arc
 * makes it bow off its own short chord — the pieces then meet at visible
 * corners and the leg reads as a scalloped wave. Slicing a single curve keeps
 * every piece on the same smooth path, and consecutive pieces share their
 * boundary point so there is no seam.
 */
export function splitArc(points, parts) {
  if (parts <= 1) return [points]

  const span = (points.length - 1) / parts
  const chunks = []
  for (let i = 0; i < parts; i += 1) {
    const start = Math.round(i * span)
    const end = Math.round((i + 1) * span)
    chunks.push(points.slice(start, end + 1))
  }
  return chunks
}
