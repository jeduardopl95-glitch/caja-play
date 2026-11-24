export function decimal(texto: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto.trim());
  if (!match) throw new Error("Cantidad decimal invalida");
  const fraccion = match[3] ?? "";
  return { entero: BigInt(match[1] + match[2] + fraccion), escala: fraccion.length };
}

export function expresar(entero: bigint, escala: number): string {
  if (!escala) return String(entero);
  const digitos = (entero < 0n ? -entero : entero).toString().padStart(escala + 1, "0");
  const fraccion = digitos.slice(-escala).replace(/0+$/, "");
  return (entero < 0n ? "-" : "") + digitos.slice(0, -escala) + (fraccion ? "." + fraccion : "");
}

export function normalizarCantidad(texto: string): string {
  const { entero, escala } = decimal(texto);
  return expresar(entero, escala);
}
