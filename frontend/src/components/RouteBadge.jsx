export default function RouteBadge({ route }) {
  return <span className={`badge badge-${route}`}>{route}</span>
}
