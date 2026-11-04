// src/App.tsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ReceiptText, DollarSign, Sparkles } from "lucide-react";
import CobroSinLuz from "./modules/cobro/CobroSinLuz";
import CorteCaja from "./modules/corte/CorteCaja";
import { syncSheetsInventory } from "./lib/inventorySync";

// APP CONFIGURATION - EDIT THIS VARIABLE TO INSTANTLY RENAME THE APP
const APP_NAME = "Caja Play";

enum ActiveModule {
  Dashboard = "dashboard",
  CobroSinLuz = "cobro_sin_luz",
  CorteCaja = "corte_caja"
}

export default function App() {
  const [activeModule, setActiveModule] = useState<ActiveModule>(ActiveModule.Dashboard);

  useEffect(() => {
    // Sincronizar inventario automáticamente cada vez que se abre la aplicación
    syncSheetsInventory().catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-eggshell flex flex-col font-sans select-none antialiased text-[#003049]">
      
      <AnimatePresence mode="wait">
        
        {/* DASHBOARD VIEW */}
        {activeModule === ActiveModule.Dashboard && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="min-h-screen flex flex-col justify-between"
          >
            {/* Header Navigation as specified in Geometric Balance */}
            <nav className="w-full h-20 border-b border-[#669BBC] flex items-center justify-between px-6 md:px-12 bg-white">
              <div className="flex items-center gap-4 md:gap-8">
                <span className="text-xl md:text-2xl tracking-[0.2em] font-serif uppercase font-bold text-burgundy">{APP_NAME}</span>
                <div className="h-4 w-[1px] bg-[#669BBC]"></div>
                <span className="text-[9px] md:text-[10px] tracking-widest uppercase opacity-40 font-semibold text-burgundy">Caja Play v2.0</span>
              </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-grow flex flex-col items-center justify-center relative py-16 md:py-24 bg-eggshell">
              {/* Background Decorative Text from Theme specs */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.015] pointer-events-none select-none">
                <span className="text-[20vw] font-serif italic text-burgundy">Minimal</span>
              </div>

              <div className="w-full max-w-5xl px-6 md:px-12 z-10 space-y-16">
                
                {/* Intro Title Header */}
                <div className="max-w-xl text-center md:text-left space-y-4">
                  <h1 className="text-4xl md:text-5xl font-serif font-extrabold text-burgundy tracking-tight leading-tight">
                    Herramientas de Asistencia
                  </h1>
                  <p className="text-sm text-[#003049] leading-relaxed font-sans font-light">
                    Soluciones de respuesta rápida y auditoría para comercios. Optimizado para iPhone, iPad y celulares Android con sistema estable fuera de línea.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 w-full">
                  
                   {/* Module Card: Cobro Sin Luz */}
                  <div 
                    onClick={() => setActiveModule(ActiveModule.CobroSinLuz)}
                    className="group cursor-pointer"
                  >
                    <div className="aspect-auto md:aspect-[4/5] min-h-[350px] bg-[#FDF0D5] border border-[#669BBC] rounded-lg p-8 md:p-10 flex flex-col justify-between hover:border-act-red hover:shadow-md hover:bg-white transition-all duration-500">
                      <div className="flex justify-between items-start">
                        <div className="w-14 h-14 bg-white border border-[#669BBC] rounded-lg flex items-center justify-center shadow-xs">
                          <svg className="w-7 h-7 text-sec-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="text-[9px] md:text-[10px] tracking-[0.2em] uppercase text-sec-red font-bold bg-accent-soft/10 px-2 py-1 rounded">Emergencia</span>
                      </div>
                      <div className="my-6 md:my-0">
                        <h2 className="text-3xl md:text-4xl font-serif font-extrabold text-burgundy mb-4">Cobro<br />sin luz</h2>
                        <p className="text-xs md:text-sm text-[#003049] leading-relaxed max-w-[240px]">
                          Calculadora offline para realizar transacciones manuales inmediatas cuando el sistema principal de la tienda no responde.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-[1px] bg-burgundy group-hover:w-16 transition-all duration-300"></div>
                        <span className="text-[10px] tracking-widest uppercase font-bold text-burgundy">Ingresar Módulo</span>
                      </div>
                    </div>
                  </div>

                  {/* Module Card: Corte de Caja */}
                  <div 
                    onClick={() => setActiveModule(ActiveModule.CorteCaja)}
                    className="group cursor-pointer"
                  >
                    <div className="aspect-auto md:aspect-[4/5] min-h-[350px] bg-[#FDF0D5] border border-[#669BBC] rounded-lg p-8 md:p-10 flex flex-col justify-between hover:border-act-red hover:shadow-md hover:bg-white transition-all duration-500">
                      <div className="flex justify-between items-start">
                        <div className="w-14 h-14 bg-white border border-[#669BBC] rounded-lg flex items-center justify-center shadow-xs">
                          <svg className="w-7 h-7 text-sec-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-[9px] md:text-[10px] tracking-[0.2em] uppercase text-sec-red font-bold bg-accent-soft/10 px-2 py-1 rounded">Administración</span>
                      </div>
                      <div className="my-6 md:my-0">
                        <h2 className="text-3xl md:text-4xl font-serif font-extrabold text-burgundy mb-4">Corte de<br />Caja</h2>
                        <p className="text-xs md:text-sm text-[#003049] leading-relaxed max-w-[240px]">
                          Asistente inteligente guiado paso a paso para la conciliación física de efectivo, arqueos detallados y terminales.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-[1px] bg-burgundy group-hover:w-16 transition-all duration-300"></div>
                        <span className="text-[10px] tracking-widest uppercase font-bold text-burgundy">Iniciar Wizard</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </main>


          </motion.div>
        )}

        {/* 💡 COBRO SIN LUZ ACTIVE VIEW */}
        {activeModule === ActiveModule.CobroSinLuz && (
          <motion.div
            key="cobrosinluz"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <CobroSinLuz onBack={() => setActiveModule(ActiveModule.Dashboard)} />
          </motion.div>
        )}

        {/* 💰 CORTE DE CAJA ACTIVE VIEW */}
        {activeModule === ActiveModule.CorteCaja && (
          <motion.div
            key="cortecaja"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <CorteCaja onBack={() => setActiveModule(ActiveModule.Dashboard)} />
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
