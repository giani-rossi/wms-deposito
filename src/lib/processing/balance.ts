export const QTY_EPS = 0.001;

export function buildProductBalance(
  lines: { product_id: string; quantity: number }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    map.set(
      line.product_id,
      (map.get(line.product_id) ?? 0) + Number(line.quantity)
    );
  }
  return map;
}

export function balancesMatch(
  origin: Map<string, number>,
  result: Map<string, number>
): boolean {
  if (origin.size !== result.size) return false;
  for (const [productId, qty] of origin) {
    const out = result.get(productId) ?? 0;
    if (Math.abs(qty - out) > QTY_EPS) return false;
  }
  return true;
}

export function totalQuantity(lines: { quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + Number(line.quantity), 0);
}
