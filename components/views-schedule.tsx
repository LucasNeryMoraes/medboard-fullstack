"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Circle, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import type { ExtraStudy } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, allProgressIds, areas, inferPriority, isSaturday, normalizeText, parseISODate, saturdaySimuladoId, schedule, todayISO, weekRange } from "@/utils/schedule";

type TaskRecord = { id: string; externalId: string | null; titulo: string; descricao: string | null; status: "PENDING" | "DONE" | "ARCHIVED"; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia: string | null; metadata?: unknown };
type LessonQuestionRecord = { lessonId: string; done: boolean; feitas: number; acertos: number; erros: number; observacoes: string | null };
type ProductivityRecord = { id: string; materia: string | null; horas: number; data: string; observacoes: string | null };

const dayLabels = [
  ["segunda", "Segunda"],
  ["terca", "Terca"],
  ["quarta", "Quarta"],
  ["quinta", "Quinta"],
  ["sexta", "Sexta"],
  ["sabado", "Sabado"],
  ["domingo", "Domingo"]
];
const shifts = [["manha", "Manha"], ["tarde", "Tarde"], ["noite", "Noite"]];

function toDateInput(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayISO() : date.toLocaleDateString("sv-SE");
}

export function ScheduleView() {
  const store = useMedboardStore();
  const [overdueMode, setOverdueMode] = useState<"pending" | "all">("pending");
  const [extraForm, setExtraForm] = useState({ titulo: "", materia: "", data: todayISO(), horas: "" });
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const selectedWeek = store.week || schedule.rows.find((row) => row.data === todayISO())?.semana || schedule.semanas[0];
  const totalProgressIds = useMemo(() => allProgressIds(), []);
  const progressPct = totalProgressIds.length ? Math.round((store.doneIds.length / totalProgressIds.length) * 100) : 0;
  const daysRemaining = Math.max(0, Math.ceil((parseISODate(schedule.stats.fim).getTime() - parseISODate(todayISO()).getTime()) / 86_400_000));

  useEffect(() => {
    let ignore = false;
    async function hydrate() {
      try {
        const [tasks, questions, productivity] = await Promise.all([
          api<TaskRecord[]>("/api/tasks"),
          api<LessonQuestionRecord[]>("/api/lesson-questions"),
          api<ProductivityRecord[]>("/api/productivity")
        ]);
        if (ignore) return;
        setTasks(tasks);
        store.setDoneIds(tasks.filter((task) => task.status === "DONE" && task.externalId).map((task) => task.externalId as string));
        store.setLessonQuestions(Object.fromEntries(questions.map((item) => [item.lessonId, {
          done: item.done,
          feitas: item.feitas,
          acertos: item.acertos,
          erros: item.erros,
          observacoes: item.observacoes || ""
        }])));
        store.setExtraStudies(productivity
          .filter((item) => item.observacoes?.startsWith("extra-study:"))
          .map((item) => ({
            id: item.id,
            titulo: item.observacoes?.replace("extra-study:", "") || "Estudo externo",
            materia: item.materia || "Sem area",
            data: toDateInput(item.data),
            horas: item.horas
          })));
      } catch {
        // Modo demo ou sessao expirada: mantem a experiencia local.
      }
    }
    hydrate();
    return () => { ignore = true; };
  }, []);

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

  const generatedReviewsByDate = useMemo(() => {
    const map = new Map<string, TaskRecord[]>();
    tasks
      .filter((task) => task.tipo === "REVISAO")
      .filter((task) => task.externalId?.startsWith("review-"))
      .forEach((task) => {
        const date = toDateInput(task.data);
        map.set(date, [...(map.get(date) || []), task]);
      });
    return map;
  }, [tasks]);

  const overdueLessons = useMemo(() => {
    const today = parseISODate(todayISO());
    return allLessons()
      .filter((lesson) => parseISODate(lesson.data) < today)
      .filter((lesson) => overdueMode === "all" || !store.doneIds.includes(lesson.id))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [overdueMode, store.doneIds]);

  const pendingOverdue = useMemo(() => {
    const today = parseISODate(todayISO());
    return allLessons().filter((lesson) => parseISODate(lesson.data) < today && !store.doneIds.includes(lesson.id));
  }, [store.doneIds]);

  async function syncTask(id: string, checked: boolean, payload: { titulo: string; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE"; materia?: string }) {
    store.toggleDone(id);
    try {
      const saved = await api<TaskRecord>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ externalId: id, titulo: payload.titulo, data: payload.data, tipo: payload.tipo, materia: payload.materia, status: checked ? "DONE" : "PENDING" })
      });
      setTasks((current) => [saved, ...current.filter((task) => task.id !== saved.id)]);
    } catch {
      toast.warning("Alteracao salva localmente; faca login para sincronizar.");
    }
  }

  async function syncQuestion(lessonId: string, value: Partial<{ done: boolean; feitas: number; acertos: number; erros: number; observacoes: string }>) {
    const current = store.lessonQuestions[lessonId] || { done: false, feitas: 0, acertos: 0, erros: 0, observacoes: "" };
    const next = { ...current, ...value };
    store.setLessonQuestion(lessonId, next);
    try {
      await api(`/api/lesson-questions/${lessonId}`, { method: "PATCH", body: JSON.stringify(next) });
    } catch {
      toast.warning("Questoes salvas localmente; faca login para sincronizar.");
    }
  }

  function metadataValue(task: TaskRecord, key: "source" | "sourceId") {
    if (!task.metadata || typeof task.metadata !== "object") return "";
    const value = (task.metadata as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  }

  function openReviewInNotebook(task: TaskRecord) {
    const source = metadataValue(task, "source");
    const sourceId = metadataValue(task, "sourceId");
    if (source !== "error-note" && source !== "flashcard") {
      toast.error("Nao consegui identificar o item dessa revisao.");
      return;
    }
    store.setReviewTarget({ source, sourceId, materia: task.materia, taskId: task.id, externalId: task.externalId });
    store.setTab("caderno");
    toast.success("Abri o caderno para responder essa revisao.");
  }

  async function addExtraStudy() {
    if (!extraForm.titulo.trim() || !extraForm.materia || !extraForm.data || !extraForm.horas) {
      toast.error("Preencha tema, area, data e horas.");
      return;
    }
    const study: ExtraStudy = {
      id: crypto.randomUUID(),
      titulo: extraForm.titulo.trim(),
      materia: extraForm.materia,
      data: extraForm.data,
      horas: Number(extraForm.horas)
    };
    store.addExtraStudy(study);
    setExtraForm({ titulo: "", materia: "", data: todayISO(), horas: "" });
    try {
      await api("/api/productivity", {
        method: "POST",
        body: JSON.stringify({ materia: study.materia, data: study.data, horas: study.horas, rendimento: 100, observacoes: `extra-study:${study.titulo}` })
      });
      toast.success("Estudo externo salvo");
    } catch {
      toast.warning("Estudo salvo localmente; faca login para sincronizar.");
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 md:grid-cols-3">
        <article className="card p-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Dias restantes</span>
          <strong className="mt-1 block text-2xl font-black tracking-tight">{daysRemaining}</strong>
          <small className="font-bold text-slate-500 dark:text-slate-400">dias ate o fim do cronograma</small>
        </article>
        <article className="card p-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Aulas atrasadas</span>
          <strong className="mt-1 block text-2xl font-black tracking-tight">{pendingOverdue.length}</strong>
        </article>
        <article className="card p-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Progresso total do cronograma</span>
          <strong className="mt-1 block text-2xl font-black tracking-tight">{progressPct}%</strong>
          <small className="font-bold text-slate-500 dark:text-slate-400">{store.doneIds.length} de {totalProgressIds.length} concluidos</small>
        </article>
      </section>

      <section className="card grid gap-3 p-3 lg:grid-cols-[1.3fr_.7fr_.7fr_.7fr]">
        <label className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input className="input pl-10" placeholder="Buscar aula, tema ou disciplina" value={store.search} onChange={(event) => store.setFilter("search", event.target.value)} />
        </label>
        <select className="input" value={store.week} onChange={(event) => store.setFilter("week", event.target.value)}>
          <option value="">Todas as semanas</option>
          {schedule.semanas.map((week) => <option key={week}>{week}</option>)}
        </select>
        <select className="input" value={store.discipline} onChange={(event) => store.setFilter("discipline", event.target.value)}>
          <option value="">Todas as disciplinas</option>
          {schedule.disciplinas.map((discipline) => <option key={discipline}>{discipline}</option>)}
        </select>
        <select className="input" value={store.type} onChange={(event) => store.setFilter("type", event.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="aula">Aulas</option>
          <option value="revisao">Revisoes</option>
          <option value="simulado">Simulados</option>
          <option value="livre">Livres</option>
        </select>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-violet-100 pb-4 dark:border-violet-400/20">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black tracking-tight"><span className="h-2.5 w-2.5 rounded-full bg-fuchsia-500" />Aulas atrasadas</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Lista automatica com todas as aulas do cronograma que ficaram pendentes ate hoje.</p>
          </div>
          <div className="min-w-20 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-center text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200">
            <strong className="block text-2xl">{pendingOverdue.length}</strong>
            <span className="text-xs font-bold">pendente(s)</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={`rounded-full px-4 py-2 text-sm font-bold ${overdueMode === "pending" ? "bg-fuchsia-600 text-white" : "border border-violet-100 text-violet-900 dark:border-white/10 dark:text-violet-100"}`} onClick={() => setOverdueMode("pending")}>Pendentes</button>
          <button className={`rounded-full px-4 py-2 text-sm font-bold ${overdueMode === "all" ? "bg-fuchsia-600 text-white" : "border border-violet-100 text-violet-900 dark:border-white/10 dark:text-violet-100"}`} onClick={() => setOverdueMode("all")}>Todas</button>
        </div>
        <div className="mt-4 grid gap-3">
          {overdueLessons.map((lesson) => (
            <article key={lesson.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="font-black text-fuchsia-600">{lesson.dataBR} - {lesson.disciplina}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300 md:text-right">{lesson.aula}<br />{lesson.semana} - {lesson.horario}</div>
              </div>
              <button className="mt-4 w-full rounded-xl bg-violet-950 px-4 py-2.5 text-sm font-black text-white" onClick={() => syncTask(lesson.id, true, { titulo: lesson.aula, data: lesson.data, tipo: "AULA", materia: lesson.disciplina })}>Marcar como assistida</button>
            </article>
          ))}
          {!overdueLessons.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-white/10">Nenhuma aula atrasada encontrada.</div>}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-black">Estudos fora do cronograma</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Adicione aulas e assuntos estudados externamente.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="Tema / aula estudada" value={extraForm.titulo} onChange={(event) => setExtraForm((current) => ({ ...current, titulo: event.target.value }))} />
          <select className="input" value={extraForm.materia} onChange={(event) => setExtraForm((current) => ({ ...current, materia: event.target.value }))}>
            <option value="">Area</option>
            {areas.map((area) => <option key={area}>{area}</option>)}
          </select>
          <input className="input" type="date" value={extraForm.data} onChange={(event) => setExtraForm((current) => ({ ...current, data: event.target.value }))} />
          <input className="input" type="number" min="0" step="0.25" placeholder="Horas estudadas" value={extraForm.horas} onChange={(event) => setExtraForm((current) => ({ ...current, horas: event.target.value }))} />
        </div>
        <button className="btn-primary mt-4 w-full bg-red-700 hover:bg-red-800" onClick={addExtraStudy}>Adicionar estudo</button>
        <div className="mt-5 grid gap-2">
          {store.extraStudies.map((study) => (
            <div key={study.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
              <strong>{study.titulo}</strong>
              <span className="text-slate-500">{study.materia} - {study.data} - {study.horas}h</span>
            </div>
          ))}
          {!store.extraStudies.length && <p className="py-4 text-center text-sm text-slate-400">Nenhum estudo externo adicionando.</p>}
        </div>
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
                <h2 className="text-lg font-black">Lousa semanal - {selectedWeek}</h2>
                <p className="text-sm text-slate-500">Autosave local com estrutura pronta para sincronizacao.</p>
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
                          <textarea className="input min-h-24 resize-y text-xs" value={store.board[selectedWeek]?.[field] || ""} onChange={(event) => store.setBoardField(selectedWeek, field, event.target.value)} />
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
            const lessonCount = rows.reduce((acc, row) => acc + row.aulas.length, 0);
            const generatedReviews = (generatedReviewsByDate.get(date) || [])
              .filter((task) => !store.discipline || task.materia === store.discipline)
              .filter(() => !store.type || store.type === "revisao");
            return (
              <article key={date} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 p-4 dark:border-white/10">
                  <div>
                    <h3 className="text-lg font-black">{first.diaSemana} - {first.dataBR}</h3>
                    <p className="text-sm text-slate-500">{first.semana}</p>
                  </div>
                  <div className="flex gap-2">
                    {isToday && <span className="badge bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">Hoje</span>}
                    {!!lessonCount && <span className="badge bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">{lessonCount} aula(s)</span>}
                  </div>
                </div>
                <div className="grid gap-3 p-4">
                  {generatedReviews.map((task) => {
                    const reviewDone = task.status === "DONE";
                    return (
                    <button key={task.id} className="grid gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-left dark:border-fuchsia-400/20 dark:bg-fuchsia-500/10" onClick={() => openReviewInNotebook(task)}>
                      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                      <span className="mt-1 grid h-6 w-6 place-items-center rounded-full border border-fuchsia-300">{reviewDone && <Check size={15} />}</span>
                      <span>
                        <strong className="block">{reviewDone ? "Revisado" : "Revisão do caderno"} - {task.materia || "Caderno de erros"}</strong>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{task.titulo}</span>
                        {task.descricao && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{task.descricao}</span>}
                      </span>
                      <span className="badge bg-white text-fuchsia-700 dark:bg-slate-900 dark:text-fuchsia-200">{reviewDone ? "Respondido" : "Responder no caderno"}</span>
                      </div>
                    </button>
                  );})}
                  {rows.flatMap((row) => [
                    ...row.aulas.map((lesson) => {
                      const priority = inferPriority(lesson);
                      const done = store.doneIds.includes(lesson.id);
                      const q = store.lessonQuestions[lesson.id] || { done: false, feitas: 0, acertos: 0, erros: 0, observacoes: "" };
                      return (
                        <div key={lesson.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                          <div className="grid gap-3 md:grid-cols-[auto_1fr_auto]">
                            <button className="mt-1" aria-label={done ? "Desmarcar aula" : "Marcar aula"} onClick={() => syncTask(lesson.id, !done, { titulo: lesson.aula, data: lesson.data, tipo: "AULA", materia: lesson.disciplina })}>
                              {done ? <Check className="text-emerald-500" size={20} /> : <Circle className="text-slate-400" size={20} />}
                            </button>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <strong>{lesson.disciplina}</strong>
                                <span className="badge bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white">{priority.value === "HIGH" ? "Alta incidencia" : priority.value === "MEDIUM" ? "Incidencia moderada" : "Baixa incidencia"}</span>
                              </div>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{lesson.aula}</p>
                            </div>
                            <div className="text-sm md:text-right">
                              <span className="badge bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">Aula</span>
                              <p className="mt-2 text-slate-500">{lesson.horario}</p>
                            </div>
                          </div>
                          <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-400/20 dark:bg-violet-500/10">
                            <label className="flex items-center gap-2 text-sm font-black text-violet-950 dark:text-violet-100">
                              <input type="checkbox" checked={q.done} onChange={(event) => syncQuestion(lesson.id, { done: event.target.checked })} />
                              Questoes desta aula concluidas
                            </label>
                            <div className="mt-4 grid gap-2 md:grid-cols-3">
                              <input className="input" type="number" min="0" placeholder="Questoes feitas" value={q.feitas || ""} onChange={(event) => syncQuestion(lesson.id, { feitas: Number(event.target.value || 0) })} />
                              <input className="input" type="number" min="0" placeholder="Acertos" value={q.acertos || ""} onChange={(event) => syncQuestion(lesson.id, { acertos: Number(event.target.value || 0) })} />
                              <input className="input" type="number" min="0" placeholder="Erros" value={q.erros || ""} onChange={(event) => syncQuestion(lesson.id, { erros: Number(event.target.value || 0) })} />
                            </div>
                            <textarea className="input mt-2 min-h-12" placeholder="Especificacoes: banca, QBank, principais erros, temas dificeis..." value={q.observacoes} onChange={(event) => syncQuestion(lesson.id, { observacoes: event.target.value })} />
                          </div>
                        </div>
                      );
                    }),
                    ...row.revisoesDoDia.map((review) => (
                      <button key={review.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-left dark:border-rose-500/20 dark:bg-rose-500/10" onClick={() => syncTask(review.id, !store.doneIds.includes(review.id), { titulo: review.aula, data: row.data, tipo: "REVISAO", materia: review.disciplina })}>
                        <span className="mt-1 grid h-6 w-6 place-items-center rounded-full border border-rose-300">{store.doneIds.includes(review.id) && <Check size={15} />}</span>
                        <span><strong className="block">{review.tipoRevisao} - {review.disciplina}</strong><span className="text-sm text-slate-600 dark:text-slate-300">{review.aula}</span></span>
                        <span className="badge bg-white text-brand-700 dark:bg-slate-900">Revisao</span>
                      </button>
                    )),
                    isSaturday(row.data) ? (
                      <button key={saturdaySimuladoId(row.data)} className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-left dark:border-brand-700/30 dark:bg-brand-700/10" onClick={() => syncTask(saturdaySimuladoId(row.data), !store.doneIds.includes(saturdaySimuladoId(row.data)), { titulo: "Simulado semanal", data: row.data, tipo: "SIMULADO", materia: "Simulado" })}>
                        <strong>Simulado semanal</strong><p className="text-sm text-slate-600 dark:text-slate-300">Realizar prova e correcao do fim de semana.</p>
                      </button>
                    ) : null,
                    row.domingo ? <div key={`livre-${row.row}`} className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">Domingo livre - descanso, lazer e organizacao leve.</div> : null
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
