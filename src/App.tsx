import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Calculator, CalendarClock, ClipboardCheck, PackageSearch, ReceiptText } from "lucide-react";
import CobroSinLuz from "./modules/cobro/CobroSinLuz";
import CorteCaja from "./modules/corte/CorteCaja";
import Calculadora from "./modules/precios/Calculadora";
import Caducidades from "./modules/caducidades/Caducidades";
import Inventario from "./modules/inventario/Inventario";

const modules = [
  { id: "cobro", label: "Cobro sin luz", icon: ReceiptText },
  { id: "corte", label: "Corte de caja", icon: ClipboardCheck },
  { id: "precios", label: "Calculadora de precios", icon: Calculator },
  { id: "caducidades", label: "Caducidades", icon: CalendarClock },
  { id: "inventario", label: "Inventario", icon: PackageSearch }
] as const;
type View = "inicio" | typeof modules[number]["id"];

export default function App() {
  const [view, setView] = useState<View>("inicio");
  const [expirationBusy, setExpirationBusy] = useState(false);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const navigate = (next: View) => {
    setView(next);
    window.scrollTo(0, 0);
  };

  return (
    <div className="workspace min-h-dvh">
      {view === "inicio" && <header className="workspace-header">
        <div className="workspace-header-inner">
          <span className="workspace-brand">Caja Play</span>
        </div>
      </header>}
      <main>
        {view !== "inicio" && view !== "corte" && (
          <header className="mx-auto max-w-4xl px-4 pt-4 sm:pt-8">
            <div className="flex items-center rounded-lg bg-[#141418] px-3 py-2 text-white">
              <button
                type="button"
                disabled={(view === "caducidades" && expirationBusy) || (view === "inventario" && inventoryBusy) || (view === "cobro" && checkoutBusy)}
                onClick={() => navigate("inicio")}
                className="group flex cursor-pointer items-center gap-2 rounded-lg border border-white/50 px-3 py-2 font-sans text-xs font-bold text-white"
              >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
                Volver al menú
              </button>
            </div>
          </header>
        )}
        {view === "inicio" && (
          <section className="workspace-home">
            <h1>Operaciones de caja</h1>
            <ul>
              {modules.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <button type="button" className="module-card" data-module={id} onClick={() => navigate(id)}>
                    <span className="module-art" aria-hidden="true"><Icon size={48} strokeWidth={1.5} /></span>
                    <span className="module-label">{label}<ArrowUpRight size={20} aria-hidden="true" /></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {view === "cobro" && <CobroSinLuz onBusyChange={setCheckoutBusy} />}
        {view === "corte" && <CorteCaja onBack={() => navigate("inicio")} />}
        {view === "precios" && <Calculadora />}
        {view === "caducidades" && <Caducidades onBusyChange={setExpirationBusy} />}
        {view === "inventario" && <Inventario onBusyChange={setInventoryBusy} />}
      </main>
    </div>
  );
}
