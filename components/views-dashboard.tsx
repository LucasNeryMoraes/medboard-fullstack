"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpenCheck, Brain, ShieldAlert, Target, TimerReset } from "lucide-react";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, allProgressIds, areas, buildCronogramSchedule, dateOnlyISO, parseISODate, schedule, todayISO } from "@/utils/schedule";

type LessonQuestionRecord = { lessonId: string; done: boolean; feitas: number; acertos: number; erros: number; observacoes: string | null };
type ErrorNote = { id: string; tema: string; materia: string | null; erro: string; revisao: string | null; flashcard: string | null; dificuldade: string | null; data: string; createdAt: string };
type Flashcard = { id: string; pergunta: string; tag: string | null; materia: string | null; deck: string | null; dueDate: string; updatedAt?: string; acertos: number; erros: number; lastDifficulty?: string | null };
type Productivity = { id: string; data: string; materia: string | null; horas: number; observacoes: string | null };
type Performance = { id: string; materia: string; questoes?: number; acertos: number; erros: number; percentual: number; examName: string | null; instituicao?: string | null; observacoes?: string | null; data: string; createdAt: string };
type TaskRecord = { id: string; externalId: string | null; titulo: string; descricao: string | null; status: "PENDING" | "DONE" | "ARCHIVED"; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia: string | null; metadata?: unknown };
type ScheduleSettingsRecord = { cronogramStartDate: string; resetMode: "SMART" | "FULL" };
type AreaPerformance = { area: string; acertos: number; erros: number; total: number; feitas: number; percentual: number; horas: number; tendencia: number; status: "Critico" | "Atencao" | "Bom"; flashPendentes: number; flashAtrasados: number; errosRecentes: number };
type ScoreInput = {
  generalAccuracy: number;
  examAverage: number;
  progressPercent: number;
  flashCompletionRate: number;
  flashRetentionRate: number;
  reviewOnTimeRate: number;
  hoursWeek: number;
  weeklyGoal: number;
  criticalAreas: number;
};

const today = todayISO();
const WEEKLY_HOURS_GOAL = 30;
const ANNUAL_QUESTIONS_GOAL = 12_000;

const compactDate = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");
const monthKey = (value: string | Date) => compactDate(value).slice(0, 7);
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

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
    ["Cardiologia", ["cardio", "has", "hipertens", "infarto", "arrit", "insuficiencia cardiaca"]],
    ["Pneumologia", ["pneumo", "asma", "dpoc", "pneumonia", "tubercul", "dispneia"]],
    ["Endocrinologia", ["endo", "diabetes", "tireo", "adrenal", "obesidade"]],
    ["Nefrologia", ["nefro", "renal", "rim", "ira", "drc", "glomer"]],
    ["Gastroenterologia", ["gastro", "hepat", "cirrose", "diarreia", "ulcera", "refluxo"]],
    ["Infectologia", ["infect", "hiv", "sepse", "antibiotico", "dengue"]],
    ["Neurologia", ["neuro", "avc", "cefaleia", "convuls", "epilep"]],
    ["Ginecologia", ["gineco", "gesta", "pre-natal", "obst", "parto"]],
    ["Pediatria", ["pedi", "crianca", "neonato", "vacina"]]
  ];
  if (normalized.includes("flashcard")) return "Flashcards";
  return entries.find(([, words]) => words.some((word) => normalized.includes(word)))?.[0] || "Sistema nao informado";
}

function performanceTotal(item: Pick<Performance, "questoes" | "acertos" | "erros">) {
  return Number(item.questoes || 0) || Number(item.acertos || 0) + Number(item.erros || 0);
}

function extraTaskHours(task: TaskRecord) {
  if (!task.metadata || typeof task.metadata !== "object") return 0;
  const raw = (task.metadata as Record<string, unknown>).horas;
  const value = typeof raw === "number" ? raw : Number(raw || 0);
  return Number.isFinite(value) ? value : 0;
}

function classifyScore(score: number) {
  if (score < 45) return "Critico";
  if (score < 65) return "Atencao";
  if (score < 82) return "Bom";
  return "Excelente";
}

function calculateResidencyScore(input: ScoreInput) {
  const questionScore = clamp(input.generalAccuracy);
  const simulationScore = clamp(input.examAverage || input.generalAccuracy);
  const scheduleScore = clamp((input.progressPercent * 0.65) + (input.reviewOnTimeRate * 0.35));
  const flashcardScore = clamp((input.flashCompletionRate * 0.55) + (input.flashRetentionRate * 0.45));
  const hoursScore = clamp((input.hoursWeek / input.weeklyGoal) * 100);
  const criticalPenalty = clamp(input.criticalAreas * 12, 0, 100);
  const weighted =
    questionScore * 0.25 +
    simulationScore * 0.2 +
    scheduleScore * 0.15 +
    flashcardScore * 0.2 +
    hoursScore * 0.15 -
    criticalPenalty * 0.05;

  return {
    value: Math.round(clamp(weighted)),
    classification: classifyScore(weighted),
    components: [
      { label: "Questoes", value: Math.round(questionScore), weight: "25%" },
      { label: "Simulados", value: Math.round(simulationScore), weight: "20%" },
      { label: "Cronograma", value: Math.round(scheduleScore), weight: "15%" },
      { label: "Revisoes em dia", value: Math.round(input.reviewOnTimeRate), weight: "incluido" },
      { label: "Flashcards", value: Math.round(flashcardScore), weight: "20%" },
      { label: "Horas", value: Math.round(hoursScore), weight: "15%" },
      { label: "Areas criticas", value: Math.round(criticalPenalty), weight: "-5%" }
    ]
  };
}

export function DashboardView() {
  const storeQuestions = useMedboardStore((state) => state.lessonQuestions);
  const [lessonQuestionRecords, setLessonQuestionRecords] = useState<LessonQuestionRecord[]>([]);
  const [errors, setErrors] = useState<ErrorNote[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [productivity, setProductivity] = useState<Productivity[]>([]);
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [settings, setSettings] = useState<ScheduleSettingsRecord | null>(null);

  useEffect(() => {
    Promise.all([
      api<LessonQuestionRecord[]>("/api/lesson-questions"),
      api<ErrorNote[]>("/api/errors"),
      api<Flashcard[]>("/api/flashcards"),
      api<Productivity[]>("/api/productivity"),
      api<Performance[]>("/api/performance"),
      api<TaskRecord[]>("/api/tasks"),
      api<ScheduleSettingsRecord>("/api/schedule-settings")
    ])
      .then(([questionItems, errorItems, cardItems, productivityItems, performanceItems, taskItems, settingsItem]) => {
        setLessonQuestionRecords(questionItems);
        setErrors(errorItems);
        setFlashcards(cardItems);
        setProductivity(productivityItems);
        setPerformances(performanceItems);
        setTasks(taskItems);
        setSettings(settingsItem);
      })
      .catch(() => {
        setLessonQuestionRecords([]);
        setErrors([]);
        setFlashcards([]);
        setProductivity([]);
        setPerformances([]);
        setTasks([]);
        setSettings(null);
      });
  }, []);

  const completedIds = useMemo(() => tasks.filter((task) => task.status === "DONE" && task.externalId).map((task) => task.externalId as string), [tasks]);
  const completedDates = useMemo(() => Object.fromEntries(tasks.filter((task) => task.status === "DONE" && task.externalId).map((task) => [task.externalId as string, compactDate(task.data)])), [tasks]);
  const currentSchedule = useMemo(() => buildCronogramSchedule({
    startDate: settings?.cronogramStartDate ? dateOnlyISO(settings.cronogramStartDate) : schedule.stats.inicio,
    completedIds,
    completedDates,
    resetMode: settings?.resetMode || "SMART"
  }), [completedDates, completedIds, settings]);
  const ids = useMemo(() => allProgressIds(currentSchedule.rows), [currentSchedule.rows]);
  const lessons = useMemo(() => allLessons(currentSchedule.rows), [currentSchedule.rows]);

  const todayDate = parseISODate(today);
  const weekStart = startOfWeek(todayDate);
  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const previous30Start = new Date(todayDate);
  previous30Start.setDate(previous30Start.getDate() - 60);
  const last30Start = new Date(todayDate);
  last30Start.setDate(last30Start.getDate() - 30);
  const currentMonth = monthKey(today);
  const daysRemaining = Math.max(0, Math.ceil((parseISODate(currentSchedule.stats.fim).getTime() - todayDate.getTime()) / 86_400_000));
  const progressPercent = ids.length ? Math.round((completedIds.length / ids.length) * 100) : 0;
  const overdueLessons = lessons.filter((lesson) => parseISODate(lesson.data) < todayDate && !completedIds.includes(lesson.id));
  const overdueReviews = currentSchedule.rows.flatMap((row) => row.revisoesDoDia.map((review) => ({ ...review, data: row.data, dataBR: row.dataBR }))).filter((review) => parseISODate(review.data) < todayDate && !completedIds.includes(review.id));
  const scheduledReviews = currentSchedule.rows.flatMap((row) => row.revisoesDoDia.map((review) => ({ ...review, data: row.data })));
  const completedReviews = scheduledReviews.filter((review) => completedIds.includes(review.id));
  const reviewOnTimeRate = scheduledReviews.length ? Math.round((completedReviews.length / scheduledReviews.length) * 100) : 100;
  const scheduledExams = currentSchedule.rows.filter((row) => (row.tipo === "simulado" || row.assunto.toLowerCase().includes("simulado")) && parseISODate(row.data) >= todayDate).slice(0, 4);

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
  const effectiveProductivity = useMemo<Productivity[]>(() => {
    const registeredExtraIds = new Set(productivity
      .map((item) => item.observacoes?.match(/^extra-study:([^:]+):/)?.[1])
      .filter(Boolean) as string[]);
    const syntheticExtraHours = extraStudyTasks
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
  }, [extraStudyTasks, productivity]);
  const lessonDateById = useMemo(() => {
    const map = new Map<string, string>();
    lessons.forEach((lesson) => map.set(lesson.id, lesson.data));
    extraStudyTasks.forEach((task) => map.set(task.externalId || task.id, compactDate(task.data)));
    return map;
  }, [extraStudyTasks, lessons]);

  const questionEvents = useMemo(() => Object.entries(questionByLesson).map(([lessonId, item]) => ({
    lessonId,
    date: lessonDateById.get(lessonId) || today,
    acertos: Number(item.acertos || 0),
    erros: Number(item.erros || 0),
    total: Math.max(Number(item.feitas || 0), Number(item.acertos || 0) + Number(item.erros || 0))
  })), [lessonDateById, questionByLesson]);

  const hoursToday = effectiveProductivity.filter((item) => compactDate(item.data) === today).reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const hoursWeek = effectiveProductivity.filter((item) => new Date(item.data) >= weekStart).reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const hoursMonth = effectiveProductivity.filter((item) => new Date(item.data) >= monthStart).reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const hoursTotal = effectiveProductivity.reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const hoursByArea = areas.map((area) => ({ area, hours: effectiveProductivity.filter((item) => item.materia === area).reduce((acc, item) => acc + Number(item.horas || 0), 0) })).sort((a, b) => b.hours - a.hours);
  const hoursBySystem = Object.entries(effectiveProductivity.reduce<Record<string, number>>((acc, item) => {
    const system = inferSystem(`${item.observacoes || ""} ${item.materia || ""}`);
    acc[system] = (acc[system] || 0) + Number(item.horas || 0);
    return acc;
  }, {})).map(([system, hours]) => ({ system, hours })).sort((a, b) => b.hours - a.hours).slice(0, 8);

  const flashDue = flashcards.filter((card) => compactDate(card.dueDate) <= today);
  const flashReviewedToday = flashcards.filter((card) => card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty);
  const flashOverdue = flashcards.filter((card) => compactDate(card.dueDate) < today && !(card.updatedAt && compactDate(card.updatedAt) === today && card.lastDifficulty));
  const flashScheduledToday = flashcards.filter((card) => compactDate(card.dueDate) === today).length;
  const flashCompletionTotal = flashScheduledToday + flashOverdue.length;
  const flashCompletionRate = flashCompletionTotal ? Math.round((flashReviewedToday.length / flashCompletionTotal) * 100) : 0;
  const flashAttempts = flashcards.reduce((acc, card) => acc + Number(card.acertos || 0) + Number(card.erros || 0), 0);
  const flashRetentionRate = flashAttempts ? Math.round((flashcards.reduce((acc, card) => acc + Number(card.acertos || 0), 0) / flashAttempts) * 100) : 0;
  const difficultCards = flashcards.filter((card) => Number(card.erros || 0) > Number(card.acertos || 0) || ["Muito dificil", "Dificil"].includes(card.lastDifficulty || "")).length;

  const performanceByArea = useMemo<AreaPerformance[]>(() => areas.map((area) => {
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
    const areaHours = effectiveProductivity.filter((item) => item.materia === area).reduce((acc, item) => acc + Number(item.horas || 0), 0);
    const last30 = performances.filter((item) => item.materia === area && new Date(item.data) >= last30Start);
    const previous30 = performances.filter((item) => item.materia === area && new Date(item.data) >= previous30Start && new Date(item.data) < last30Start);
    const last30Percent = last30.length ? last30.reduce((acc, item) => acc + item.percentual, 0) / last30.length : 0;
    const previous30Percent = previous30.length ? previous30.reduce((acc, item) => acc + item.percentual, 0) / previous30.length : 0;
    const acertos = questionStats.acertos + extraQuestionStats.acertos + simStats.acertos + cardStats.acertos;
    const erros = questionStats.erros + extraQuestionStats.erros + simStats.erros + cardStats.erros;
    const total = Math.max(questionStats.feitas + extraQuestionStats.feitas + simStats.questoes + cardStats.acertos + cardStats.erros, acertos + erros);
    const percentual = total ? Math.round((acertos / total) * 100) : 0;
    const flashPendentes = flashDue.filter((card) => card.materia === area || card.deck === area).length;
    const flashAtrasados = flashOverdue.filter((card) => card.materia === area || card.deck === area).length;
    const errosRecentes = errors.filter((item) => item.materia === area && new Date(item.createdAt || item.data) >= last30Start).length;
    const status = percentual < 55 || errosRecentes >= 5 || flashAtrasados >= 10 ? "Critico" : percentual < 70 || flashPendentes >= 12 ? "Atencao" : "Bom";
    return { area, acertos, erros, total, feitas: questionStats.feitas + extraQuestionStats.feitas, percentual, horas: areaHours, tendencia: Math.round(last30Percent - previous30Percent), status, flashPendentes, flashAtrasados, errosRecentes };
  }), [effectiveProductivity, errors, extraStudyTasks, flashDue, flashOverdue, flashcards, lessons, performances, questionByLesson]);

  const questionTotals = performanceByArea.reduce((acc, item) => ({
    acertos: acc.acertos + item.acertos,
    erros: acc.erros + item.erros,
    feitas: acc.feitas + item.feitas,
    total: acc.total + item.total
  }), { acertos: 0, erros: 0, feitas: 0, total: 0 });
  const totalQuestions = questionTotals.feitas || questionTotals.total;
  const generalAccuracy = questionTotals.total ? Math.round((questionTotals.acertos / questionTotals.total) * 100) : 0;
  const rankedAreas = performanceByArea.filter((item) => item.total > 0).sort((a, b) => b.percentual - a.percentual);
  const bestArea = rankedAreas[0];
  const worstArea = [...rankedAreas].sort((a, b) => a.percentual - b.percentual)[0];
  const criticalAreas = performanceByArea.filter((item) => item.status === "Critico").length;

  const examGroups = Array.from(new Set(performances.map((item) => item.examName || item.id)));
  const examAverage = performances.length ? Math.round(performances.reduce((acc, item) => acc + item.percentual, 0) / performances.length) : 0;
  const bestExam = performances.length ? [...performances].sort((a, b) => b.percentual - a.percentual)[0] : null;
  const worstExam = performances.length ? [...performances].sort((a, b) => a.percentual - b.percentual)[0] : null;
  const lastExam = performances.length ? [...performances].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0] : null;

  const score = calculateResidencyScore({ generalAccuracy, examAverage, progressPercent, flashCompletionRate, flashRetentionRate, reviewOnTimeRate, hoursWeek, weeklyGoal: WEEKLY_HOURS_GOAL, criticalAreas });
  const lastMonthHours = effectiveProductivity.filter((item) => new Date(item.data) >= last30Start).reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const previousMonthHours = effectiveProductivity.filter((item) => new Date(item.data) >= previous30Start && new Date(item.data) < last30Start).reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const scoreTrend = Math.round((lastMonthHours - previousMonthHours) / Math.max(1, previousMonthHours) * 100);

  const recurringErrors = Object.entries(errors.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.tema}${item.materia ? ` - ${item.materia}` : ""}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).filter(([, count]) => count > 1);
  const resolvedErrors = errors.filter((item) => ["Facil", "Dificuldade baixa", "Acertei depois"].includes(item.dificuldade || "")).length;
  const fragileTopics = Object.values(errors.reduce<Record<string, { tema: string; materia: string; erros: number; flashcards: number; pendentes: number; ultimoErro: string }>>((acc, item) => {
    const key = `${item.tema || "Sem assunto"}-${item.materia || "Sem area"}`;
    const relatedCards = flashcards.filter((card) => (card.tag || card.pergunta || "").toLowerCase().includes((item.tema || "").toLowerCase()) || card.materia === item.materia);
    const pendingCards = relatedCards.filter((card) => compactDate(card.dueDate) <= today);
    const current = acc[key] || { tema: item.tema || "Sem assunto", materia: item.materia || "Sem area", erros: 0, flashcards: relatedCards.length, pendentes: pendingCards.length, ultimoErro: item.data || item.createdAt };
    current.erros += 1;
    current.flashcards = Math.max(current.flashcards, relatedCards.length);
    current.pendentes = Math.max(current.pendentes, pendingCards.length);
    current.ultimoErro = compactDate(new Date(Math.max(new Date(current.ultimoErro).getTime(), new Date(item.data || item.createdAt).getTime())));
    acc[key] = current;
    return acc;
  }, {})).sort((a, b) => (b.erros + b.pendentes) - (a.erros + a.pendentes)).slice(0, 10);

  const questionsThisWeek = questionEvents.filter((item) => parseISODate(item.date) >= weekStart).reduce((acc, item) => acc + item.total, 0);
  const questionsThisMonth = questionEvents.filter((item) => monthKey(item.date) === currentMonth).reduce((acc, item) => acc + item.total, 0);
  const activityByMonth = Array.from(new Set([...effectiveProductivity.map((item) => monthKey(item.data)), ...performances.map((item) => monthKey(item.data)), ...questionEvents.map((item) => monthKey(item.date))])).sort().slice(-8).map((month) => ({
    month,
    horas: Math.round(effectiveProductivity.filter((item) => monthKey(item.data) === month).reduce((acc, item) => acc + Number(item.horas || 0), 0) * 10) / 10,
    simulados: new Set(performances.filter((item) => monthKey(item.data) === month).map((item) => item.examName || item.id)).size,
    questoes: questionEvents.filter((item) => monthKey(item.date) === month).reduce((acc, item) => acc + item.total, 0),
    flashcards: flashcards.filter((item) => item.updatedAt && monthKey(item.updatedAt) === month).length
  }));

  const heatmapDays = Array.from({ length: 112 }, (_, index) => {
    const date = new Date(todayDate);
    date.setDate(date.getDate() - (111 - index));
    const key = compactDate(date);
    const hours = effectiveProductivity.filter((item) => compactDate(item.data) === key).reduce((acc, item) => acc + Number(item.horas || 0), 0);
    return { key, hours, level: hours >= 6 ? 4 : hours >= 4 ? 3 : hours >= 2 ? 2 : hours > 0 ? 1 : 0 };
  });

  const retentionByArea = performanceByArea.map((item) => {
    const cards = flashcards.filter((card) => card.materia === item.area || card.deck === item.area);
    const hits = cards.reduce((acc, card) => acc + Number(card.acertos || 0), 0);
    const misses = cards.reduce((acc, card) => acc + Number(card.erros || 0), 0);
    const retention = hits + misses ? Math.round((hits / (hits + misses)) * 100) : 0;
    return { area: item.area, retention, reacertos: hits, revisoes: hits + misses };
  });
  const reviewImpact = fragileTopics.slice(0, 6).map((topic) => {
    const cardHits = flashcards.filter((card) => (card.tag || card.pergunta || "").toLowerCase().includes(topic.tema.toLowerCase())).reduce((acc, card) => acc + Number(card.acertos || 0), 0);
    const cardMisses = flashcards.filter((card) => (card.tag || card.pergunta || "").toLowerCase().includes(topic.tema.toLowerCase())).reduce((acc, card) => acc + Number(card.erros || 0), 0);
    const after = cardHits + cardMisses ? Math.round((cardHits / (cardHits + cardMisses)) * 100) : 0;
    const before = Math.max(0, 100 - clamp(topic.erros * 18, 20, 90));
    return { tema: topic.tema, before, after, gain: after - before };
  });

  const priorities = [
    { tone: "red" as const, label: "Aulas atrasadas", value: overdueLessons.length, detail: overdueLessons[0]?.aula || "Nada atrasado" },
    { tone: "red" as const, label: "Revisoes atrasadas", value: overdueReviews.length, detail: overdueReviews[0]?.aula || "Nada atrasado" },
    { tone: "red" as const, label: "Flashcards atrasados", value: flashOverdue.length, detail: `${flashDue.length} pendentes no total` },
    { tone: "yellow" as const, label: "Simulados programados", value: scheduledExams.length, detail: scheduledExams[0]?.dataBR || "Sem simulado proximo" },
    { tone: "yellow" as const, label: "Questoes pendentes", value: Math.max(0, lessons.length - Object.keys(questionByLesson).length), detail: "aulas sem questoes preenchidas" },
    { tone: "green" as const, label: "Meta semanal", value: Math.round((hoursWeek / WEEKLY_HOURS_GOAL) * 100), detail: `${formatHours(hoursWeek)} de ${formatHours(WEEKLY_HOURS_GOAL)}` }
  ];
  const recommendation =
    overdueReviews.length ? `Existem ${overdueReviews.length} revisoes espacadas atrasadas impactando sua curva de esquecimento.` :
    overdueLessons.length ? `Existem ${overdueLessons.length} aulas atrasadas no cronograma.` :
    flashOverdue.length ? `${flashOverdue.length} flashcards atrasados precisam ser revisados antes de abrir conteudo novo.` :
    worstArea ? `Sua maior fragilidade atual e ${worstArea.area}, com ${worstArea.percentual}% de aproveitamento.` :
    recurringErrors.length ? `Ha ${recurringErrors.length} assuntos recorrentes no caderno de erros.` :
    hoursWeek < WEEKLY_HOURS_GOAL ? `Faltam ${formatHours(WEEKLY_HOURS_GOAL - hoursWeek)} para bater a meta semanal de estudo.` :
    "Sem bloqueios criticos. Mantenha o plano do dia.";

  const executiveCards = [
    { title: "Progresso geral", value: `${progressPercent}%`, detail: `${completedIds.length}/${ids.length} aulas e revisoes concluidas`, icon: Target, meta: `${daysRemaining} dias restantes` },
    { title: "Questoes", value: totalQuestions, detail: `${generalAccuracy}% de acerto geral`, icon: BookOpenCheck, meta: `${Math.round((totalQuestions / ANNUAL_QUESTIONS_GOAL) * 100)}% da meta anual` },
    { title: "Horas", value: formatHours(hoursWeek), detail: `${Math.round((hoursWeek / WEEKLY_HOURS_GOAL) * 100)}% da meta semanal`, icon: TimerReset, meta: `${formatHours(hoursTotal)} totais` },
    { title: "Pendencias", value: overdueReviews.length + overdueLessons.length, detail: `${overdueLessons.length} aulas, ${overdueReviews.length} revisoes`, icon: ShieldAlert, meta: `${overdueReviews.length + overdueLessons.length} pendencias totais` }
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 lg:grid-cols-4">
        {executiveCards.map((card) => (
          <article className="card p-4" key={card.title}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">{card.title}</span>
              <card.icon className="text-brand-600" size={18} />
            </div>
            <strong className="block text-3xl font-black tracking-tight">{card.value}</strong>
            <p className="mt-1 text-sm text-slate-500">{card.detail}</p>
            <small className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-500 dark:bg-slate-800">{card.meta}</small>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <article className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Residencia Score</span>
              <h2 className="mt-2 text-5xl font-black">{score.value}</h2>
              <p className="mt-1 text-sm text-slate-500">Classificacao: <strong>{score.classification}</strong></p>
            </div>
            <Brain className="text-brand-600" size={34} />
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-red-700" style={{ width: `${score.value}%` }} />
          </div>
          <p className="mt-3 text-sm text-slate-500">Evolucao estimada dos ultimos 30 dias: <strong>{scoreTrend >= 0 ? "+" : ""}{scoreTrend}%</strong> em volume de horas.</p>
          <div className="mt-4 grid gap-2">
            {score.components.map((item) => <ScoreRow key={item.label} {...item} />)}
          </div>
        </article>

        <article className="card border-l-4 border-l-red-700 p-5">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Proxima acao recomendada</span>
          <h2 className="mt-2 text-2xl font-black">{recommendation}</h2>
          <p className="mt-2 text-sm text-slate-500">Leitura automatica de cronograma, questoes, flashcards, simulados, caderno de erros e horas registradas.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {priorities.map((item) => <Priority key={item.label} {...item} />)}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <article className="card p-5">
          <h2 className="text-lg font-black">Mapa de risco por grande area</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-400">
                <tr><th className="py-2">Area</th><th>Acerto</th><th>Questoes</th><th>Erros</th><th>Flashcards</th><th>Recentes</th><th>Status</th></tr>
              </thead>
              <tbody>
                {performanceByArea.map((item) => (
                  <tr className="border-t border-slate-100 dark:border-white/10" key={item.area}>
                    <td className="py-3 font-black">{item.area}</td>
                    <td>{item.percentual}%</td>
                    <td>{item.total}</td>
                    <td>{item.erros}</td>
                    <td>{item.flashPendentes} pend. / {item.flashAtrasados} atr.</td>
                    <td>{item.errosRecentes}</td>
                    <td><StatusBadge status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Melhor e pior desempenho</h2>
          <div className="mt-4 grid gap-3">
            <SummaryCard title="Melhor desempenho" value={bestArea ? `${bestArea.area} - ${bestArea.percentual}%` : "Sem dados"} detail={bestArea ? `${bestArea.acertos} acertos e ${bestArea.erros} erros` : undefined} />
            <SummaryCard title="Pior desempenho" value={worstArea ? `${worstArea.area} - ${worstArea.percentual}%` : "Sem dados"} detail={worstArea ? `${worstArea.acertos} acertos e ${worstArea.erros} erros` : undefined} />
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Desempenho por area</h2>
        <div className="mt-4 grid gap-3">
          {performanceByArea.map((item) => <PerformanceBar key={item.area} item={item} />)}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <article className="card p-5">
          <h2 className="text-lg font-black">Dashboard de tempo</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Hoje" value={formatHours(hoursToday)} />
            <Metric title="Esta semana" value={formatHours(hoursWeek)} detail={`${Math.round((hoursWeek / WEEKLY_HOURS_GOAL) * 100)}% da meta`} />
            <Metric title="Este mes" value={formatHours(hoursMonth)} />
            <Metric title="Total" value={formatHours(hoursTotal)} />
          </div>
          <h3 className="mt-5 text-sm font-black">Ranking de dedicacao</h3>
          <div className="mt-3 grid gap-2">
            <Row left="Materia mais estudada" right={hoursByArea[0]?.hours ? `${hoursByArea[0].area} - ${formatHours(hoursByArea[0].hours)}` : "Sem dados"} />
            <Row left="Materia menos estudada" right={[...hoursByArea].reverse().find((item) => item.hours > 0) ? `${[...hoursByArea].reverse().find((item) => item.hours > 0)?.area} - ${formatHours([...hoursByArea].reverse().find((item) => item.hours > 0)?.hours || 0)}` : "Sem dados"} />
            <Row left="Sistema mais estudado" right={hoursBySystem[0] ? `${hoursBySystem[0].system} - ${formatHours(hoursBySystem[0].hours)}` : "Sem dados"} />
            <Row left="Sistema negligenciado" right={[...hoursBySystem].reverse().find((item) => item.hours > 0) ? `${[...hoursBySystem].reverse().find((item) => item.hours > 0)?.system} - ${formatHours([...hoursBySystem].reverse().find((item) => item.hours > 0)?.hours || 0)}` : "Sem dados"} />
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Horas por grande area e sistema</h2>
          <div className="mt-4 grid gap-2">
            {hoursByArea.map((item) => <HorizontalValue key={item.area} label={item.area} value={formatHours(item.hours)} pct={hoursTotal ? Math.round((item.hours / hoursTotal) * 100) : 0} />)}
          </div>
          <div className="mt-5 grid gap-2">
            {hoursBySystem.map((item) => <HorizontalValue key={item.system} label={item.system} value={formatHours(item.hours)} pct={hoursTotal ? Math.round((item.hours / hoursTotal) * 100) : 0} />)}
            {!hoursBySystem.length && <Empty text="Os sistemas serao inferidos pelas observacoes e registros." />}
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Heatmap de consistencia</h2>
        <div className="mt-4 grid grid-flow-col grid-rows-7 justify-start gap-1 overflow-x-auto">
          {heatmapDays.map((day) => <div key={day.key} title={`${day.key} - ${formatHours(day.hours)}`} className={`h-4 w-4 rounded-[4px] ${["bg-slate-100 dark:bg-slate-800", "bg-emerald-200", "bg-emerald-400", "bg-emerald-600", "bg-emerald-800"][day.level]}`} />)}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="card p-5">
          <h2 className="text-lg font-black">Inteligencia de erros</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Total de erros" value={errors.length} />
            <Metric title="Erros abertos" value={Math.max(0, errors.length - resolvedErrors)} />
            <Metric title="Erros recorrentes" value={recurringErrors.length} />
            <Metric title="Resolvidos" value={resolvedErrors} />
          </div>
          <h3 className="mt-5 text-sm font-black">Top assuntos mais frageis</h3>
          <div className="mt-3 grid gap-2">
            {fragileTopics.map((topic) => <TopicRisk key={`${topic.tema}-${topic.materia}`} topic={topic} />)}
            {!fragileTopics.length && <Empty text="O ranking sera criado a partir do caderno de erros e flashcards." />}
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Eficiencia de flashcards</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Total" value={flashcards.length} />
            <Metric title="Pendentes" value={flashDue.length} />
            <Metric title="Atrasados" value={flashOverdue.length} />
            <Metric title="Revisados hoje" value={flashReviewedToday.length} />
            <Metric title="Taxa de revisao" value={`${flashCompletionRate}%`} />
            <Metric title="Retencao" value={`${flashRetentionRate}%`} />
            <Metric title="Cards dificeis" value={difficultCards} />
            <Metric title="Marcados como erro" value={flashcards.filter((card) => Number(card.erros || 0) > 0).length} />
          </div>
          <h3 className="mt-5 text-sm font-black">Funil de aprendizagem</h3>
          <div className="mt-3 grid gap-2">
            <HorizontalValue label="Erro registrado" value={`${errors.length}`} pct={100} />
            <HorizontalValue label="Foi revisado" value={`${flashAttempts}`} pct={flashcards.length ? Math.round((flashAttempts / flashcards.length) * 100) : 0} />
            <HorizontalValue label="Tema corrigido" value={`${resolvedErrors}`} pct={errors.length ? Math.round((resolvedErrors / errors.length) * 100) : 0} />
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="card p-5">
          <h2 className="text-lg font-black">Retencao por area</h2>
          <div className="mt-4 grid gap-2">
            {retentionByArea.map((item) => <HorizontalValue key={item.area} label={item.area} value={`${item.retention}%`} pct={item.retention} />)}
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Impacto da revisao</h2>
          <div className="mt-4 grid gap-2">
            {reviewImpact.map((item) => <Row key={item.tema} left={item.tema} right={`${item.before}% -> ${item.after}% (${item.gain >= 0 ? "+" : ""}${item.gain})`} />)}
            {!reviewImpact.length && <Empty text="O impacto aparecera quando houver erros e revisoes vinculadas." />}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="card p-5">
          <h2 className="text-lg font-black">Questoes e simulados</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Questoes esta semana" value={questionsThisWeek} />
            <Metric title="Questoes este mes" value={questionsThisMonth} />
            <Metric title="Acerto geral" value={`${generalAccuracy}%`} />
            <Metric title="Simulados realizados" value={examGroups.length} />
            <Metric title="Media dos simulados" value={`${examAverage}%`} />
            <Metric title="Ultimo simulado" value={lastExam ? `${lastExam.percentual}%` : "Sem dados"} />
            <Metric title="Melhor simulado" value={bestExam ? `${bestExam.percentual}%` : "Sem dados"} />
            <Metric title="Pior simulado" value={worstExam ? `${worstExam.percentual}%` : "Sem dados"} />
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Evolucao temporal</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityByMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="horas" stroke="#b91c1c" strokeWidth={3} name="Horas" />
                <Line type="monotone" dataKey="simulados" stroke="#7c3aed" strokeWidth={2} name="Simulados" />
                <Line type="monotone" dataKey="questoes" stroke="#d946ef" strokeWidth={2} name="Questoes" />
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
              <Bar dataKey="questoes" fill="#d946ef" radius={[8, 8, 0, 0]} name="Questoes" />
              <Bar dataKey="flashcards" fill="#0f766e" radius={[8, 8, 0, 0]} name="Flashcards" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Diagnostico automatico</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Diagnostic title="Pontos fortes" items={[
            bestArea ? `${bestArea.area} e sua area mais consistente.` : "Ainda sem area forte definida.",
            hoursWeek >= WEEKLY_HOURS_GOAL ? "Meta semanal de horas encaminhada." : "Base de horas ainda em construcao.",
            flashRetentionRate >= 70 ? "Retencao dos flashcards esta boa." : "Retencao dos flashcards precisa amadurecer."
          ]} />
          <Diagnostic title="Pontos criticos" items={[
            worstArea ? `${worstArea.area} precisa de atencao.` : "Sem desempenho por area suficiente.",
            flashOverdue.length ? `${flashOverdue.length} flashcards atrasados.` : "Sem atraso relevante de flashcards.",
            recurringErrors.length ? `${recurringErrors.length} temas recorrentes no caderno.` : "Sem recorrencia alta de erros."
          ]} />
          <Diagnostic title="Recomendacoes" items={[
            recommendation,
            worstArea ? `Direcione questoes e revisoes para ${worstArea.area}.` : "Cadastre mais questoes por aula.",
            hoursByArea.find((item) => item.hours === 0) ? `Inclua tempo de ${hoursByArea.find((item) => item.hours === 0)?.area}.` : "Mantenha distribuicao de horas por area."
          ]} />
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

function PerformanceBar({ item }: { item: AreaPerformance }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <strong>{item.area}</strong>
        <span className="font-black">{item.percentual}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className="h-full rounded-full bg-red-700" style={{ width: `${item.percentual}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{item.acertos} acertos - {item.erros} erros - {item.total} respostas - {formatHours(item.horas)} - tendencia {item.tendencia >= 0 ? "+" : ""}{item.tendencia}%</p>
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

function SummaryCard({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return <article className="rounded-xl bg-slate-50 p-5 dark:bg-slate-800"><span className="text-xs font-black uppercase tracking-wider text-slate-400">{title}</span><strong className="mt-2 block text-2xl font-black">{value}</strong>{detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}</article>;
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

function ScoreRow({ label, value, weight }: { label: string; value: number; weight: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
      <strong>{label}</strong>
      <span>{value}%</span>
      <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500 dark:bg-slate-900">{weight}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: AreaPerformance["status"] }) {
  const className = status === "Critico" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200" : status === "Atencao" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${className}`}>{status}</span>;
}

function TopicRisk({ topic }: { topic: { tema: string; materia: string; erros: number; flashcards: number; pendentes: number; ultimoErro: string } }) {
  const priority = topic.erros >= 3 || topic.pendentes >= 5 ? "Alta" : topic.erros >= 2 ? "Media" : "Baixa";
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{topic.tema}</strong>
        <StatusBadge status={priority === "Alta" ? "Critico" : priority === "Media" ? "Atencao" : "Bom"} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{topic.materia} - {topic.erros} erros - {topic.flashcards} cards - {topic.pendentes} pendentes - ultimo erro {topic.ultimoErro}</p>
    </div>
  );
}

function Diagnostic({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
      <h3 className="font-black">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.map((item) => <p className="text-sm text-slate-600 dark:text-slate-300" key={item}>{item}</p>)}
      </div>
    </div>
  );
}
