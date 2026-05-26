"use client";

import { useMemo } from "react";
import { Check, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { inferPriority, isSaturday, normalizeText, parseISODate, saturdaySimuladoId, schedule, todayISO, weekRange } from "@/utils/schedule";

const dayLabels = [
  ["segunda", "Segunda"],
  ["terca", "Terça"],
  ["quarta", "Quarta"],
  ["quinta", "Quinta"],
  ["sexta", "Sexta"],
  ["sabado", "Sábado"],
  ["domingo", "Domingo"]
];
const shifts = [["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]];

export function ScheduleView() {
  const store = useMedboardStore();
  const selectedWeek = store.week || schedule.rows.find((row) => row.data === todayISO())?.semana || schedule.semanas[0];

  const visibleRows = useMemo(() => {
    const q = normalizeText(store.search);
    return schedule.rows.filter((row) => {
      if (store.week && row.semana !== store.week) return false;
      if (store.discipline && row.disciplina !== store.discipline) return false;
      if (store.type && row.tipo !== store.type && !(store.type === "simulado" && isSaturday(row.data))) return false;
      if (!q) return true;
      return normalizeText(`${row.disciplina} ${row.assunto} ${row.semana} ${row.dataBR} ${row.aulas.map((a) => a.aula).join(" ")}`).includes(q);
    });
  }, [store.search, store.week, store.discipline, store.type]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visibleRows>();
    visibleRows.forEach((row) => map.set(row.data, [...(map.get(row.data) || []), row]));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibleRows]);

  async function toggle(id: string, payload?: { titulo: string; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE"; materia?: string }) {
    store.toggleDone(id);
    if (payload && !store.doneIds.includes(id)) {
      api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ externalId: id, titulo: payload.titulo, data: payload.data, tipo: payload.tipo, materia: payload.materia, status: "DONE" })
      }).catch(() => toast.warning("Salvo localmente. Configure o banco para sincronizar."));
    }
  }

  return (
    <div className="grid gap-6">
      <section className="card grid gap-3 p-4 lg:grid-cols-[1.3fr_.7fr_.7fr_.7fr]">
        <label className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input className="input pl-10" placeholder="Buscar aula, tema ou disciplina" value={store.search} onChange={(e) => store.setFilter("search", e.target.value)} />
        </label>
        <select className="input" value={store.week} onChange={(e) => store.setFilter("week", e.target.value)}>
          <option value="">Todas as semanas</option>
          {schedule.semanas.map((week) => <option key={week}>{week}</option>)}
        </select>
        <select className="input" value={store.discipline} onChange={(e) => store.setFilter("discipline", e.target.value)}>
          <option value="">Todas as disciplinas</option>
          {schedule.disciplinas.map((discipline) => <option key={discipline}>{discipline}</option>)}
        </select>
        <select className="input" value={store.type} onChange={(e) => store.setFilter("type", e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="aula">Aulas</option>
          <option value="revisao">Revisões</option>
          <option value="simulado">Simulados</option>
          <option value="livre">Livres</option>
        </select>
      </section>

      <section className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <aside className="card h-fit p-4 xl:sticky xl:top-28">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-400">Semanas</h2>
          <div className="grid max-h-[520px] gap-2 overflow-auto">
            <button className={`rounded-xl px-3 py-2 text-left text-sm font-bold ${!store.week ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800"}`} onClick={() => store.setFilter("week", "")}>Todas as semanas</button>
            {schedule.semanas.map((week) => (
              <button key={week} className={`rounded-xl px-3 py-2 text-left text-sm font-bold ${store.week === week ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800"}`} onClick={() => store.setFilter("week", week)}>
                {week}<span className="block text-xs font-medium opacity-70">{weekRange(week)}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="grid gap-6">
          <article className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
              <div>
                <h2 className="text-lg font-black">Lousa semanal · {selectedWeek}</h2>
                <p className="text-sm text-slate-500">Autosave local, preparada para sincronização por API.</p>
              </div>
              <button className="btn-secondary" onClick={() => store.fillBoardTemplate(selectedWeek)}><RotateCcw size={16} /> Modelo</button>
            </div>
            <div className="overflow-x-auto p-4">
              <div className="grid min-w-[860px] gap-2">
                {shifts.map(([shiftKey, shiftLabel]) => (
                  <div key={shiftKey} className="grid grid-cols-[90px_repeat(7,1fr)] gap-2">
                    <div className="grid place-items-center rounded-xl bg-brand-50 text-sm font-black text-brand-700 dark:bg-brand-700/20 dark:text-rose-200">{shiftLabel}</div>
                    {dayLabels.map(([dayKey, dayLabel]) => {
                      const field = `${dayKey}_${shiftKey}`;
                      return (
                        <label key={field} className="grid gap-1">
                          <span className="text-xs font-bold text-slate-400">{dayLabel}</span>
                          <textarea className="input min-h-24 resize-y text-xs" value={store.board[selectedWeek]?.[field] || ""} onChange={(e) => store.setBoardField(selectedWeek, field, e.target.value)} />
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </article>

          {grouped.map(([date, rows]) => {
            const first = rows[0];
            const isToday = date === todayISO();
            return (
              <article key={date} className={`card overflow-hidden ${isToday ? "ring-2 ring-brand-500" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900">
                  <div>
                    <h3 className="text-lg font-black">{first.diaSemana} · {first.dataBR}</h3>
                    <p className="text-sm text-slate-500">{first.semana}</p>
                  </div>
                  {isToday && <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-rose-200">Hoje</span>}
                </div>
                <div className="grid gap-3 p-4">
                  {rows.flatMap((row) => [
                    ...row.aulas.map((lesson) => {
                      const priority = inferPriority(lesson);
                      const done = store.doneIds.includes(lesson.id);
                      return (
                        <button key={lesson.id} className={`grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-2xl border p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${done ? "opacity-60" : ""}`} onClick={() => toggle(lesson.id, { titulo: lesson.aula, data: lesson.data, tipo: "AULA", materia: lesson.disciplina })}>
                          <span className={`mt-1 grid h-6 w-6 place-items-center rounded-full border ${done ? "bg-emerald-500 text-white" : "border-slate-300"}`}>{done && <Check size={15} />}</span>
                          <span><strong className="block">{lesson.disciplina}</strong><span className="text-sm text-slate-500">{lesson.aula}</span></span>
                          <span className={`badge ${priority.value === "HIGH" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{priority.label}</span>
                        </button>
                      );
                    }),
                    ...row.revisoesDoDia.map((review) => (
                      <button key={review.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-left dark:border-rose-500/20 dark:bg-rose-500/10" onClick={() => toggle(review.id, { titulo: review.aula, data: row.data, tipo: "REVISAO", materia: review.disciplina })}>
                        <span className="mt-1 grid h-6 w-6 place-items-center rounded-full border border-rose-300">{store.doneIds.includes(review.id) && <Check size={15} />}</span>
                        <span><strong className="block">{review.tipoRevisao} · {review.disciplina}</strong><span className="text-sm text-slate-600 dark:text-slate-300">{review.aula}</span></span>
                        <span className="badge bg-white text-brand-700 dark:bg-slate-900">Revisão</span>
                      </button>
                    )),
                    isSaturday(row.data) ? (
                      <button key={saturdaySimuladoId(row.data)} className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-left dark:border-brand-700/30 dark:bg-brand-700/10" onClick={() => toggle(saturdaySimuladoId(row.data), { titulo: "Simulado semanal", data: row.data, tipo: "SIMULADO", materia: "Simulado" })}>
                        <strong>Simulado semanal</strong><p className="text-sm text-slate-600 dark:text-slate-300">Realizar prova e correção do fim de semana.</p>
                      </button>
                    ) : null,
                    row.domingo ? <div key={`livre-${row.row}`} className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">Domingo livre · descanso, lazer e organização leve.</div> : null
                  ])}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
