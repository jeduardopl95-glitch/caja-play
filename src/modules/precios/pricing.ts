export const factors = { proveedor: 132, merza: 152 } as const;

export function calculatePrice(totalCents: number, pieces: number, iva: boolean, ieps: boolean, type: keyof typeof factors) {
  const tax = (iva ? 116n : 100n) * (ieps ? 108n : 100n);
  const costCents = BigInt(totalCents) * tax / (BigInt(pieces) * 10000n);
  const sale = costCents * BigInt(factors[type]);
  let suggested = (sale + 9999n) / 10000n;
  while (![2n, 4n, 6n, 8n, 9n].includes(suggested % 10n)) suggested++;
  return { cost: Number(costCents) / 100, sale: Number(sale / 100n) / 100, suggested: Number(suggested) };
}
