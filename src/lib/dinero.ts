const centavos = (amount: number) => Math.sign(amount) * Math.round(Math.abs(amount) * 100);

export function calcularCobro(ticket: { price: number; quantity: number }[], efectivo: string) {
  const total = ticket.reduce((sum, item) => sum + centavos(item.price * item.quantity), 0);
  const recibido = Number(efectivo);
  const diferencia = Number.isFinite(recibido) && efectivo !== "" ? centavos(recibido) - total : 0;
  return { total: total / 100, diferencia: diferencia / 100, suficiente: efectivo !== "" && Number.isFinite(recibido) && diferencia >= 0 };
}

export function conciliarEfectivo(contado: number, esperado: number) {
  const diferencia = (centavos(contado) - centavos(esperado)) / 100;
  return { diferencia, estado: diferencia === 0 ? "exacto" : diferencia < 0 ? "faltante" : "sobrante" } as const;
}
