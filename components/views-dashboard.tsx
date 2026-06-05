"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BookOpenCheck, CalendarCheck2, Clock3, Flame, Layers3, NotebookTabs, Target } from "lucide-react";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, allProgressIds, areas, parseISODate, schedule, todayISO } from "@/utils/schedule";

type LessonQuestionRecord = { lessonId: string; done: boolean; feitas: number; acertos: number; erros: number; observacoes: string | null };
type ErrorNote = { id: string; tema: string; materia: string | null; erro: string; revisao: string | null; flashcard: string | null; dificuldade: string | null; data: string; createdAt: string };
type Flashcard = { id: string; pergunta: string; tag: string | null; materia: string | null; deck: string | null; dueDate: string; updatedAt?: string; acertos: number; erros: number; lastDifficulty?: string | null };
type Productivity = { id: string; data: string; materia: string | null; horas: number; observacoes: string | null };
type Performance = { id: string; materia: string; questoes?: number; acertos: number; erros: number; percentual: number; examName: string | null; instituicao?: string | null; observacoes?: string | null; data: string; createdAt: string };
type TaskRecord = { id: string; externalId: string | null; titulo: string; descricao: string | null; status: "PENDING" | "DONE" | "ARCHIVED"; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia: string | null; metadata?: unknown };

const today = todayISO();
const compactDate = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");
const monthKey = (value: string | Date) => compactDate(value).slice(0, 7);

function formatHours(value: number) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function inferSystem(text: string) {
  const normalized = text.toLowerCase();
  const entries: [string, string[]][] = [
    ["Cardiologia", ["cardio", "has", "hipertens", "infarto", "arrit", "insuficiência cardíaca"]],
    ["Pneumologia", ["pneumo", "asma", "dpoc", "pneumonia", "tubercul", "dispneia"]],
    ["Endocrinologia", ["endo", "diabetes", "tireo", "adrenal", "obesidade"]],
    ["Nefrologia", ["nefro", "renal", "rim", "ira", "drc", "glomer"]],
    ["Gastroenterologia", ["gastro", "hepat", "cirrose", "diarreia", "úlcera", "refluxo"]],
    ["Infectologia", ["infect", "hiv", "sepse", "antibiótico", "dengue"]],
    ["Neurologia", ["neuro", "avc", "cefaleia", "convuls", "epilep"]],
    ["Ginecologia", ["gineco", "gesta", "pré-natal", "obst", "parto"]],
    ["Pediatria", ["pedi", "criança", "neonato", "vacina"]]
  ];
  return entries.find(([, words]) => words.some((word) => normalized.includes(word)))?.[0] || "Sem sistema definido";
}

function performanceTotal(item: Pick<Performance, "questoes" | "acertos" | "erros">) {
  return Number(item.questoes || 0) || Number(item.acertos || 0) + Number(item.erros || 0);
}

export function DashboardView() {
  const doneIds = useMedboardStore((state) => state.doneIds);
  const storeQuestions = useMedboardStore((state) => state.lessonQuestions);
  const ids = useMemo(() => allProgressIds(), []);
  const lessons = useMemo(() => allLessons(), []);
  const [lessonQuestionRecords, setLessonQuestionRecords] = useState<LessonQuestionRecord[]>([]);
  const [errors, setErrors] = useState<ErrorNote[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [productivity, setProductivity] = useState<Productivity[]>([]);
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  useEffect(() => {
    Promise.all([
      api<LessonQuestionRecord[]>("/api/lesson-questions"),
      api<ErrorNote[]>("/api/errors"),
      api<Flashcard[]>("/api/flashcards"),
      api<Productivity[]>("/api/productivity"),
      api<Performance[]>("/api/performance"),
      api<TaskRecord[]>("/api/tasks")
    ])
      .then(([questionItems, errorItems, cardItems, productivityItems, performanceItems, taskItems]) => {
        setLessonQuestionRecords(questionItems);
        setErrors(errorItems);
        setFlashcards(cardItems);
        setProductivity(productivityItems);
        setPerformances(performanceItems);
        setTasks(taskItems);
      })
      .catch(() => {
        setLessonQuestionRecords([]);
        setErrors([]);
        setFlashcards([]);
        setProductivity([]);
        setPerformances([]);
        setTasks([]);
      });
  }, []);

  const todayDate = parseISODate(today);
  const weekStart = startOfWeek(todayDate);
  const currentMonth = monthKey(today);
  const daysRemaining = Math.max(0, Math.ceil((parseISODate(schedule.stats.fim).getTime() - todayDate.getTime()) / 86_400_000));
  const overdueLessons = lessons.filter((lesson) => parseISODate(lesson.data) < todayDate && !doneIds.includes(lesson.id));
  const overdueReviews = schedule.rows.flatMap((row) => row.revisoesDoDia.map((review) => ({ ...review, data: row.data, dataBR: row.dataBR }))).filter((review) => parseISODate(review.data) < todayDate && !doneIds.includes(review.id));
  const scheduledExams = schedule.rows.filter((row) => row.tipo === "simulado" || row.revisoesDoDia.length === 0).filter((row) => parseISODate(row.data) >= todayDate && row.assunto.toLowerCase().includes("simulado")).slice(0, 4);

  const questionByLesson = useMemo(() => {
    const remote = Object.fromEntries(lessonQuestionRecords.map((item) => [item.lessonId, {
      done: item.done,
      feitas: item.feitas,
      acertos: item.acertos,
      erros: item.erros,
      observacoes: item.observacoes || ""
    }]));
    return { ...remote, ...storeQuestions };
  }, [lessonQuestionRecords, storeQuestions]);

  const extraStudyTasks = useMemo(() => tasks.filter((task) => task.tipo === "EXTRA"), [tasks]);

  const performanceByArea = useMemo(() => areas.map((area) => {
    const questionStats = lessons.filter((lesson) => lesson.disciplina === area).reduce((acc, lesson) => {
      const item = questionByLesson[lesson.id];
      if (!item) return acc;
      acc.acertos += Number(item.acertos || 0);
      acc.erros += Number(item.erros || 0);
      acc.feitas += Math.max(Number(item.feitas || 0), Number(item.acertos || 0) + Number(item.erros || 0));
      return acc;
    }, { acertos: 0, erros: 0, feitas: 0 });
    const extraQuestionStats = extraStudyTasks.filter((task) => task.materia === area).reduce((acc, task) => {
      const item = questionByLesson[task.externalId || task.id];
      if (!item) return acc;
      acc.acertos += Number(item.acertos || 0);
      acc.erros += Number(item.erros || 0);
      acc.feitas += Math.max(Number(item.feitas || 0), Number(item.acertos || 0) + Number(item.erros || 0));
      return acc;
    }, { acertos: 0, erros: 0, feitas: 0 });
    const simStats = performances.filter((item) => item.materia === area).reduce((acc, item) => {
      acc.acertos += item.acertos;
      acc.erros += item.erros;
      acc.questoes += performanceTotal(item);
      return acc;
    }, { acertos: 0, erros: 0, questoes: 0 });
    const cardStats = flashcards.filter((card) => card.materia === area || card.deck === area).reduce((acc, card) => {
      acc.acertos += Number(card.acertos || 0);
      acc.erros += Number(card.erros || 0);
      return acc;
    }, { acertos: 0, erros: 0 });
    const acertos = questionStats.acertos + extraQuestionStats.acertos + simStats.acertos + cardStats.acertos;
    const erros = questionStats.erros + extraQuestionStats.erros + simStats.erros + cardStats.erros;
    const total = Math.max(questionStats.feitas + extraQuestionStats.feitas + simStats.questoes + cardStats.acertos + cardStats.erros, acertos + erros);
    return { area, acertos, erros, total, feitas: questionStats.feitas + extraQuestionStats.feitas, percentual: total ? Math.round((acertos / total) * 100) : 0 };
  }), [extraStudyTasks, flashcards, lessons, performances, questionByLesson]);

  const questionTotals = performanceByArea.reduce((acc, item) => ({
    acertos: acc.acertos + item.acertos,
    erros: acc.erros + item.erros,
    feitas: acc.feitas + item.feitas,
    total: acc.total + item.total
  }), { acertos: 0, erros: 0, feitas: 0, total: 0 });
  const generalAccuracy = questionTotals.total ? Math.round((questionTotals.acertos / questionTotals.total) * 100) : 0;
  const rankedAreas = performanceByArea.filter((item) => item.total > 0).sort((a, b) => b.percentual - a.percentual);
  const bestArea = rankedAreas[0];
  const worstArea = [...rankedAreas].sort((a, b) => a.percentual - b.percentual)[0];

  const hoursToday = productivity.filter((item) => compactDate(item.data) === today).reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const hoursWeek = productivity.filter((item) => new Date(item.data) >= weekStart).reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const hoursMonth = productivity.filter((item) => monthKey(item.data) === currentMonth).reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const hoursTotal = productivity.reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const hoursByArea = areas.map((area) => ({ area, hours: productivity.filter((item) => item.materia === area).reduce((acc, item) => acc + Number(item.horas || 0), 0) })).sort((a, b) => b.hours - a.hours);
  const hoursBySystem = Object.entries(productivity.reduce<Record<string, number>>((acc, item) => {
    const system = inferSystem(`${item.observacoes || ""} ${item.materia || ""}`);
    acc[system] = (acc[system] || 0) + Number(item.horas || 0);
    return acc;
  }, {})).map(([system, hours]) => ({ system, hours })).sort((a, b) => b.hours - a.hours).slice(0, 8);

  const flashDue = flashcards.filter((card) => compactDate(card.dueDate) <= today);
  const flashReviewedToday = flashcards.filter((card) => card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty);
  const flashTodayPending = flashcards.filter((card) => compactDate(card.dueDate) === today && !(card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty));
  const flashOverdue = flashcards.filter((card) => compactDate(card.dueDate) < today && !(card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty));
  const flashScheduledToday = flashTodayPending.length + flashReviewedToday.length;
  const flashCompletionTotal = flashScheduledToday + flashOverdue.length;
  const flashCompletionRate = flashCompletionTotal ? Math.round((flashReviewedToday.length / flashCompletionTotal) * 100) : 0;

  const recurringErrors = Object.entries(errors.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.tema}${item.materia ? ` · ${item.materia}` : ""}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).filter(([, count]) => count > 1);
  const wrongRanking = Object.entries(errors.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.tema}${item.materia ? ` · ${item.materia}` : ""}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const errorsWithoutFlashcard = errors.filter((item) => !item.flashcard && !item.revisao).length;
  const resolvedErrors = errors.filter((item) => item.dificuldade === "Fácil" || item.dificuldade === "Dificuldade baixa").length;

  const examsThisMonth = performances.filter((item) => monthKey(item.data) === currentMonth);
  const examNames = new Set(performances.map((item) => item.examName || item.id));
  const examAverage = performances.length ? Math.round(performances.reduce((acc, item) => acc + item.percentual, 0) / performances.length) : 0;
  const lessonDateById = new Map<string, string>();
  lessons.forEach((lesson) => lessonDateById.set(lesson.id, lesson.data));
  extraStudyTasks.forEach((task) => lessonDateById.set(task.externalId || task.id, compactDate(task.data)));
  const questionEvents = Object.entries(questionByLesson).map(([lessonId, item]) => ({
    date: lessonDateById.get(lessonId) || today,
    total: Math.max(Number(item.feitas || 0), Number(item.acertos || 0) + Number(item.erros || 0))
  }));
  const questionsThisWeek = questionEvents.filter((item) => parseISODate(item.date) >= weekStart).reduce((acc, item) => acc + item.total, 0);
  const questionsThisMonth = questionEvents.filter((item) => monthKey(item.date) === currentMonth).reduce((acc, item) => acc + item.total, 0);

  const activityByMonth = Array.from(new Set([...productivity.map((item) => monthKey(item.data)), ...performances.map((item) => monthKey(item.data))])).sort().slice(-6).map((month) => ({
    month,
    horas: Math.round(productivity.filter((item) => monthKey(item.data) === month).reduce((acc, item) => acc + Number(item.horas || 0), 0) * 10) / 10,
    simulados: new Set(performances.filter((item) => monthKey(item.data) === month).map((item) => item.examName || item.id)).size,
    questoes: questionEvents.filter((item) => monthKey(item.date) === month).reduce((acc, item) => acc + item.total, 0),
    flashcards: flashcards.filter((item) => item.updatedAt && monthKey(item.updatedAt) === month).length
  }));

  const heatmapDays = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(todayDate);
    date.setDate(date.getDate() - (83 - index));
    const key = compactDate(date);
    const hours = productivity.filter((item) => compactDate(item.data) === key).reduce((acc, item) => acc + Number(item.horas || 0), 0);
    return { key, hours, level: hours >= 6 ? 4 : hours >= 4 ? 3 : hours >= 2 ? 2 : hours > 0 ? 1 : 0 };
  });

  const mostStudied = hoursByArea.find((item) => item.hours > 0);
  const leastStudied = [...hoursByArea].reverse().find((item) => item.hours > 0);
  const topSystem = hoursBySystem[0];
  const neglectedSystem = [...hoursBySystem].reverse().find((item) => item.hours > 0);

  const recommendations = [
    { level: "red", text: `${flashOverdue.length} flashcards atrasados.`, active: flashOverdue.length > 0 },
    { level: "red", text: `${overdueLessons.length} aulas atrasadas.`, active: overdueLessons.length > 0 },
    { level: "red", text: `${overdueReviews.length} revisões atrasadas.`, active: overdueReviews.length > 0 },
    { level: "yellow", text: `Seu pior desempenho atual é ${worstArea?.area} (${worstArea?.percentual}%).`, active: !!worstArea },
    { level: "yellow", text: `Prioridade de revisão: ${worstArea?.area}.`, active: !!worstArea && worstArea.percentual < 65 },
    { level: "yellow", text: `${recurringErrors.length} assuntos recorrentes no caderno de erros.`, active: recurringErrors.length > 0 },
    { level: "green", text: `Você estudou ${formatHours(hoursToday)} hoje.`, active: hoursToday > 0 }
  ];
  const nextAction = recommendations.find((item) => item.active) || { level: "green", text: "Sem bloqueios críticos. Mantenha o cronograma de hoje.", active: true };

  const compactCards = [
    { label: "Progresso", value: `${ids.length ? Math.round((doneIds.length / ids.length) * 100) : 0}%`, detail: `${doneIds.length}/${ids.length}`, icon: Target },
    { label: "Atrasadas", value: overdueLessons.length, detail: "aulas", icon: AlertTriangle },
    { label: "Revisões", value: schedule.stats.totalRevisoes, detail: "planejadas", icon: CalendarCheck2 },
    { label: "Dias restantes", value: daysRemaining, detail: "até o final", icon: Clock3 },
    { label: "Horas", value: formatHours(hoursTotal), detail: "totais", icon: Flame },
    { label: "Questões", value: questionTotals.feitas || questionTotals.total, detail: `${generalAccuracy}% acerto`, icon: BookOpenCheck },
    { label: "Flashcards", value: flashcards.length, detail: `${flashDue.length} pendentes`, icon: Layers3 }
  ];

  const alerts = [
    { tone: "red", text: `${flashOverdue.length} flashcards atrasados.`, active: flashOverdue.length > 0 },
    { tone: "red", text: `${overdueLessons.length} aulas atrasadas.`, active: overdueLessons.length > 0 },
    { tone: "yellow", text: `${scheduledExams.length} simulados programados próximos.`, active: scheduledExams.length > 0 },
    { tone: "yellow", text: `Prioridade de revisão: ${worstArea?.area} abaixo de 65%.`, active: !!worstArea && worstArea.percentual < 65 },
    { tone: "yellow", text: `${recurringErrors.length} erros recorrentes sem consolidação.`, active: recurringErrors.length > 0 },
    { tone: "green", text: `Meta semanal quase concluída: ${formatHours(hoursWeek)} registrados.`, active: hoursWeek >= 20 }
  ].filter((item) => item.active);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {compactCards.map((card) => (
          <article className="card p-4" key={card.label}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">{card.label}</span>
              <card.icon className="text-brand-600" size={17} />
            </div>
            <strong className="block text-2xl font-black tracking-tight">{card.value}</strong>
            <small className="text-slate-500">{card.detail}</small>
          </article>
        ))}
      </section>

      <section className={`card border-l-4 p-5 ${nextAction.level === "red" ? "border-l-red-600" : nextAction.level === "yellow" ? "border-l-amber-500" : "border-l-emerald-500"}`}>
        <span className="text-xs font-black uppercase tracking-wider text-slate-400">Próxima ação recomendada</span>
        <h2 className="mt-2 text-2xl font-black">{nextAction.text}</h2>
        <p className="mt-1 text-sm text-slate-500">Prioridade calculada automaticamente a partir de cronograma, flashcards, simulados, caderno e horas registradas.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_.9fr]">
        <article className="card p-5">
          <h2 className="text-lg font-black">Lista inteligente de prioridade</h2>
          <div className="mt-4 grid gap-2">
            <Priority tone="red" label="Aulas atrasadas" value={overdueLessons.length} detail={overdueLessons[0]?.aula || "Nada atrasado"} />
            <Priority tone="red" label="Revisões atrasadas" value={overdueReviews.length} detail={overdueReviews[0]?.aula || "Nada atrasado"} />
            <Priority tone="red" label="Flashcards atrasados" value={flashOverdue.length} detail={`${flashDue.length} pendentes no total`} />
            <Priority tone="yellow" label="Simulados programados" value={scheduledExams.length} detail={scheduledExams[0]?.dataBR || "Sem simulado próximo"} />
            <Priority tone="yellow" label="Questões pendentes" value={lessons.length - Object.keys(questionByLesson).length} detail="aulas sem questões preenchidas" />
            <Priority tone="green" label="Metas próximas" value={hoursWeek >= 20 ? 1 : 0} detail={`${formatHours(hoursWeek)} estudadas esta semana`} />
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Alertas</h2>
          <div className="mt-4 grid gap-2">
            {alerts.map((item) => <AlertRow key={item.text} tone={item.tone} text={item.text} />)}
            {!alerts.length && <Empty text="Nenhum alerta crítico agora." />}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_.7fr]">
        <article className="card p-5">
          <h2 className="text-lg font-black">Desempenho por área</h2>
          <div className="mt-4 grid gap-3">
            {performanceByArea.map((item) => <PerformanceBar key={item.area} item={item} />)}
          </div>
        </article>
        <div className="grid gap-6">
          <SummaryCard title="Melhor desempenho" value={bestArea ? `${bestArea.area} · ${bestArea.percentual}%` : "Sem dados"} />
          <SummaryCard title="Pior desempenho" value={worstArea ? `${worstArea.area} · ${worstArea.percentual}%` : "Sem dados"} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="card p-5">
          <h2 className="text-lg font-black">Tempo de estudo</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Hoje" value={formatHours(hoursToday)} />
            <Metric title="Esta semana" value={formatHours(hoursWeek)} />
            <Metric title="Este mês" value={formatHours(hoursMonth)} />
            <Metric title="Total" value={formatHours(hoursTotal)} />
          </div>
          <h3 className="mt-5 text-sm font-black">Ranking de dedicação</h3>
          <div className="mt-3 grid gap-2">
            <Row left="Matéria mais estudada" right={mostStudied ? `${mostStudied.area} · ${formatHours(mostStudied.hours)}` : "Sem dados"} />
            <Row left="Matéria menos estudada" right={leastStudied ? `${leastStudied.area} · ${formatHours(leastStudied.hours)}` : "Sem dados"} />
            <Row left="Sistema mais estudado" right={topSystem ? `${topSystem.system} · ${formatHours(topSystem.hours)}` : "Sem dados"} />
            <Row left="Sistema negligenciado" right={neglectedSystem ? `${neglectedSystem.system} · ${formatHours(neglectedSystem.hours)}` : "Sem dados"} />
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Horas por grande área</h2>
          <div className="mt-4 grid gap-2">
            {hoursByArea.map((item) => <HorizontalValue key={item.area} label={item.area} value={formatHours(item.hours)} pct={hoursTotal ? Math.round((item.hours / hoursTotal) * 100) : 0} />)}
          </div>
          <h3 className="mt-5 text-sm font-black">Horas por sistema</h3>
          <div className="mt-3 grid gap-2">
            {hoursBySystem.map((item) => <HorizontalValue key={item.system} label={item.system} value={formatHours(item.hours)} pct={hoursTotal ? Math.round((item.hours / hoursTotal) * 100) : 0} />)}
            {!hoursBySystem.length && <Empty text="Os sistemas serão inferidos pelas observações e registros." />}
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Heatmap de estudo</h2>
        <div className="mt-4 grid grid-flow-col grid-rows-7 justify-start gap-1 overflow-x-auto">
          {heatmapDays.map((day) => <div key={day.key} title={`${day.key} · ${formatHours(day.hours)}`} className={`h-4 w-4 rounded-[4px] ${["bg-slate-100 dark:bg-slate-800", "bg-emerald-200", "bg-emerald-400", "bg-emerald-600", "bg-emerald-800"][day.level]}`} />)}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="card p-5">
          <h2 className="text-lg font-black">Flashcards</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Previstos hoje" value={flashScheduledToday} />
            <Metric title="Concluídos hoje" value={flashReviewedToday.length} />
            <Metric title="Atrasados" value={flashOverdue.length} />
            <Metric title="Taxa de conclusão" value={`${flashCompletionRate}%`} />
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Caderno de erros</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Total de erros" value={errors.length} />
            <Metric title="Abertos" value={Math.max(0, errors.length - resolvedErrors)} />
            <Metric title="Resolvidos" value={resolvedErrors} />
            <Metric title="Recorrentes" value={recurringErrors.length} />
            <Metric title="Sem flashcard" value={errorsWithoutFlashcard} />
          </div>
          <h3 className="mt-5 text-sm font-black">Top 10 assuntos mais errados</h3>
          <div className="mt-3 grid gap-2">
            {wrongRanking.map(([topic, count]) => <Row key={topic} left={topic} right={`${count} erro(s)`} />)}
            {!wrongRanking.length && <Empty text="O ranking será criado automaticamente a partir do caderno de erros." />}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="card p-5">
          <h2 className="text-lg font-black">Questões e simulados</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Questões esta semana" value={questionsThisWeek} />
            <Metric title="Questões este mês" value={questionsThisMonth} />
            <Metric title="Acerto geral" value={`${generalAccuracy}%`} />
            <Metric title="Simulados realizados" value={examNames.size} />
            <Metric title="Média dos simulados" value={`${examAverage}%`} />
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Evolução temporal</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityByMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="horas" stroke="#b91c1c" strokeWidth={3} name="Horas" />
                <Line type="monotone" dataKey="simulados" stroke="#7c3aed" strokeWidth={2} name="Simulados" />
                <Line type="monotone" dataKey="flashcards" stroke="#0f766e" strokeWidth={2} name="Flashcards" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Volume mensal</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityByMonth}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="questoes" fill="#d946ef" radius={[8, 8, 0, 0]} name="Questões" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value, detail }: { title: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-slate-50 p-3 dark:border-violet-400/20 dark:bg-slate-900">
      <span className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</span>
      <strong className="block text-2xl font-black">{value}</strong>
      {detail && <small className="text-slate-500">{detail}</small>}
    </div>
  );
}

function PerformanceBar({ item }: { item: { area: string; percentual: number; acertos: number; erros: number; total: number } }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-3 text-sm">
        <strong>{item.area}</strong>
        <span className="font-black">{item.percentual}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className="h-full rounded-full bg-red-700" style={{ width: `${item.percentual}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{item.acertos} acertos · {item.erros} erros · {item.total} respostas</p>
    </div>
  );
}

function Priority({ tone, label, value, detail }: { tone: "red" | "yellow" | "green"; label: string; value: number; detail: string }) {
  const color = tone === "red" ? "bg-red-600" : tone === "yellow" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
      <span className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} /><span className="truncate"><strong>{label}</strong><span className="block truncate text-slate-500">{detail}</span></span></span>
      <strong>{value}</strong>
    </div>
  );
}

function AlertRow({ tone, text }: { tone: string; text: string }) {
  const color = tone === "red" ? "text-red-700 dark:text-red-300" : tone === "yellow" ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300";
  return <div className={`rounded-xl bg-slate-50 p-3 text-sm font-bold dark:bg-slate-800 ${color}`}>{text}</div>;
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return <article className="card p-5"><span className="text-xs font-black uppercase tracking-wider text-slate-400">{title}</span><strong className="mt-2 block text-2xl font-black">{value}</strong></article>;
}

function HorizontalValue({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
      <div className="flex items-center justify-between gap-3"><strong>{label}</strong><span>{value}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className="h-full rounded-full bg-violet-700" style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><span>{left}</span><strong>{right}</strong></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">{text}</div>;
}
