// Perspective transform between two planes from four point pairs.
// H = [a, b, c, d, e, f, g, h] maps (x, y) to ((a x + b y + c) / w, (d x + e y + f) / w)
// with w = g x + h y + 1. Returns null when the points are degenerate.
export function solveHomography(src, dst) {
  const A = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix
  for (let col = 0; col < 8; col++) {
    let piv = col
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
    if (Math.abs(A[piv][col]) < 1e-12) return null
    ;[A[col], A[piv]] = [A[piv], A[col]]
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const f = A[r][col] / A[col][col]
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k]
    }
  }
  return A.map((row, i) => row[8] / row[i])
}

export function applyHomography(H, [x, y]) {
  const [a, b, c, d, e, f, g, h] = H
  const w = g * x + h * y + 1
  return [(a * x + b * y + c) / w, (d * x + e * y + f) / w]
}
