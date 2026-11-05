import { useState } from "react";
import { calculatePrice, factors } from "./pricing";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function Calculadora() {
  const [total, setTotal] = useState("");
  const [pieces, setPieces] = useState("");
  const [iva, setIva] = useState(false);
  const [ieps, setIeps] = useState(false);
  const [type, setType] = useState<keyof typeof factors>("proveedor");
  const normalized = total.trim().replace(",", ".");
  const cents = Math.round(Number(normalized) * 100);
  const count = Number(pieces);
  const validTotal = /^\d+(?:\.\d{0,2})?$/.test(normalized) && Number.isSafeInteger(cents);
  const validPieces = /^\d+$/.test(pieces) && Number.isSafeInteger(count) && count > 0;
  const result = validTotal && validPieces ? calculatePrice(cents, count, iva, ieps, type) : null;

  return (
    <section className="pricing">
      <h1>Calculadora de precios</h1>
      <div className="pricing-grid">
        <div className="pricing-fields">
          <label>Importe del paquete (MXN)
            <input inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="0.00" aria-invalid={!!total && !validTotal} />
            {total && !validTotal && <small>Ingresa un importe válido con hasta dos decimales.</small>}
          </label>
          <label>Piezas por paquete
            <input inputMode="numeric" value={pieces} onChange={e => setPieces(e.target.value)} placeholder="12" aria-invalid={!!pieces && !validPieces} />
            {pieces && !validPieces && <small>Ingresa un número entero mayor que cero.</small>}
          </label>
          <fieldset>
            <legend>Impuestos adicionales</legend>
            <div className="pricing-tax">
              <label><input type="checkbox" checked={iva} onChange={e => setIva(e.target.checked)} /> IVA 16 %</label>
              <label><input type="checkbox" checked={ieps} onChange={e => setIeps(e.target.checked)} /> IEPS 8 %</label>
            </div>
          </fieldset>
          <label>Tipo de compra
            <select value={type} onChange={e => setType(e.target.value === "merza" ? "merza" : "proveedor")}>
              <option value="proveedor">Proveedor (1.32)</option>
              <option value="merza">Abarrotes / Aurrera / Merza (1.52)</option>
            </select>
          </label>
          <button type="button" className="pricing-reset" onClick={() => { setTotal(""); setPieces(""); setIva(false); setIeps(false); setType("proveedor"); }}>Limpiar cálculo</button>
        </div>
        <aside className="pricing-result" aria-live="polite">
          <h2>Precio de etiqueta</h2>
          <output>{result ? money.format(result.suggested).replace(/\.00$/, "") : "—"}</output>
          <dl>
            <div><dt>Costo unitario con impuestos</dt><dd>{result ? money.format(result.cost) : "—"}</dd></div>
            <div><dt>Venta antes de ajustar</dt><dd>{result ? money.format(result.sale) : "—"}</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
