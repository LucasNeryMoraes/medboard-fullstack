"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Check, Circle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import type { ExtraStudy } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, inferPriority, parseISODate, schedule, todayISO } from "@/utils/schedule";

type TaskRecord = { id: string; externalId: string | null; titulo: string; descricao: string | null; status: "PENDING" | "DONE" | "ARCHIVED"; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia: string | null; metadata?: unknown };
type LessonQuestionRecord = { lessonId: string; done: boolean; feitas: number; acertos: number; erros: number; observacoes: string | null };
type ProductivityRecord = { id: string; materia: string | null; horas: number; data: string; observacoes: string | null };
type FlashcardRecord = { id: string; dueDate: string; updatedAt?: string; lastDifficulty?: string | null };

function compactDate(value: string | Date) {
  return new Date(value).toLocaleDateString("sv-SE");
}

function toDateInput(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayISO() : date.toLocaleDateString("sv-SE");
}

function metadataNumber(task: TaskRecord, key: string) {
  if (!task.metadata || typeof task.metadata !== "object") return 0;
  const value = (task.metadata as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

export function TodayView() {
  const store = useMedboardStore();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardRecord[]>([]);
  const today = todayISO();
  const todayRows = useMemo(() => schedule.rows.filter((row) => row.data === today), [today]);
  const todayLessons = useMemo(() => todayRows.flatMap((row) => row.aulas), [todayRows]);

  useEffect(() => {
    let ignore = false;
    async function hydrate() {
      try {
        const [taskItems, questionItems, productivityItems, cardItems] = await Promise.all([
          api<TaskRecord[]>("/api/tasks"),
          api<LessonQuestionRecord[]>("/api/lesson-questions"),
          api<ProductivityRecord[]>("/api/productivity"),
          api<FlashcardRecord[]>("/api/flashcards")
        ]);
        if (ignore) return;
        setTasks(taskItems);
        setFlashcards(cardItems);
        store.setDoneIds(taskItems.filter((task) => task.status === "DONE" && task.externalId).map((task) => task.externalId as string));
        store.setLessonQuestions(Object.fromEntries(questionItems.map((item) => [item.lessonId, {
          done: item.done,
          feitas: item.feitas,
          acertos: item.acertos,
          erros: item.erros,
          observacoes: item.observacoes || ""
        }])));
        const extraTasks = taskItems.filter((task) => task.tipo === "EXTRA").map((task) => ({
          id: task.externalId || task.id,
          titulo: task.titulo,
          materia: task.materia || "Sem area",
          data: toDateInput(task.data),
          horas: metadataNumber(task, "horas"),
          observacoes: task.descricao || ""
        }));
        const existing = new Set(extraTasks.map((item) => item.id));
        const legacyExtras = productivityItems
          .filter((item) => item.observacoes?.startsWith("extra-study:"))
          .map((item) => {
            const raw = item.observacoes || "";
            const [, maybeId, ...titleParts] = raw.split(":");
            const hasStoredId = maybeId?.startsWith("extra-");
            return {
              id: hasStoredId ? maybeId : item.id,
              titulo: hasStoredId ? titleParts.join(":") || "Estudo externo" : raw.replace("extra-study:", "") || "Estudo externo",
              materia: item.materia || "Sem area",
              data: toDateInput(item.data),
              horas: item.horas,
              observacoes: ""
            };
          })
          .filter((item) => !existing.has(item.id));
        store.setExtraStudies([...extraTasks, ...legacyExtras]);
      } catch {
        toast.warning("Nao consegui atualizar a aba Hoje agora.");
      }
    }
    hydrate();
    return () => { ignore = true; };
  }, []);

  const todayExtras = store.extraStudies.filter((study) => study.data === today);
  const overdueLessons = allLessons().filter((lesson) => parseISODate(lesson.data) < parseISODate(today) && !store.doneIds.includes(lesson.id));
  const overdueReviews = schedule.rows
    .flatMap((row) => row.revisoesDoDia.map((review) => ({ ...review, data: row.data, dataBR: row.dataBR })))
    .filter((review) => parseISODate(review.data) < parseISODate(today) && !store.doneIds.includes(review.id));
  const taskReviewsOverdue = tasks
    .filter((task) => task.tipo === "REVISAO" && task.status !== "DONE" && task.externalId && !task.externalId.startsWith("review-flashcard-"))
    .filter((task) => compactDate(task.data) < today);
  const flashCompletedToday = flashcards.filter((card) => card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty).length;
  const flashToday = flashcards.filter((card) => compactDate(card.dueDate) === today && !(card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty)).length;
  const flashOverdue = flashcards.filter((card) => compactDate(card.dueDate) < today && !(card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty)).length;
  const flashTotal = flashToday + flashOverdue + flashCompletedToday;

  const questionItems = [...todayLessons.map((lesson) => lesson.id), ...todayExtras.map((study) => study.id)];
  const questionDone = questionItems.filter((id) => {
    const item = store.lessonQuestions[id];
    return item && (item.done || Number(item.feitas || 0) > 0 || Number(item.acertos || 0) > 0 || Number(item.erros || 0) > 0);
  }).length;
  const totalUnits = todayLessons.length + todayExtras.length + questionItems.length + flashTotal + overdueLessons.length + overdueReviews.length + taskReviewsOverdue.length;
  const doneUnits = todayLessons.filter((lesson) => store.doneIds.includes(lesson.id)).length
    + todayExtras.filter((study) => store.doneIds.includes(study.id)).length
    + questionDone
    + flashCompletedToday;
  const dayPct = totalUnits ? Math.round((doneUnits / totalUnits) * 100) : 0;

  async function syncTask(id: string, checked: boolean, payload: { titulo: string; data: string; tipo: "AULA" | "REVISAO" | "EXTRA"; materia?: string; descricao?: string; metadata?: unknown }) {
    store.toggleDone(id);
    try {
      const saved = await api<TaskRecord>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ externalId: id, titulo: payload.titulo, descricao: payload.descricao, data: payload.data, tipo: payload.tipo, materia: payload.materia, metadata: payload.metadata, status: checked ? "DONE" : "PENDING" })
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

  function reviewFlashcards() {
    store.requestFlashcardReview("hoje");
  }

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Hoje</span>
            <h2 className="mt-1 text-2xl font-black">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</h2>
          </div>
          <button className="btn-secondary" onClick={() => window.location.reload()}><RotateCcw size={16} /> Atualizar</button>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Progresso do dia</h2>
            <p className="mt-1 text-sm text-slate-500">{doneUnits} de {totalUnits} itens concluídos</p>
          </div>
          <strong className="text-4xl font-black">{dayPct}%</strong>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
          <div className="h-full rounded-full bg-red-700 transition-all" style={{ width: `${dayPct}%` }} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-black">Aulas de hoje</h2>
        <div className="mt-4 grid gap-3">
          {todayLessons.map((lesson) => <LessonCard key={lesson.id} id={lesson.id} title={lesson.aula} area={lesson.disciplina} priority={inferPriority(lesson).label} done={store.doneIds.includes(lesson.id)} question={store.lessonQuestions[lesson.id]} onDone={(checked) => syncTask(lesson.id, checked, { titulo: lesson.aula, data: lesson.data, tipo: "AULA", materia: lesson.disciplina })} onQuestion={(value) => syncQuestion(lesson.id, value)} />)}
          {!todayLessons.length && <Empty text="Nenhuma aula prevista para hoje." />}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-black">Aulas fora do cronograma</h2>
        <div className="mt-4 grid gap-3">
          {todayExtras.map((study) => <LessonCard key={study.id} id={study.id} title={study.titulo} area={study.materia} priority="Extra" done={store.doneIds.includes(study.id)} question={store.lessonQuestions[study.id]} onDone={(checked) => syncTask(study.id, checked, { titulo: study.titulo, data: study.data, tipo: "EXTRA", materia: study.materia, descricao: study.observacoes, metadata: { horas: study.horas } })} onQuestion={(value) => syncQuestion(study.id, value)} />)}
          {!todayExtras.length && <Empty text="Nenhuma aula fora do cronograma cadastrada para hoje." />}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Flashcards para revisar</h2>
            <p className="mt-1 text-sm text-slate-500">{flashToday} programados · {flashOverdue} atrasados · {flashCompletedToday}/{flashTotal || 0} concluídos</p>
          </div>
          <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={reviewFlashcards}><BookOpenCheck size={16} /> Revisar flashcards de hoje</button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-black">Pendências atrasadas</h2>
        <div className="mt-4 grid gap-3">
          {!!flashOverdue && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-400/20 dark:bg-indigo-500/10">
              <span><strong>Flashcards atrasados</strong><span className="block text-sm text-slate-500">{flashOverdue} card(s) pendente(s)</span></span>
              <button className="btn-secondary" onClick={reviewFlashcards}>Revisar atrasados</button>
            </div>
          )}
          {overdueLessons.slice(0, 6).map((lesson) => (
            <div key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
              <span><strong>{lesson.aula}</strong><span className="block text-slate-500">{lesson.disciplina} · {lesson.dataBR}</span></span>
              <button className="btn-secondary" onClick={() => syncTask(lesson.id, true, { titulo: lesson.aula, data: lesson.data, tipo: "AULA", materia: lesson.disciplina })}>Concluir</button>
            </div>
          ))}
          {overdueReviews.slice(0, 4).map((review) => (
            <div key={review.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><strong>{review.tipoRevisao} · {review.disciplina}</strong><span className="block text-slate-500">{review.aula}</span></div>
          ))}
          {taskReviewsOverdue.slice(0, 4).map((review) => (
            <div key={review.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><strong>{review.titulo}</strong><span className="block text-slate-500">{review.materia || "Revisao"} · {compactDate(review.data)}</span></div>
          ))}
          {!flashOverdue && !overdueLessons.length && !overdueReviews.length && !taskReviewsOverdue.length && <Empty text="Nenhuma pendência atrasada." />}
        </div>
      </section>
    </div>
  );
}

function LessonCard({ title, area, priority, done, question, onDone, onQuestion }: {
  id: string;
  title: string;
  area: string;
  priority: string;
  done: boolean;
  question?: { done: boolean; feitas: number; acertos: number; erros: number; observacoes: string };
  onDone: (checked: boolean) => void;
  onQuestion: (value: Partial<{ done: boolean; feitas: number; acertos: number; erros: number; observacoes: string }>) => void;
}) {
  const q = question || { done: false, feitas: 0, acertos: 0, erros: 0, observacoes: "" };
  return (
    <article className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <div className="grid gap-3 md:grid-cols-[auto_1fr_auto]">
        <button className="mt-1" aria-label={done ? "Desmarcar" : "Concluir"} onClick={() => onDone(!done)}>
          {done ? <Check className="text-emerald-500" size={20} /> : <Circle className="text-slate-400" size={20} />}
        </button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{area}</strong>
            <span className="badge bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white">{priority}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{title}</p>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-400/20 dark:bg-violet-500/10">
        <label className="flex items-center gap-2 text-sm font-black">
          <input type="checkbox" checked={q.done} onChange={(event) => onQuestion({ done: event.target.checked })} />
          Questões desta aula concluídas
        </label>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <input className="input" type="number" min="0" placeholder="Questões feitas" value={q.feitas || ""} onChange={(event) => onQuestion({ feitas: Number(event.target.value || 0) })} />
          <input className="input" type="number" min="0" placeholder="Acertos" value={q.acertos || ""} onChange={(event) => onQuestion({ acertos: Number(event.target.value || 0) })} />
          <input className="input" type="number" min="0" placeholder="Erros" value={q.erros || ""} onChange={(event) => onQuestion({ erros: Number(event.target.value || 0) })} />
        </div>
      </div>
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">{text}</div>;
}
