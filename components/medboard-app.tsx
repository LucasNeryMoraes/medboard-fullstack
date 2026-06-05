"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { BarChart3, CalendarCheck2, CalendarDays, Check, Clock3, LogOut, Moon, NotebookTabs, Pause, Play, Search, Sun, Trophy } from "lucide-react";
import { toast } from "sonner";
import { DashboardView } from "@/components/views-dashboard";
import { TodayView } from "@/components/views-today";
import { ScheduleView } from "@/components/views-schedule";
import { TimerView } from "@/components/views-timer";
import { NotebookView } from "@/components/views-notebook";
import { PerformanceView } from "@/components/views-performance";
import { Onboarding } from "@/components/onboarding";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { allProgressIds } from "@/utils/schedule";
import { api } from "@/services/api";
import type { TabKey } from "@/types/schedule";

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "hoje", label: "Hoje", icon: CalendarCheck2 },
  { key: "cronograma", label: "Cronograma", icon: CalendarDays },
  { key: "cronometro", label: "Cronômetro", icon: Clock3 },
  { key: "simulados", label: "Simulados", icon: Trophy },
  { key: "caderno", label: "Caderno", icon: NotebookTabs }
];

export function MedboardApp({ userName }: { userName: string }) {
  const { theme, setTheme } = useTheme();
  const { tab, setTab, doneIds, onboardingDone, activeTimer, setActiveTimer, toggleDone } = useMedboardStore();
  const [now, setNow] = useState(Date.now());
  const ids = useMemo(() => allProgressIds(), []);
  const progress = ids.length ? Math.round((doneIds.length / ids.length) * 100) : 0;
  const elapsedSeconds = activeTimer ? activeTimer.accumulatedSeconds + (!activeTimer.paused ? Math.max(0, Math.round((now - activeTimer.startedAt) / 1000)) : 0) : 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function formatStudyTime(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}min`;
  }

  function pauseStudy() {
    if (!activeTimer || activeTimer.paused) return;
    setActiveTimer({ ...activeTimer, accumulatedSeconds: elapsedSeconds, paused: true });
  }

  function continueStudy() {
    if (!activeTimer || !activeTimer.paused) return;
    setActiveTimer({ ...activeTimer, startedAt: Date.now(), paused: false });
  }

  async function finishStudy() {
    if (!activeTimer) return;
    const seconds = Math.max(1, elapsedSeconds);
    try {
      await api("/api/productivity", {
        method: "POST",
        body: JSON.stringify({
          horas: seconds / 3600,
          rendimento: 100,
          materia: activeTimer.area,
          data: new Date(),
          observacoes: `${activeTimer.source === "lesson" ? "aula" : "estudo"}:${activeTimer.title}${activeTimer.week ? ` · ${activeTimer.week}` : ""}`
        })
      });
      if (activeTimer.lessonId && window.confirm("Deseja marcar esta aula como concluída?")) {
        await api("/api/tasks", {
          method: "POST",
          body: JSON.stringify({ externalId: activeTimer.lessonId, titulo: activeTimer.title, data: activeTimer.date || new Date(), tipo: "AULA", materia: activeTimer.area, status: "DONE" })
        });
        if (!doneIds.includes(activeTimer.lessonId)) toggleDone(activeTimer.lessonId);
      }
      setActiveTimer(null);
      toast.success("Tempo de estudo registrado");
    } catch {
      toast.error("Não consegui finalizar o estudo agora.");
    }
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/10 bg-slate-950 px-4 py-5 text-white lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white font-black text-brand-700">CM</div>
          <div>
            <div className="text-xl font-black tracking-tight">Cronograma Med</div>
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
        {activeTimer && (
          <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-red-200 bg-white p-4 shadow-2xl dark:border-red-400/30 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-300">Estudando</span>
                <strong className="block truncate">{activeTimer.area} → {activeTimer.title}</strong>
                <span className="mt-1 block font-mono text-2xl font-black">{formatStudyTime(elapsedSeconds)}</span>
              </div>
              <div className="flex shrink-0 gap-2">
                {activeTimer.paused ? (
                  <button className="btn-secondary px-3" onClick={continueStudy}><Play size={16} /></button>
                ) : (
                  <button className="btn-secondary px-3" onClick={pauseStudy}><Pause size={16} /></button>
                )}
                <button className="btn-primary bg-red-700 px-3 hover:bg-red-800" onClick={finishStudy}><Check size={16} /></button>
              </div>
            </div>
          </div>
        )}
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 px-4 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-600">Olá, {userName}</p>
              <h1 className="text-2xl font-black tracking-tight lg:text-3xl">Central de estudos Cronograma Med</h1>
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
              {tab === "hoje" && <TodayView />}
              {tab === "cronograma" && <ScheduleView />}
              {tab === "cronometro" && <TimerView />}
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
