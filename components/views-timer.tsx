"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Pause, Play, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { areas, todayISO } from "@/utils/schedule";

type Productivity = { id: string; data: string; materia: string | null; horas: number; observacoes: string | null };
type FlashcardRecord = { id: string; dueDate: string; updatedAt?: string; lastDifficulty?: string | null };
type TaskRecord = { id: string; externalId: string | null; titulo: string; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia: string | null; metadata?: unknown };

const compactDate = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");
const systemOptions = [
  "Cardiologia",
  "Pneumologia",
  "Endocrinologia",
  "Nefrologia",
  "Gastroenterologia",
  "Infectologia",
  "Neurologia",
  "Reumatologia",
  "Hematologia",
  "Dermatologia",
  "Psiquiatria",
  "Ginecologia",
  "Obstetricia",
  "Pediatria",
  "Preventiva",
  "Cirurgia",
  "Emergencia"
];

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

function clockToHours(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) + Number(minutes) / 60;
}

function hoursToClock(value: number) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function extraTaskHours(task: TaskRecord) {
  if (!task.metadata || typeof task.metadata !== "object") return 0;
  const raw = (task.metadata as Record<string, unknown>).horas;
  const value = typeof raw === "number" ? raw : Number(raw || 0);
  return Number.isFinite(value) ? value : 0;
}

export function TimerView() {
  const active = useMedboardStore((state) => state.activeTimer);
  const setActive = useMedboardStore((state) => state.setActiveTimer);
  const requestFlashcardReview = useMedboardStore((state) => state.requestFlashcardReview);
  const [now, setNow] = useState(Date.now());
  const [productivity, setProductivity] = useState<Productivity[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardRecord[]>([]);
  const [extraTasks, setExtraTasks] = useState<TaskRecord[]>([]);
  const [hoursForm, setHoursForm] = useState({ data: todayISO(), materia: areas[0], sistema: systemOptions[0], horas: "", observacoes: "" });
  const [editingHours, setEditingHours] = useState<Record<string, string>>({});
  const [editingArea, setEditingArea] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api<Productivity[]>("/api/productivity"), api<FlashcardRecord[]>("/api/flashcards"), api<TaskRecord[]>("/api/tasks")])
      .then(([items, cardItems, taskItems]) => {
        setProductivity(items);
        setFlashcards(cardItems);
        setExtraTasks(taskItems.filter((task) => task.tipo === "EXTRA"));
        setEditingHours(Object.fromEntries(items.map((item) => [item.id, hoursToClock(item.horas)])));
        setEditingArea(Object.fromEntries(items.map((item) => [item.id, item.materia || areas[0]])));
      })
      .catch(() => setProductivity([]));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeElapsed = active ? active.accumulatedSeconds + (!active.paused ? Math.max(0, Math.round((now - active.startedAt) / 1000)) : 0) : 0;
  const effectiveProductivity = useMemo<Productivity[]>(() => {
    const registeredExtraIds = new Set(productivity
      .map((item) => item.observacoes?.match(/^extra-study:([^:]+):/)?.[1])
      .filter(Boolean) as string[]);
    const syntheticExtraHours = extraTasks
      .filter((task) => {
        const externalId = task.externalId || task.id;
        return extraTaskHours(task) > 0 && !registeredExtraIds.has(externalId);
      })
      .map((task) => ({
        id: `synthetic-${task.externalId || task.id}`,
        data: task.data,
        materia: task.materia,
        horas: extraTaskHours(task),
        observacoes: `extra-study:${task.externalId || task.id}:${task.titulo}`
      }));
    return [...productivity, ...syntheticExtraHours];
  }, [extraTasks, productivity]);
  const todayRecords = useMemo(() => effectiveProductivity.filter((item) => compactDate(item.data) === todayISO()), [effectiveProductivity]);
  const completedFlashToday = flashcards.filter((card) => card.updatedAt && compactDate(card.updatedAt) === todayISO() && card.lastDifficulty).length;
  const flashToday = flashcards.filter((card) => compactDate(card.dueDate) === todayISO() && !(card.updatedAt && compactDate(card.updatedAt) === todayISO() && card.lastDifficulty)).length;
  const flashOverdue = flashcards.filter((card) => compactDate(card.dueDate) < todayISO() && !(card.updatedAt && compactDate(card.updatedAt) === todayISO() && card.lastDifficulty)).length;
  const totalToday = todayRecords.reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const totalHours = effectiveProductivity.reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const activeDays = new Set(effectiveProductivity.map((item) => compactDate(item.data))).size;
  const byArea = areas.map((area) => ({
    area,
    horas: effectiveProductivity.filter((item) => item.materia === area).reduce((acc, item) => acc + Number(item.horas || 0), 0),
    today: todayRecords.filter((item) => item.materia === area).reduce((acc, item) => acc + Number(item.horas || 0), 0)
  }));

  async function stopTimer() {
    if (!active || saving) return;
    const seconds = Math.max(0, active.accumulatedSeconds + (!active.paused ? Math.round((Date.now() - active.startedAt) / 1000) : 0));
    if (seconds < 1) {
      setActive(null);
      return;
    }
    setSaving(true);
    try {
      const saved = await api<Productivity>("/api/productivity", {
        method: "POST",
        body: JSON.stringify({
          horas: seconds / 3600,
          rendimento: 100,
          materia: active.area,
          data: new Date(),
          observacoes: `sistema:${active.title || active.area}; cronometro:${formatDuration(seconds)}`
        })
      });
      api("/api/timers", {
        method: "POST",
        body: JSON.stringify({ tempo: seconds, materia: active.area, data: new Date() })
      }).catch(() => undefined);
      setProductivity((current) => [saved, ...current]);
      setEditingHours((current) => ({ ...current, [saved.id]: hoursToClock(saved.horas) }));
      setEditingArea((current) => ({ ...current, [saved.id]: saved.materia || active.area }));
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
    setActive({ area, title: area, startedAt: Date.now(), accumulatedSeconds: 0, paused: false, source: "manual" });
  }

  async function addHours() {
    if (!hoursForm.horas) {
      toast.error("Informe as horas estudadas.");
      return;
    }
    const saved = await api<Productivity>("/api/productivity", {
      method: "POST",
      body: JSON.stringify({
        data: hoursForm.data,
        materia: hoursForm.materia,
        horas: clockToHours(hoursForm.horas),
        rendimento: 100,
        observacoes: `sistema:${hoursForm.sistema}; ${hoursForm.observacoes || ""}`.trim()
      })
    });
    setProductivity((current) => [saved, ...current]);
    setEditingHours((current) => ({ ...current, [saved.id]: hoursToClock(saved.horas) }));
    setEditingArea((current) => ({ ...current, [saved.id]: saved.materia || hoursForm.materia }));
    setHoursForm((current) => ({ ...current, horas: "", observacoes: "" }));
    toast.success("Horas registradas");
  }

  async function saveHours(item: Productivity) {
    const value = editingHours[item.id];
    if (!value) return;
    const updated = await api<Productivity>(`/api/productivity/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ horas: clockToHours(value), materia: editingArea[item.id] || item.materia || areas[0] })
    });
    setProductivity((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    setEditingHours((current) => ({ ...current, [updated.id]: hoursToClock(updated.horas) }));
    setEditingArea((current) => ({ ...current, [updated.id]: updated.materia || areas[0] }));
    toast.success("Registro atualizado");
  }

  async function deleteHours(item: Productivity) {
    await api(`/api/productivity/${item.id}`, { method: "DELETE" });
    setProductivity((current) => current.filter((entry) => entry.id !== item.id));
    setEditingHours((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setEditingArea((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    toast.success("Registro apagado");
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
              const elapsed = running ? activeElapsed : 0;
              const areaToday = byArea.find((item) => item.area === area)?.today || 0;
              return (
                <div key={area} className={`rounded-2xl border p-4 transition ${running ? "border-red-300 bg-red-50 dark:border-red-400/30 dark:bg-red-500/10" : "border-violet-100 bg-slate-50 dark:border-violet-400/20 dark:bg-slate-900"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="block text-lg">{area}</strong>
                      <span className="text-sm text-slate-500">Hoje: {formatHours(areaToday)}</span>
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
            {(flashToday + flashOverdue + completedFlashToday) > 0 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-400/20 dark:bg-indigo-500/10">
                <strong className="block">Flashcards do dia</strong>
                <span className="mt-1 block text-slate-500">{flashToday} programados · {flashOverdue} atrasados</span>
                <button className="btn-primary mt-3 w-full bg-red-700 hover:bg-red-800" onClick={() => requestFlashcardReview("cronometro")}>Revisar agora</button>
              </div>
            )}
            {byArea.filter((item) => item.today > 0).map((item) => (
              <div key={item.area} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <span>{item.area}</span>
                <strong>{formatHours(item.today)}</strong>
              </div>
            ))}
            {!todayRecords.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">Nenhum tempo registrado hoje.</div>}
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Horas estudadas por matéria</h2>
        <p className="mt-1 text-sm text-slate-500">Registros manuais e do cronômetro entram aqui. Você pode corrigir horas e matéria depois de salvar.</p>
        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-3 dark:border-violet-400/20 dark:bg-violet-500/10">
          <div className="grid gap-3 md:grid-cols-4">
            <input className="input" type="date" value={hoursForm.data} onChange={(event) => setHoursForm({ ...hoursForm, data: event.target.value })} />
            <select className="input" value={hoursForm.materia} onChange={(event) => setHoursForm({ ...hoursForm, materia: event.target.value })}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
            <select className="input" value={hoursForm.sistema} onChange={(event) => setHoursForm({ ...hoursForm, sistema: event.target.value })}>{systemOptions.map((system) => <option key={system}>{system}</option>)}</select>
            <input className="input" type="time" value={hoursForm.horas} onChange={(event) => setHoursForm({ ...hoursForm, horas: event.target.value })} />
          </div>
          <input className="input mt-3" placeholder="Observação opcional. Ex.: aula de HAS + 20 questões" value={hoursForm.observacoes} onChange={(event) => setHoursForm({ ...hoursForm, observacoes: event.target.value })} />
          <button className="btn-primary mt-3 w-full bg-red-700 hover:bg-red-800" onClick={addHours}>Adicionar horas estudadas</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric title="Horas totais" value={formatHours(totalHours)} />
          <Metric title="Dias ativos" value={activeDays} />
          <Metric title="Média por dia ativo" value={formatHours(activeDays ? totalHours / activeDays : 0)} />
        </div>
        <h3 className="mt-5 text-sm font-black">Distribuição por matéria</h3>
        <div className="mt-3 grid gap-2">
          {byArea.filter((item) => item.horas > 0).map((item) => (
            <div key={item.area} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><span>{item.area}</span><strong>{formatHours(item.horas)}</strong></div>
          ))}
          {!byArea.some((item) => item.horas > 0) && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">Ainda não há horas registradas por matéria.</div>}
        </div>
        <h3 className="mt-5 text-sm font-black">Últimos registros editáveis</h3>
        <div className="mt-3 grid gap-2">
          {productivity.slice(0, 10).map((item) => (
            <div key={item.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center">
              <span><strong>{compactDate(item.data)} · {item.materia || "Sem matéria"}</strong><span className="block text-slate-500">{item.observacoes || "Sem observação"}</span></span>
              <select className="input h-10 md:w-48" value={editingArea[item.id] || item.materia || areas[0]} onChange={(event) => setEditingArea((current) => ({ ...current, [item.id]: event.target.value }))}>
                {areas.map((area) => <option key={area}>{area}</option>)}
              </select>
              <input className="input h-10 md:w-32" type="time" value={editingHours[item.id] || hoursToClock(item.horas)} onChange={(event) => setEditingHours((current) => ({ ...current, [item.id]: event.target.value }))} />
              <button className="btn-secondary h-10" onClick={() => saveHours(item)}><Save size={16} /> Salvar</button>
              <button className="btn-secondary h-10 px-3 text-red-700 dark:text-red-300" onClick={() => deleteHours(item)} title="Apagar registro"><Trash2 size={16} /></button>
            </div>
          ))}
          {!productivity.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">Nenhum registro ainda. Use o cronômetro ou adicione manualmente.</div>}
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-slate-50 p-3 dark:border-violet-400/20 dark:bg-slate-900">
      <span className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</span>
      <strong className="block text-2xl font-black">{value}</strong>
    </div>
  );
}
