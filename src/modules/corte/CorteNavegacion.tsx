import { ClipboardList, CreditCard, Banknote, Coins, FileText } from "lucide-react";
import "./corte-navegacion.css";

const steps = [
  { label: "Info", icon: ClipboardList },
  { label: "Tarjetas", icon: CreditCard },
  { label: "Efectivo", icon: Banknote },
  { label: "Conteo", icon: Coins },
  { label: "Resumen", icon: FileText },
];

export default function CorteNavegacion({ paso, onNavigate }: { paso: number; onNavigate: (paso: number) => void }) {
  return (
    <nav className="corte-nav" aria-label="Pasos del corte">
      {steps.map(({ label, icon: Icon }, index) => (
        <button key={label} type="button" aria-label={label}
          aria-current={paso === index + 1 ? "step" : undefined}
          onClick={() => onNavigate(index + 1)}>
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
