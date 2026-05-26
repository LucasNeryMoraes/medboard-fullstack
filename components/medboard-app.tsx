"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { BarChart3, BookOpenCheck, CalendarDays, Download, FileSpreadsheet, LogOut, Moon, NotebookTabs, Search, Sun, Timer, Trophy } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { DashboardView } from "@/components/views-dashboard";
import { ScheduleView } from "@/components/views-schedule";
import { NotebookView } from "@/components/views-notebook";
import { PerformanceView } from "@/components/views-performance";
import { Onboarding } from "@/components/onboarding";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { allProgressIds, schedule } from "@/utils/schedule";
import type { TabKey } from "@/types/schedule";

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "cronograma", label: "Cronograma", icon: CalendarDays },
  { key: "simulados", label: "Simulados", icon: Trophy },
  { key: "caderno", label: "Caderno", icon: NotebookTabs }
];

export function MedboardApp({ userName }: { userName: string }) {
  const { theme, setTheme } = useTheme();
  const { tab, setTab, doneIds, onboardingDone } = useMedboardStore();
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done">("idle");
  const ids = useMemo(() => allProgressIds(), []);
  const progress = ids.length ? Math.round((doneIds.length / ids.length) * 100) : 0;

  function exportExcel() {
    const rows = schedule.rows.flatMap((row) => [
      ...row.aulas.map((aula) => ({ data: row.dataBR, semana: row.semana, tipo: "Aula", disciplina: aula.disciplina, titulo: aula.aula, status: doneIds.includes(aula.id) ? "Concluída" : "Pendente" })),
      ...row.revisoesDoDia.map((rev) => ({ data: row.dataBR, semana: row.semana, tipo: "Revisão", disciplina: rev.disciplina, titulo: rev.aula, status: doneIds.includes(rev.id) ? "Concluída" : "Pendente" }))
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Cronograma");
    XLSX.writeFile(wb, "medboard-cronograma.xlsx");
    toast.success("Excel exportado");
  }

  function exportPDF() {
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text("MedBoard - Resumo do cronograma", 14, 18);
    pdf.setFontSize(11);
    pdf.text(`Progresso: ${progress}%`, 14, 30);
    schedule.rows.slice(0, 34).forEach((row, index) => {
      pdf.text(`${row.dataBR} · ${row.semana} · ${row.assunto.slice(0, 80)}`, 14, 42 + index * 6);
    });
    pdf.save("medboard-resumo.pdf");
    toast.success("PDF exportado");
  }

  function fakeRealtimeSync() {
    setSyncState("syncing");
    setTimeout(() => {
      setSyncState("done");
      toast.success("Dados sincronizados");
      setTimeout(() => setSyncState("idle"), 1600);
    }, 650);
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/10 bg-slate-950 px-4 py-5 text-white lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white font-black text-brand-700">M</div>
          <div>
            <div className="text-xl font-black tracking-tight">MedBoard</div>
            <div className="text-xs text-slate-300">Plataforma de estudos</div>
          </div>
        </div>
        <nav className="grid gap-2">
          {tabs.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)} className={`btn justify-start ${tab === item.key ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10"}`}>
              <item.icon size={18} /> {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto grid gap-2">
          <button className="btn justify-start bg-white/10 text-white" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />} Tema
          </button>
          <button className="btn justify-start bg-white/10 text-white" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 px-4 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-600">Olá, {userName}</p>
              <h1 className="text-2xl font-black tracking-tight lg:text-3xl">Central de estudos MedBoard</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={fakeRealtimeSync}><Timer size={17} /> {syncState === "syncing" ? "Sincronizando..." : syncState === "done" ? "Sincronizado" : "Sync"}</button>
              <button className="btn-secondary" onClick={exportPDF}><Download size={17} /> PDF</button>
              <button className="btn-secondary" onClick={exportExcel}><FileSpreadsheet size={17} /> Excel</button>
              <button className="btn-primary" onClick={() => setTab("cronograma")}><BookOpenCheck size={17} /> Estudar agora</button>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-rose-500 transition-all" style={{ width: `${Math.max(progress, doneIds.length ? 1 : 0)}%` }} />
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-950 lg:hidden">
          {tabs.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)} className={`btn shrink-0 ${tab === item.key ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "btn-secondary"}`}>
              <item.icon size={16} /> {item.label}
            </button>
          ))}
        </div>

        <section className="p-4 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>
              {tab === "dashboard" && <DashboardView />}
              {tab === "cronograma" && <ScheduleView />}
              {tab === "simulados" && <PerformanceView />}
              {tab === "caderno" && <NotebookView />}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
      {!onboardingDone && <Onboarding />}
    </div>
  );
}
