"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useMedboardStore } from "@/hooks/use-medboard-store";

export function Onboarding() {
  const finish = useMedboardStore((state) => state.finishOnboarding);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur">
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card max-w-lg p-6">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-700/20">
          <CheckCircle2 />
        </div>
        <h2 className="text-2xl font-black tracking-tight">Seu Cronograma Lalazinha está pronto</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          O cronograma original foi convertido para uma plataforma com checklists, dashboard, caderno de erros, simulados, exportações e persistência fullstack.
        </p>
        <button className="btn-primary mt-5 w-full" onClick={finish}>Começar</button>
      </motion.div>
    </div>
  );
}
