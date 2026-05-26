"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarCheck2, Clock3, Target } from "lucide-react";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { allLessons, allProgressIds, areas, parseISODate, schedule, todayISO } from "@/utils/schedule";

export function DashboardView() {
  const doneIds = useMedboardStore((state) => state.doneIds);
  const setTab = useMedboardStore((state) => state.setTab);
  const ids = useMemo(() => allProgressIds(), []);
  const lessons = useMemo(() => allLessons(), []);
  const overdue = lessons.filter((lesson) => parseISODate(lesson.data) < parseISODate(todayISO()) && !doneIds.includes(lesson.id));
  const progress = ids.length ? Math.round((doneIds.length / ids.length) * 100) : 0;
  const areaData = areas.map((area) => {
    const total = lessons.filter((lesson) => lesson.disciplina === area).length;
    const done = lessons.filter((lesson) => lesson.disciplina === area && doneIds.includes(lesson.id)).length;
    return { area: area.replace("Ginecologia e Obstetrícia", "GO").replace("Clínica Médica", "Clínica"), progresso: total ? Math.round((done / total) * 100) : 0 };
  });

  const cards = [
    { label: "Progresso total", value: `${progress}%`, icon: Target, detail: `${doneIds.length} de ${ids.length} itens` },
    { label: "Aulas atrasadas", value: overdue.length, icon: AlertTriangle, detail: "pendentes até hoje" },
    { label: "Dias do cronograma", value: schedule.stats.totalDias, icon: CalendarCheck2, detail: `${schedule.stats.inicio} até ${schedule.stats.fim}` },
    { label: "Revisões planejadas", value: schedule.stats.totalRevisoes, icon: Clock3, detail: "15 e 30 dias" }
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article className="card p-5" key={card.label}>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">{card.label}</span>
              <card.icon className="text-brand-600" size={20} />
            </div>
            <strong className="text-3xl font-black tracking-tight">{card.value}</strong>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <article className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black">Desempenho por área</h2>
            <button className="btn-secondary" onClick={() => setTab("simulados")}>Registrar simulado</button>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areaData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="area" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="progresso" fill="#b91c1c" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Prioridades automáticas</h2>
          <div className="mt-4 grid gap-3">
            {overdue.slice(0, 6).map((lesson) => (
              <div key={lesson.id} className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm dark:border-rose-500/20 dark:bg-rose-500/10">
                <strong>{lesson.disciplina}</strong>
                <p className="text-slate-600 dark:text-slate-300">{lesson.aula}</p>
              </div>
            ))}
            {!overdue.length && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-white/10">Nenhuma aula atrasada pendente.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}
