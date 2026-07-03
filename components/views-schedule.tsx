"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Circle, Pause, Play, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import type { ExtraStudy } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, allProgressIds, applyScheduleOverrides, areas, buildCronogramSchedule, dateOnlyISO, inferPriority, isSaturday, normalizeText, parseISODate, saturdaySimuladoId, schedule, todayISO } from "@/utils/schedule";

type TaskRecord = { id: string; externalId: string | null; titulo: string; descricao: string | null; status: "PENDING" | "OVERDUE" | "DONE" | "RESCHEDULED" | "ARCHIVED"; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia: string | null; metadata?: unknown };
type LessonQuestionRecord = { lessonId: string; done: boolean; feitas: number; acertos: number; erros: number; observacoes: string | null };
type LessonQuestionValue = { done: boolean; feitas: number; acertos: number; erros: number; observacoes: string };
type ProductivityRecord = { id: string; materia: string | null; horas: number; data: string; observacoes: string | null };
type FlashcardRecord = { id: string; dueDate: string; updatedAt?: string; lastDifficulty?: string | null };
type ScheduleSettingsRecord = { cronogramStartDate: string; resetMode: "SMART" | "FULL" };
type ReorganizationPreview = { lessons: unknown[]; reviews: unknown[]; flashcards: unknown[]; latestSnapshotId: string | null };
type ReorganizationResult = { snapshotId: string; lessons: number; reviews: number; flashcards: number };

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
  const dateOnly = dateOnlyISO(value);
  if (dateOnly) return dateOnly;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayISO() : date.toLocaleDateString("sv-SE");
}

function clockToHours(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) + Number(minutes) / 60;
}

function formatHours(value: number) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

function compactDate(value: string | Date) {
  return new Date(value).toLocaleDateString("sv-SE");
}

function weekRangeFromRows(rows: { semana: string; data: string }[], week: string) {
  const dates = rows.filter((row) => row.semana === week).map((row) => row.data).sort();
  if (!dates.length) return "";
  const format = (iso: string) => parseISODate(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${format(dates[0])} a ${format(dates[dates.length - 1])}`;
}

function daysLate(dateISO: string) {
  return Math.max(1, Math.floor((parseISODate(todayISO()).getTime() - parseISODate(dateISO).getTime()) / 86_400_000));
}

function LateBadge({ date }: { date: string }) {
  const days = daysLate(date);
  return <span className="badge bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200">Atrasada ha {days} dia{days > 1 ? "s" : ""}</span>;
}

type ScheduleViewProps = {
  mode?: "full" | "today";
};

export function ScheduleView({ mode = "full" }: ScheduleViewProps = {}) {
  const store = useMedboardStore();
  const todayMode = mode === "today";
  const [overdueMode, setOverdueMode] = useState<"pending" | "all">("pending");
  const [showOverdueLessons, setShowOverdueLessons] = useState(false);
  const [extraForm, setExtraForm] = useState({ titulo: "", materia: "", data: todayISO(), horas: "", observacoes: "", feitas: "", acertos: "", erros: "" });
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardRecord[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [reorganizing, setReorganizing] = useState(false);
  const [latestSnapshotId, setLatestSnapshotId] = useState<string | null>(null);
  const completedDates = useMemo(() => Object.fromEntries(tasks.filter((task) => task.status === "DONE" && task.externalId).map((task) => [task.externalId as string, toDateInput(task.data)])), [tasks]);
  const rescheduledDates = useMemo(() => Object.fromEntries(tasks.filter((task) => task.status === "RESCHEDULED" && task.externalId).map((task) => [task.externalId as string, toDateInput(task.data)])), [tasks]);
  const activeStartDate = settingsLoaded ? store.cronogramStartDate : schedule.stats.inicio;
  const currentSchedule = useMemo(() => applyScheduleOverrides(
    buildCronogramSchedule({ startDate: activeStartDate, completedIds: store.doneIds, completedDates, resetMode: store.cronogramResetMode }),
    { rescheduledDates, completedIds: store.doneIds }
  ), [activeStartDate, completedDates, rescheduledDates, store.cronogramResetMode, store.doneIds]);
  const selectedWeek = store.week || currentSchedule.rows.find((row) => row.data === todayISO())?.semana || currentSchedule.semanas[0];
  const totalProgressIds = useMemo(() => allProgressIds(currentSchedule.rows), [currentSchedule.rows]);
  const extraProgressIds = useMemo(() => new Set(store.extraStudies.map((study) => study.id)), [store.extraStudies]);
  const progressDoneCount = useMemo(() => {
    const staticDone = store.doneIds.filter((id) => totalProgressIds.includes(id)).length;
    const extraDone = store.doneIds.filter((id) => extraProgressIds.has(id)).length;
    return staticDone + extraDone;
  }, [extraProgressIds, store.doneIds, totalProgressIds]);
  const progressTotal = totalProgressIds.length + extraProgressIds.size;
  const progressPct = progressTotal ? Math.round((progressDoneCount / progressTotal) * 100) : 0;
  const daysRemaining = Math.max(0, Math.ceil((parseISODate(currentSchedule.stats.fim).getTime() - parseISODate(todayISO()).getTime()) / 86_400_000));

  useEffect(() => {
    let ignore = false;
    async function hydrate() {
      try {
        const [tasks, questions, productivity, flashcards, settings] = await Promise.all([
          api<TaskRecord[]>("/api/tasks"),
          api<LessonQuestionRecord[]>("/api/lesson-questions"),
          api<ProductivityRecord[]>("/api/productivity"),
          api<FlashcardRecord[]>("/api/flashcards"),
          api<ScheduleSettingsRecord>("/api/schedule-settings")
        ]);
        if (ignore) return;
        setTasks(tasks);
        setFlashcards(flashcards);
        store.setCronogramSettings({ cronogramStartDate: toDateInput(settings.cronogramStartDate), resetMode: settings.resetMode });
        setSettingsLoaded(true);
        store.setDoneIds(tasks.filter((task) => task.status === "DONE" && task.externalId).map((task) => task.externalId as string));
        store.setLessonQuestions(Object.fromEntries(questions.map((item) => [item.lessonId, {
          done: item.done,
          feitas: item.feitas,
          acertos: item.acertos,
          erros: item.erros,
          observacoes: item.observacoes || ""
        }])));
        const extraTasks = tasks
          .filter((task) => task.tipo === "EXTRA")
          .map((task) => ({
            id: task.externalId || task.id,
            titulo: task.titulo,
            materia: task.materia || "Sem area",
            data: toDateInput(task.data),
            horas: typeof task.metadata === "object" && task.metadata && typeof (task.metadata as Record<string, unknown>).horas === "number" ? (task.metadata as Record<string, number>).horas : 0,
            observacoes: task.descricao || ""
          }));
        const existingExtraIds = new Set(extraTasks.map((study) => study.id));
        const legacyExtraStudies = productivity
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
          .filter((study) => !existingExtraIds.has(study.id));
        store.setExtraStudies([...extraTasks, ...legacyExtraStudies]);
      } catch {
        store.setCronogramSettings({ cronogramStartDate: schedule.stats.inicio, resetMode: "SMART" });
        setSettingsLoaded(true);
        // Modo demo ou sessao expirada: mantem a experiencia local.
      }
    }
    hydrate();
    return () => { ignore = true; };
  }, []);

  const visibleRows = useMemo(() => {
    const q = normalizeText(store.search);
    return currentSchedule.rows.filter((row) => {
      if (todayMode) return row.data === todayISO();
      if (store.week && row.semana !== store.week) return false;
      if (store.discipline && row.disciplina !== store.discipline) return false;
      if (store.type && row.tipo !== store.type && !(store.type === "simulado" && isSaturday(row.data))) return false;
      if (!q) return true;
      return normalizeText(`${row.disciplina} ${row.assunto} ${row.semana} ${row.dataBR} ${row.aulas.map((a) => a.aula).join(" ")}`).includes(q);
    });
  }, [currentSchedule.rows, store.search, store.week, store.discipline, store.type, todayMode]);

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
      .filter((task) => task.externalId && !task.externalId.startsWith("review-flashcard-"))
      .forEach((task) => {
        const date = toDateInput(task.data);
        map.set(date, [...(map.get(date) || []), task]);
      });
    return map;
  }, [tasks]);

  const overdueLessons = useMemo(() => {
    const today = parseISODate(todayISO());
    return allLessons(currentSchedule.rows)
      .filter((lesson) => parseISODate(lesson.data) < today)
      .filter((lesson) => overdueMode === "all" || !store.doneIds.includes(lesson.id))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [currentSchedule.rows, overdueMode, store.doneIds]);

  const overdueReviews = useMemo(() => {
    const today = parseISODate(todayISO());
    return currentSchedule.rows
      .flatMap((row) => row.revisoesDoDia.map((review) => ({ ...review, data: row.data, dataBR: row.dataBR, semana: row.semana })))
      .filter((review) => parseISODate(review.data) < today)
      .filter((review) => overdueMode === "all" || !store.doneIds.includes(review.id))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [currentSchedule.rows, overdueMode, store.doneIds]);

  const pendingOverdue = useMemo(() => {
    const today = parseISODate(todayISO());
    return allLessons(currentSchedule.rows).filter((lesson) => parseISODate(lesson.data) < today && !store.doneIds.includes(lesson.id));
  }, [currentSchedule.rows, store.doneIds]);

  const pendingOverdueReviews = useMemo(() => {
    const today = parseISODate(todayISO());
    return currentSchedule.rows
      .flatMap((row) => row.revisoesDoDia.map((review) => ({ ...review, data: row.data })))
      .filter((review) => parseISODate(review.data) < today && !store.doneIds.includes(review.id));
  }, [currentSchedule.rows, store.doneIds]);

  function flashcardSummaryForDate(date: string) {
    const today = todayISO();
    const completedToday = flashcards.filter((card) => card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty).length;
    if (date === today) {
      const todayCards = flashcards.filter((card) => compactDate(card.dueDate) === today && !(card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty)).length;
      const overdue = flashcards.filter((card) => compactDate(card.dueDate) < today && !(card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty)).length;
      const total = todayCards + overdue + completedToday;
      return { todayCards, overdue, completed: completedToday, total, estimatedMinutes: Math.max(5, Math.ceil(total * 0.75)), pct: total ? Math.round((completedToday / total) * 100) : 0 };
    }
    const todayCards = flashcards.filter((card) => compactDate(card.dueDate) === date).length;
    return { todayCards, overdue: 0, completed: 0, total: todayCards, estimatedMinutes: Math.max(5, Math.ceil(todayCards * 0.75)), pct: 0 };
  }

  function reviewFlashcards() {
    store.requestFlashcardReview("cronograma");
  }

  async function syncTask(id: string, checked: boolean, payload: { titulo: string; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia?: string; descricao?: string; metadata?: unknown }) {
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

  function startLessonStudy(lesson: { id: string; disciplina: string; aula: string; semana: string; data: string }) {
    if (store.activeTimer && store.activeTimer.lessonId !== lesson.id) {
      toast.error("Finalize ou pause o estudo atual antes de iniciar outra aula.");
      return;
    }
    store.setActiveTimer({
      area: lesson.disciplina,
      title: lesson.aula,
      lessonId: lesson.id,
      week: lesson.semana,
      date: lesson.data,
      source: "lesson",
      startedAt: Date.now(),
      accumulatedSeconds: store.activeTimer?.lessonId === lesson.id ? store.activeTimer.accumulatedSeconds : 0,
      paused: false
    });
    toast.success("Cronômetro iniciado para esta aula.");
  }

  function pauseLessonStudy() {
    const active = store.activeTimer;
    if (!active || active.paused) return;
    const elapsed = active.accumulatedSeconds + Math.max(0, Math.round((Date.now() - active.startedAt) / 1000));
    store.setActiveTimer({ ...active, accumulatedSeconds: elapsed, paused: true });
  }

  async function finishLessonStudy(lesson: { id: string; disciplina: string; aula: string; data: string }) {
    const active = store.activeTimer;
    if (!active || active.lessonId !== lesson.id) {
      toast.error("Inicie o estudo desta aula antes de finalizar.");
      return;
    }
    const seconds = active.accumulatedSeconds + (!active.paused ? Math.max(0, Math.round((Date.now() - active.startedAt) / 1000)) : 0);
    try {
      await api("/api/productivity", {
        method: "POST",
        body: JSON.stringify({ horas: Math.max(1, seconds) / 3600, rendimento: 100, materia: lesson.disciplina, data: new Date(), observacoes: `aula:${lesson.aula}` })
      });
      store.setActiveTimer(null);
      toast.success("Tempo da aula salvo.");
      if (window.confirm("Deseja marcar esta aula como concluída?")) {
        await syncTask(lesson.id, true, { titulo: lesson.aula, data: lesson.data, tipo: "AULA", materia: lesson.disciplina });
      }
    } catch {
      toast.error("Não consegui salvar o tempo estudado.");
    }
  }

  async function addExtraStudy() {
    if (!extraForm.titulo.trim() || !extraForm.materia || !extraForm.data) {
      toast.error("Preencha aula, area e data.");
      return;
    }
    const feitas = Number(extraForm.feitas || 0);
    const acertos = Number(extraForm.acertos || 0);
    const erros = Number(extraForm.erros || 0);
    const study: ExtraStudy = {
      id: `extra-${crypto.randomUUID()}`,
      titulo: extraForm.titulo.trim(),
      materia: extraForm.materia,
      data: extraForm.data,
      horas: extraForm.horas ? clockToHours(extraForm.horas) : 0,
      observacoes: extraForm.observacoes.trim()
    };
    store.addExtraStudy(study);
    if (!store.doneIds.includes(study.id)) store.toggleDone(study.id);
    if (feitas || acertos || erros || extraForm.observacoes.trim()) {
      store.setLessonQuestion(study.id, { done: !!(feitas || acertos || erros), feitas, acertos, erros, observacoes: extraForm.observacoes.trim() });
    }
    setExtraForm({ titulo: "", materia: "", data: todayISO(), horas: "", observacoes: "", feitas: "", acertos: "", erros: "" });
    try {
      const saved = await api<TaskRecord>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ externalId: study.id, titulo: study.titulo, descricao: study.observacoes, data: study.data, tipo: "EXTRA", materia: study.materia, status: "DONE", metadata: { horas: study.horas } })
      });
      setTasks((current) => [saved, ...current.filter((task) => task.id !== saved.id)]);
      if (study.horas > 0) {
        await api("/api/productivity", {
          method: "POST",
          body: JSON.stringify({ materia: study.materia, data: study.data, horas: study.horas, rendimento: 100, observacoes: `extra-study:${study.id}:${study.titulo}` })
        });
      }
      if (feitas || acertos || erros || extraForm.observacoes.trim()) {
        await api(`/api/lesson-questions/${study.id}`, {
          method: "PATCH",
          body: JSON.stringify({ done: !!(feitas || acertos || erros), feitas, acertos, erros, observacoes: extraForm.observacoes.trim() })
        });
      }
      toast.success("Estudo externo salvo");
    } catch {
      toast.warning("Estudo salvo localmente; faca login para sincronizar.");
    }
  }

  async function refreshAfterReorganization() {
    const [refreshedTasks, refreshedFlashcards] = await Promise.all([
      api<TaskRecord[]>("/api/tasks"),
      api<FlashcardRecord[]>("/api/flashcards")
    ]);
    setTasks(refreshedTasks);
    setFlashcards(refreshedFlashcards);
    store.setDoneIds(refreshedTasks.filter((task) => task.status === "DONE" && task.externalId).map((task) => task.externalId as string));
  }

  async function reorganizeSchedule() {
    if (reorganizing) return;
    setReorganizing(true);
    try {
      const preview = await api<ReorganizationPreview>("/api/schedule-reorganize");
      setLatestSnapshotId(preview.latestSnapshotId);
      const total = preview.lessons.length + preview.reviews.length + preview.flashcards.length;
      if (!total) {
        toast.success("Nenhuma pendencia atrasada para reorganizar.");
        return;
      }
      const confirmed = window.confirm(
        `Voce possui:\n\n${preview.lessons.length} aulas atrasadas\n${preview.reviews.length} revisoes atrasadas\n${preview.flashcards.length} flashcards atrasados\n\nDeseja redistribuir essas tarefas?\n\nNenhuma tarefa concluida sera alterada.`
      );
      if (!confirmed) return;
      const result = await api<ReorganizationResult>("/api/schedule-reorganize", { method: "POST" });
      setLatestSnapshotId(result.snapshotId);
      await refreshAfterReorganization();
      toast.success(`Reorganizacao concluida: ${result.lessons} aulas, ${result.reviews} revisoes e ${result.flashcards} flashcards redistribuidos. Nenhum concluido foi alterado.`);
    } catch {
      toast.error("Nao consegui reorganizar as pendencias. Nenhum dado foi alterado.");
    } finally {
      setReorganizing(false);
    }
  }

  async function rollbackReorganization() {
    if (reorganizing) return;
    if (!window.confirm("Deseja restaurar o estado anterior a ultima reorganizacao? Itens concluidos depois dela continuarao preservados.")) return;
    setReorganizing(true);
    try {
      await api("/api/schedule-reorganize/rollback", { method: "POST", body: JSON.stringify({ snapshotId: latestSnapshotId || undefined }) });
      setLatestSnapshotId(null);
      await refreshAfterReorganization();
      toast.success("Ultima reorganizacao desfeita. O historico concluido foi preservado.");
    } catch {
      toast.error("Nao encontrei uma reorganizacao que possa ser desfeita.");
    } finally {
      setReorganizing(false);
    }
  }

  return (
    <div className="grid gap-6">
      {!todayMode && <section className="grid gap-3 md:grid-cols-4">
        <article className="card p-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Dias restantes</span>
          <strong className="mt-1 block text-2xl font-black tracking-tight">{daysRemaining}</strong>
          <small className="font-bold text-slate-500 dark:text-slate-400">dias ate o fim do cronograma</small>
        </article>
        <article className="card p-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Pendencias</span>
          <strong className="mt-1 block text-2xl font-black tracking-tight">{pendingOverdue.length + pendingOverdueReviews.length}</strong>
          <small className="font-bold text-slate-500 dark:text-slate-400">{pendingOverdue.length} aulas - {pendingOverdueReviews.length} revisoes</small>
        </article>
        <article className="card p-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Progresso total do cronograma</span>
          <strong className="mt-1 block text-2xl font-black tracking-tight">{progressPct}%</strong>
          <small className="font-bold text-slate-500 dark:text-slate-400">{progressDoneCount} de {progressTotal} concluidos</small>
        </article>
        <article className="card p-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Recuperacao de atrasos</span>
          <strong className="mt-1 block text-lg font-black tracking-tight">Redistribuicao segura</strong>
          <small className="mt-1 block font-bold text-slate-500 dark:text-slate-400">Somente pendencias; concluidos permanecem intactos.</small>
          <div className="mt-3 grid gap-2">
            <button className="btn-primary bg-red-700 hover:bg-red-800" disabled={reorganizing} onClick={reorganizeSchedule}>{reorganizing ? "Processando..." : "Reorganizar"}</button>
            <button className="btn-secondary" disabled={reorganizing} onClick={rollbackReorganization}>Desfazer ultima</button>
          </div>
        </article>
      </section>}

      {!todayMode && <section className="card grid gap-3 p-3 lg:grid-cols-[1.3fr_.7fr_.7fr_.7fr]">
        <label className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input className="input pl-10" placeholder="Buscar aula, tema ou disciplina" value={store.search} onChange={(event) => store.setFilter("search", event.target.value)} />
        </label>
          <select className="input" value={store.week} onChange={(event) => store.setFilter("week", event.target.value)}>
            <option value="">Todas as semanas</option>
              {currentSchedule.semanas.map((week) => <option key={week}>{week}</option>)}
          </select>
          <select className="input" value={store.discipline} onChange={(event) => store.setFilter("discipline", event.target.value)}>
            <option value="">Todas as disciplinas</option>
              {currentSchedule.disciplinas.map((discipline) => <option key={discipline}>{discipline}</option>)}
        </select>
        <select className="input" value={store.type} onChange={(event) => store.setFilter("type", event.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="aula">Aulas</option>
          <option value="revisao">Revisoes</option>
          <option value="simulado">Simulados</option>
          <option value="livre">Livres</option>
        </select>
      </section>}

      {todayMode && (
        <section className="card p-5">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Hoje</span>
          <h2 className="mt-1 text-2xl font-black">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</h2>
          <p className="mt-1 text-sm text-slate-500">Visualizacao filtrada do Cronograma com os mesmos cards, botoes e registros.</p>
        </section>
      )}

      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-violet-100 pb-4 dark:border-violet-400/20">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black tracking-tight"><span className="h-2.5 w-2.5 rounded-full bg-fuchsia-500" />{todayMode ? "Pendencias atrasadas" : "Aulas atrasadas"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Lista automatica com todas as aulas do cronograma que ficaram pendentes ate hoje.</p>
          </div>
          <div className="min-w-20 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-center text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200">
            <strong className="block text-2xl">{pendingOverdue.length + pendingOverdueReviews.length}</strong>
            <span className="text-xs font-bold">pendente(s)</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={`rounded-full px-4 py-2 text-sm font-bold ${overdueMode === "pending" ? "bg-fuchsia-600 text-white" : "border border-violet-100 text-violet-900 dark:border-white/10 dark:text-violet-100"}`} onClick={() => setOverdueMode("pending")}>Pendentes</button>
          <button className={`rounded-full px-4 py-2 text-sm font-bold ${overdueMode === "all" ? "bg-fuchsia-600 text-white" : "border border-violet-100 text-violet-900 dark:border-white/10 dark:text-violet-100"}`} onClick={() => setOverdueMode("all")}>Todas</button>
        </div>
        <div className="mt-4 grid gap-5">
          {todayMode && (
            <OverdueReviewsGroup reviews={overdueReviews} storeDoneIds={store.doneIds} syncTask={syncTask} lessonQuestions={store.lessonQuestions} syncQuestion={syncQuestion} />
          )}

          <div className="grid gap-3">
            <button className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left dark:border-white/10 dark:bg-slate-900" onClick={() => setShowOverdueLessons((value) => !value)} aria-expanded={showOverdueLessons}>
              <span>
                <span className="block text-sm font-black uppercase tracking-wider text-slate-400">Aulas atrasadas</span>
                <span className="mt-1 block text-sm text-slate-500">{overdueLessons.length} item(ns) {showOverdueLessons ? "visiveis" : "recolhidos"}</span>
              </span>
              <ChevronDown className={`text-slate-400 transition ${showOverdueLessons ? "rotate-180" : ""}`} size={20} />
            </button>
            {showOverdueLessons && (
              <div className="grid gap-3">
                {overdueLessons.map((lesson) => (
                  <article key={lesson.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-black text-fuchsia-600">{lesson.dataBR} - {lesson.disciplina}</div>
                        <div className="mt-2"><LateBadge date={lesson.data} /></div>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-300 md:text-right">{lesson.aula}<br />{lesson.semana} - {lesson.horario}</div>
                    </div>
                    <button className="mt-4 w-full rounded-xl bg-violet-950 px-4 py-2.5 text-sm font-black text-white" onClick={() => syncTask(lesson.id, true, { titulo: lesson.aula, data: lesson.data, tipo: "AULA", materia: lesson.disciplina })}>Marcar como assistida</button>
                  </article>
                ))}
                {!overdueLessons.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-white/10">Nenhuma aula atrasada encontrada.</div>}
              </div>
            )}
          </div>

          {!todayMode && (
            <OverdueReviewsGroup reviews={overdueReviews} storeDoneIds={store.doneIds} syncTask={syncTask} lessonQuestions={store.lessonQuestions} syncQuestion={syncQuestion} />
          )}
        </div>
      </section>

      {!todayMode && <section className="card p-4">
        <h2 className="text-lg font-black">Estudos fora do cronograma</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Adicione aulas e assuntos estudados externamente.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="Tema / aula estudada" value={extraForm.titulo} onChange={(event) => setExtraForm((current) => ({ ...current, titulo: event.target.value }))} />
          <select className="input" value={extraForm.materia} onChange={(event) => setExtraForm((current) => ({ ...current, materia: event.target.value }))}>
            <option value="">Area</option>
            {areas.map((area) => <option key={area}>{area}</option>)}
          </select>
          <input className="input" type="date" value={extraForm.data} onChange={(event) => setExtraForm((current) => ({ ...current, data: event.target.value }))} />
          <input className="input" type="time" value={extraForm.horas} onChange={(event) => setExtraForm((current) => ({ ...current, horas: event.target.value }))} title="Tempo estudado opcional" />
          <input className="input" type="number" min="0" placeholder="Questoes feitas" value={extraForm.feitas} onChange={(event) => setExtraForm((current) => ({ ...current, feitas: event.target.value }))} />
          <input className="input" type="number" min="0" placeholder="Acertos" value={extraForm.acertos} onChange={(event) => setExtraForm((current) => ({ ...current, acertos: event.target.value }))} />
          <input className="input" type="number" min="0" placeholder="Erros" value={extraForm.erros} onChange={(event) => setExtraForm((current) => ({ ...current, erros: event.target.value }))} />
          <textarea className="input min-h-12 md:col-span-2" placeholder="Observacoes opcionais" value={extraForm.observacoes} onChange={(event) => setExtraForm((current) => ({ ...current, observacoes: event.target.value }))} />
        </div>
        <button className="btn-primary mt-4 w-full bg-red-700 hover:bg-red-800" onClick={addExtraStudy}>Adicionar estudo</button>
        <div className="mt-5 grid gap-2">
          {store.extraStudies.map((study) => (
            <div key={study.id} className="grid gap-1 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800 md:grid-cols-[1fr_auto] md:items-center">
              <strong>{study.titulo}</strong>
              <span className="text-slate-500">{study.materia} - {study.data} - {study.horas > 0 ? formatHours(study.horas) : "sem tempo"}</span>
              {study.observacoes && <span className="text-xs text-slate-400 md:col-span-2">{study.observacoes}</span>}
            </div>
          ))}
          {!store.extraStudies.length && <p className="py-4 text-center text-sm text-slate-400">Nenhum estudo externo adicionado.</p>}
        </div>
      </section>}

      <section className={todayMode ? "grid gap-6" : "grid gap-6 xl:grid-cols-[280px_1fr]"}>
        {!todayMode && <aside className="card h-fit p-4 xl:sticky xl:top-28">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-400">Semanas</h2>
          <div className="grid max-h-[520px] gap-2 overflow-auto">
            <button className={`rounded-xl px-3 py-2 text-left text-sm font-bold ${!store.week ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800"}`} onClick={() => store.setFilter("week", "")}>Todas as semanas</button>
            {currentSchedule.semanas.map((week) => (
              <button key={week} className={`rounded-xl px-3 py-2 text-left text-sm font-bold ${store.week === week ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-slate-800"}`} onClick={() => store.setFilter("week", week)}>
                {week}<span className="block text-xs font-medium opacity-70">{weekRangeFromRows(currentSchedule.rows, week)}</span>
              </button>
            ))}
          </div>
        </aside>}

        <div className="grid gap-6">
          {!todayMode && <article className="card overflow-hidden">
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
          </article>}

          {grouped.map(([date, rows]) => {
            const first = rows[0];
            const isToday = date === todayISO();
            const lessonCount = rows.reduce((acc, row) => acc + row.aulas.length, 0);
            const generatedReviews = (generatedReviewsByDate.get(date) || [])
              .filter((task) => !store.discipline || task.materia === store.discipline)
              .filter(() => !store.type || store.type === "revisao");
            const q = normalizeText(store.search);
            const extraStudiesForDate = store.extraStudies
              .filter((study) => study.data === date)
              .filter((study) => !store.discipline || study.materia === store.discipline)
              .filter(() => !store.type || store.type === "livre" || store.type === "aula")
              .filter((study) => !q || normalizeText(`${study.titulo} ${study.materia} ${study.observacoes || ""}`).includes(q));
            const flashSummary = flashcardSummaryForDate(date);
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
                    {!!extraStudiesForDate.length && <span className="badge bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">{extraStudiesForDate.length} extra(s)</span>}
                    {!!flashSummary.total && <span className="badge bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">{flashSummary.total} card(s)</span>}
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
                  {extraStudiesForDate.map((study) => {
                    const done = store.doneIds.includes(study.id);
                    const q = store.lessonQuestions[study.id] || { done: false, feitas: 0, acertos: 0, erros: 0, observacoes: "" };
                    return (
                      <div key={study.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
                        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto]">
                          <button className="mt-1" aria-label={done ? "Desmarcar estudo extra" : "Marcar estudo extra"} onClick={() => syncTask(study.id, !done, { titulo: study.titulo, data: study.data, tipo: "EXTRA", materia: study.materia, descricao: study.observacoes, metadata: { horas: study.horas } })}>
                            {done ? <Check className="text-emerald-600" size={20} /> : <Circle className="text-slate-400" size={20} />}
                          </button>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong>{study.materia}</strong>
                              <span className="badge bg-white text-emerald-700 dark:bg-slate-900 dark:text-emerald-200">Fora do cronograma</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{study.titulo}</p>
                            {study.observacoes && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{study.observacoes}</p>}
                          </div>
                          <div className="text-sm md:text-right">
                            <span className="badge bg-white text-emerald-700 dark:bg-slate-900 dark:text-emerald-200">Extra</span>
                            <p className="mt-2 text-slate-500">{study.horas > 0 ? formatHours(study.horas) : "Sem tempo"}</p>
                          </div>
                        </div>
                        <div className="mt-3 rounded-2xl border border-violet-200 bg-white/70 p-4 dark:border-violet-400/20 dark:bg-slate-950/40">
                          <label className="flex items-center gap-2 text-sm font-black text-violet-950 dark:text-violet-100">
                            <input type="checkbox" checked={q.done} onChange={(event) => syncQuestion(study.id, { done: event.target.checked })} />
                            Questoes deste estudo concluidas
                          </label>
                          <div className="mt-4 grid gap-2 md:grid-cols-3">
                            <input className="input" type="number" min="0" placeholder="Questoes feitas" value={q.feitas || ""} onChange={(event) => syncQuestion(study.id, { feitas: Number(event.target.value || 0) })} />
                            <input className="input" type="number" min="0" placeholder="Acertos" value={q.acertos || ""} onChange={(event) => syncQuestion(study.id, { acertos: Number(event.target.value || 0) })} />
                            <input className="input" type="number" min="0" placeholder="Erros" value={q.erros || ""} onChange={(event) => syncQuestion(study.id, { erros: Number(event.target.value || 0) })} />
                          </div>
                          <textarea className="input mt-2 min-h-12" placeholder="Observacoes do estudo ou principais erros..." value={q.observacoes} onChange={(event) => syncQuestion(study.id, { observacoes: event.target.value })} />
                        </div>
                      </div>
                    );
                  })}
                  {rows.flatMap((row) => [
                    ...row.aulas.map((lesson) => {
                      const priority = inferPriority(lesson);
                      const done = store.doneIds.includes(lesson.id);
                      const studying = store.activeTimer?.lessonId === lesson.id;
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
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button className="btn-secondary" onClick={() => startLessonStudy(lesson)}><Play size={16} /> {studying && store.activeTimer?.paused ? "Continuar" : "Iniciar Estudo"}</button>
                            <button className="btn-secondary" disabled={!studying || !!store.activeTimer?.paused} onClick={pauseLessonStudy}><Pause size={16} /> Pausar</button>
                            <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={() => finishLessonStudy(lesson)}><Check size={16} /> Finalizar Aula</button>
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
                    ...row.revisoesDoDia.map((review) => {
                      const done = store.doneIds.includes(review.id);
                      const q = store.lessonQuestions[review.id] || { done: false, feitas: 0, acertos: 0, erros: 0, observacoes: "" };
                      return (
                        <div key={review.id} className="rounded-2xl border border-rose-100 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                          <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                            <button className="mt-1 grid h-6 w-6 place-items-center rounded-full border border-rose-300" aria-label={done ? "Desmarcar revisao" : "Marcar revisao"} onClick={() => syncTask(review.id, !done, { titulo: review.aula, data: row.data, tipo: "REVISAO", materia: review.disciplina })}>{done && <Check size={15} />}</button>
                            <span><strong className="block">{review.tipoRevisao} - {review.disciplina}</strong><span className="text-sm text-slate-600 dark:text-slate-300">{review.aula}</span></span>
                            <span className="badge bg-white text-brand-700 dark:bg-slate-900">Revisao</span>
                          </div>
                          <ReviewQuestionFields id={review.id} q={q} syncQuestion={syncQuestion} label="Questoes desta revisao concluidas" placeholder="Questoes feitas na revisao, principais erros e pontos para reforcar..." />
                        </div>
                      );
                    }),
                    isSaturday(row.data) ? (
                      <button key={saturdaySimuladoId(row.data)} className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-left dark:border-brand-700/30 dark:bg-brand-700/10" onClick={() => syncTask(saturdaySimuladoId(row.data), !store.doneIds.includes(saturdaySimuladoId(row.data)), { titulo: "Simulado semanal", data: row.data, tipo: "SIMULADO", materia: "Simulado" })}>
                        <strong>Simulado semanal</strong><p className="text-sm text-slate-600 dark:text-slate-300">Realizar prova e correcao do fim de semana.</p>
                      </button>
                    ) : null,
                    row.domingo ? <div key={`livre-${row.row}`} className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">Domingo livre - descanso, lazer e organizacao leve.</div> : null
                  ])}
                  {!!flashSummary.total && (!store.type || store.type === "revisao") && (
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-400/20 dark:bg-indigo-500/10">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h4 className="text-base font-black">{isToday ? "Flashcards do dia" : "Flashcards para revisar"}</h4>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            Hoje: {flashSummary.todayCards} cards · Atrasados: {flashSummary.overdue} cards · Total: {flashSummary.total} cards
                          </p>
                          <p className="mt-1 text-sm text-slate-500">Tempo estimado: {flashSummary.estimatedMinutes} min · Progresso: {flashSummary.completed}/{flashSummary.total} concluídos ({flashSummary.pct}%)</p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-950">
                            <div className="h-full rounded-full bg-indigo-600" style={{ width: `${flashSummary.pct}%` }} />
                          </div>
                        </div>
                        <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={reviewFlashcards}>Revisar Flashcards</button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ReviewQuestionFields({ id, q, syncQuestion, label, placeholder }: {
  id: string;
  q: LessonQuestionValue;
  syncQuestion: (lessonId: string, value: Partial<LessonQuestionValue>) => Promise<void>;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-violet-200 bg-white/70 p-4 dark:border-violet-400/20 dark:bg-slate-950/40">
      <label className="flex items-center gap-2 text-sm font-black text-violet-950 dark:text-violet-100">
        <input type="checkbox" checked={q.done} onChange={(event) => syncQuestion(id, { done: event.target.checked })} />
        {label}
      </label>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <input className="input" type="number" min="0" placeholder="Questoes feitas" value={q.feitas || ""} onChange={(event) => syncQuestion(id, { feitas: Number(event.target.value || 0) })} />
        <input className="input" type="number" min="0" placeholder="Acertos" value={q.acertos || ""} onChange={(event) => syncQuestion(id, { acertos: Number(event.target.value || 0) })} />
        <input className="input" type="number" min="0" placeholder="Erros" value={q.erros || ""} onChange={(event) => syncQuestion(id, { erros: Number(event.target.value || 0) })} />
      </div>
      <textarea className="input mt-2 min-h-12" placeholder={placeholder} value={q.observacoes} onChange={(event) => syncQuestion(id, { observacoes: event.target.value })} />
    </div>
  );
}

function OverdueReviewsGroup({ reviews, storeDoneIds, syncTask, lessonQuestions, syncQuestion }: {
  reviews: Array<{ id: string; tipoRevisao: string; disciplina: string; aula: string; data: string; dataBR: string; semana: string }>;
  storeDoneIds: string[];
  syncTask: (id: string, checked: boolean, payload: { titulo: string; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia?: string; descricao?: string; metadata?: unknown }) => Promise<void>;
  lessonQuestions: Record<string, LessonQuestionValue>;
  syncQuestion: (lessonId: string, value: Partial<LessonQuestionValue>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-3">
      <button className="flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left dark:border-rose-500/20 dark:bg-rose-500/10" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>
          <span className="block text-sm font-black uppercase tracking-wider text-rose-500 dark:text-rose-200">Revisoes espacadas atrasadas</span>
          <span className="mt-1 block text-sm text-slate-500 dark:text-slate-300">{reviews.length} item(ns) {open ? "visiveis" : "recolhidos"}</span>
        </span>
        <ChevronDown className={`text-rose-400 transition ${open ? "rotate-180" : ""}`} size={20} />
      </button>
      {open && (
        <div className="grid gap-3">
          {reviews.map((review) => {
          const done = storeDoneIds.includes(review.id);
          const q = lessonQuestions[review.id] || { done: false, feitas: 0, acertos: 0, erros: 0, observacoes: "" };
          return (
            <div key={review.id} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left dark:border-rose-500/20 dark:bg-rose-500/10">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <span>
                  <strong className="block">{review.tipoRevisao} - {review.disciplina}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{review.aula}</span>
                  <span className="mt-1 block text-xs text-slate-500">{review.dataBR} - {review.semana}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 md:justify-end">
                  <LateBadge date={review.data} />
                  <button className="btn-secondary h-10" onClick={() => syncTask(review.id, !done, { titulo: review.aula, data: review.data, tipo: "REVISAO", materia: review.disciplina })}>{done ? "Revisao realizada" : "Marcar revisao"}</button>
                </span>
              </div>
              <ReviewQuestionFields id={review.id} q={q} syncQuestion={syncQuestion} label="Questoes desta revisao concluidas" placeholder="Questoes feitas na revisao atrasada, principais erros e pontos para reforcar..." />
            </div>
          );
        })}
          {!reviews.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-white/10">Nenhuma revisao atrasada encontrada.</div>}
        </div>
      )}
    </div>
  );
}
