import { useEffect, useState } from "react";
import { ArrowUpRight, Calculator, CalendarClock, ClipboardCheck, ReceiptText } from "lucide-react";
import CobroSinLuz from "./modules/cobro/CobroSinLuz";
import CorteCaja from "./modules/corte/CorteCaja";
import Calculadora from "./modules/precios/Calculadora";
import Caducidades from "./modules/caducidades/Caducidades";
import { syncSheetsInventory } from "./lib/inventorySync";

const modules = [
  { id: "cobro", label: "Cobro sin luz", icon: ReceiptText },
  { id: "corte", label: "Corte de caja", icon: ClipboardCheck },
  { id: "precios", label: "Calculadora de precios", icon: Calculator },
  { id: "caducidades", label: "Caducidades", icon: CalendarClock }
] as const;
type View = "inicio" | typeof modules[number]["id"];

export default function App() {
  const [view, setView] = useState<View>("inicio");
  const navigate = (next: View) => {
    setView(next);
    window.scrollTo(0, 0);
  };
  useEffect(() => { syncSheetsInventory().catch(() => {}); }, []);

  return (
    <div className="workspace min-h-dvh">
      <header className="workspace-header">
        <div className="workspace-header-inner">
          <button type="button" className="workspace-brand" onClick={() => navigate("inicio")}>Caja Play</button>
          <nav className="workspace-nav" aria-label="Módulos">
            {modules.map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} onClick={() => navigate(id)} aria-current={view === id ? "page" : undefined}>
                <Icon size={17} aria-hidden="true" />{label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
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
        {view === "cobro" && <CobroSinLuz onBack={() => navigate("inicio")} />}
        {view === "corte" && <CorteCaja onBack={() => navigate("inicio")} />}
        {view === "precios" && <Calculadora />}
        {view === "caducidades" && <Caducidades />}
      </main>
    </div>
  );
}
