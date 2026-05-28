"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { areas, todayISO } from "@/utils/schedule";

type Productivity = { id: string; data: string; materia: string | null; horas: number; observacoes: string | null };

const compactDate = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatHours(value: number) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

export function TimerView() {
  const active = useMedboardStore((state) => state.activeTimer);
  const setActive = useMedboardStore((state) => state.setActiveTimer);
  const [now, setNow] = useState(Date.now());
  const [productivity, setProductivity] = useState<Productivity[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Productivity[]>("/api/productivity")
      .then(setProductivity)
      .catch(() => setProductivity([]));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayRecords = useMemo(() => productivity.filter((item) => compactDate(item.data) === todayISO()), [productivity]);
  const totalToday = todayRecords.reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const byArea = areas.map((area) => ({
    area,
    horas: todayRecords.filter((item) => item.materia === area).reduce((acc, item) => acc + Number(item.horas || 0), 0)
  }));

  async function stopTimer() {
    if (!active || saving) return;
    const seconds = Math.max(0, Math.round((Date.now() - active.startedAt) / 1000));
    if (seconds < 60) {
      setActive(null);
      toast.warning("Sessões menores que 1 minuto não são registradas.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/timers", {
        method: "POST",
        body: JSON.stringify({ tempo: seconds, materia: active.area, data: new Date() })
      });
      const saved = await api<Productivity>("/api/productivity", {
        method: "POST",
        body: JSON.stringify({
          horas: seconds / 3600,
          rendimento: 100,
          materia: active.area,
          data: new Date(),
          observacoes: `cronometro:${formatDuration(seconds)}`
        })
      });
      setProductivity((current) => [saved, ...current]);
      toast.success(`Tempo salvo em ${active.area}`);
    } catch {
      toast.error("Não consegui salvar o tempo agora.");
    } finally {
      setActive(null);
      setSaving(false);
    }
  }

  async function toggleTimer(area: string) {
    if (active?.area === area) {
      await stopTimer();
      return;
    }
    if (active) {
      toast.error("Pare o cronômetro atual antes de iniciar outra área.");
      return;
    }
    setActive({ area, startedAt: Date.now() });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <article className="card p-5 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Cronômetro de estudos</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Inicie uma área, pare quando terminar e o tempo entra automaticamente no banco de horas.</p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-slate-50 px-4 py-3 text-right dark:border-violet-400/20 dark:bg-slate-900">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Hoje</span>
              <strong className="block text-2xl font-black">{formatHours(totalToday)}</strong>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {areas.map((area) => {
              const running = active?.area === area;
              const elapsed = running ? Math.round((now - active.startedAt) / 1000) : 0;
              const areaTotal = byArea.find((item) => item.area === area)?.horas || 0;
              return (
                <div key={area} className={`rounded-2xl border p-4 transition ${running ? "border-red-300 bg-red-50 dark:border-red-400/30 dark:bg-red-500/10" : "border-violet-100 bg-slate-50 dark:border-violet-400/20 dark:bg-slate-900"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="block text-lg">{area}</strong>
                      <span className="text-sm text-slate-500">Hoje: {formatHours(areaTotal)}</span>
                    </div>
                    <Clock3 className={running ? "text-red-700" : "text-brand-600"} size={20} />
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-3xl font-black">{running ? formatDuration(elapsed) : "00:00:00"}</span>
                    <button className={running ? "btn-primary bg-red-700 hover:bg-red-800" : "btn-secondary"} disabled={saving} onClick={() => toggleTimer(area)}>
                      {running ? <Pause size={17} /> : <Play size={17} />}
                      {running ? "Parar" : "Iniciar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Resumo do dia</h2>
          <div className="mt-4 grid gap-2">
            {byArea.filter((item) => item.horas > 0).map((item) => (
              <div key={item.area} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <span>{item.area}</span>
                <strong>{formatHours(item.horas)}</strong>
              </div>
            ))}
            {!todayRecords.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">Nenhum tempo registrado hoje.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}
