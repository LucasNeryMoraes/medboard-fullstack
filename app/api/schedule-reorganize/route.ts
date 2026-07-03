import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { applyScheduleOverrides, buildCronogramSchedule, dateOnlyISO, inferPriority, parseISODate, schedule } from "@/utils/schedule";

type PendingItem = { id: string; title: string; materia: string; originalDate: string; targetDate?: string };
type ReorganizationPlan = {
  lessons: PendingItem[];
  reviews: PendingItem[];
  flashcards: PendingItem[];
  latestSnapshotId: string | null;
};

function saoPauloToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(iso: string, days: number) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("sv-SE");
}

function taskMetadata(task: { metadata: unknown }) {
  return task.metadata && typeof task.metadata === "object" ? task.metadata as Record<string, unknown> : {};
}

async function createPlan(userId: string): Promise<ReorganizationPlan> {
  const today = saoPauloToday();
  const [settings, tasks, flashcards, latestSnapshot] = await Promise.all([
    prisma.scheduleSettings.findUnique({ where: { userId } }),
    prisma.task.findMany({ where: { userId } }),
    prisma.flashcard.findMany({ where: { userId }, orderBy: { dueDate: "asc" } }),
    prisma.scheduleSnapshot.findFirst({ where: { userId, kind: "REORGANIZE" }, orderBy: { createdAt: "desc" }, select: { id: true } })
  ]);
  const completedIds = tasks.filter((task) => task.status === "DONE" && task.externalId).map((task) => task.externalId as string);
  const completedDates = Object.fromEntries(tasks.filter((task) => task.status === "DONE" && task.externalId).map((task) => [task.externalId as string, dateOnlyISO(task.data)]));
  const rescheduledDates = Object.fromEntries(tasks
    .filter((task) => task.status === "RESCHEDULED" && task.externalId)
    .map((task) => [task.externalId as string, dateOnlyISO(task.data)]));
  const archived = new Set(tasks.filter((task) => task.status === "ARCHIVED" && task.externalId).map((task) => task.externalId as string));
  const base = buildCronogramSchedule({
    startDate: settings ? dateOnlyISO(settings.cronogramStartDate) : schedule.stats.inicio,
    completedIds,
    completedDates,
    resetMode: "SMART"
  });
  const current = applyScheduleOverrides(base, { rescheduledDates, completedIds });

  const overdueLessons = current.rows.flatMap((row) => row.aulas.map((lesson) => ({ ...lesson, rowDate: row.data })))
    .filter((lesson) => lesson.rowDate < today && !completedIds.includes(lesson.id) && !archived.has(lesson.id))
    .sort((a, b) => inferPriority(b).score - inferPriority(a).score || a.rowDate.localeCompare(b.rowDate));
  const overdueReviews = current.rows.flatMap((row) => row.revisoesDoDia.map((review) => ({ ...review, rowDate: row.data })))
    .filter((review) => review.rowDate < today && !completedIds.includes(review.id) && !archived.has(review.id));
  const overdueFlashcards = flashcards.filter((card) => dateOnlyISO(card.dueDate) < today);

  const load = new Map<string, { lessons: number; reviews: number; flashcards: number; addedLessons: number; addedReviews: number; addedFlashcards: number }>();
  const getLoad = (date: string) => {
    if (!load.has(date)) load.set(date, { lessons: 0, reviews: 0, flashcards: 0, addedLessons: 0, addedReviews: 0, addedFlashcards: 0 });
    return load.get(date)!;
  };
  current.rows.filter((row) => row.data >= today).forEach((row) => {
    const day = getLoad(row.data);
    day.lessons += row.aulas.length;
    day.reviews += row.revisoesDoDia.length;
  });
  flashcards.filter((card) => dateOnlyISO(card.dueDate) >= today).forEach((card) => { getLoad(dateOnlyISO(card.dueDate)).flashcards += 1; });

  function allocate(type: "lesson" | "review" | "flashcard") {
    let cursor = today;
    for (let attempt = 0; attempt < 730; attempt += 1) {
      const weekday = parseISODate(cursor).getDay();
      const day = getLoad(cursor);
      const allowed = type === "lesson"
        ? weekday >= 1 && weekday <= 5 && day.lessons < 3 && day.addedLessons < 2
        : type === "review"
          ? weekday !== 6 && day.reviews < (weekday === 0 ? 2 : 5) && day.addedReviews < (weekday === 0 ? 2 : 3)
          : day.flashcards < (weekday === 0 ? 20 : 60) && day.addedFlashcards < (weekday === 0 ? 20 : 30);
      if (allowed) {
        if (type === "lesson") { day.lessons += 1; day.addedLessons += 1; }
        if (type === "review") { day.reviews += 1; day.addedReviews += 1; }
        if (type === "flashcard") { day.flashcards += 1; day.addedFlashcards += 1; }
        return cursor;
      }
      cursor = addDays(cursor, 1);
    }
    throw new Error("Nao foi possivel encontrar uma data livre para redistribuicao.");
  }

  const lessons = overdueLessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.aula,
    materia: lesson.disciplina,
    originalDate: lesson.rowDate,
    targetDate: allocate("lesson")
  }));
  const movedLessonIds = new Set(lessons.map((lesson) => lesson.id));
  const reviews = overdueReviews
    .filter((review) => ![...movedLessonIds].some((lessonId) => review.id === `review-${lessonId}-15` || review.id === `review-${lessonId}-30`))
    .map((review) => ({
      id: review.id,
      title: `${review.tipoRevisao} - ${review.aula}`,
      materia: review.disciplina,
      originalDate: review.rowDate,
      targetDate: allocate("review")
    }));
  const flashcardPlans = overdueFlashcards.map((card) => ({
    id: card.id,
    title: card.pergunta,
    materia: card.materia || card.deck || "Flashcards",
    originalDate: dateOnlyISO(card.dueDate),
    targetDate: allocate("flashcard")
  }));

  return { lessons, reviews, flashcards: flashcardPlans, latestSnapshotId: latestSnapshot?.id || null };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await createPlan(userId));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (!limited.ok) return fail(new Error("Rate limit excedido"), 429);
  try {
    const userId = await requireUserId();
    const plan = await createPlan(userId);
    const ids = [...plan.lessons, ...plan.reviews].map((item) => item.id);
    const existingTasks = await prisma.task.findMany({ where: { userId, externalId: { in: ids } } });
    const existingByExternalId = new Map(existingTasks.map((task) => [task.externalId, task]));
    const snapshotData = {
      tasks: ids.map((externalId) => {
        const task = existingByExternalId.get(externalId);
        return task ? { externalId, existed: true, previous: { status: task.status, data: task.data, titulo: task.titulo, descricao: task.descricao, tipo: task.tipo, prioridade: task.prioridade, materia: task.materia, metadata: task.metadata } } : { externalId, existed: false };
      }),
      flashcards: plan.flashcards.map((item) => ({ id: item.id, dueDate: item.originalDate }))
    };

    const result = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.scheduleSnapshot.create({
        data: { userId, kind: "REORGANIZE", data: snapshotData as Prisma.InputJsonValue }
      });
      for (const item of [...plan.lessons, ...plan.reviews]) {
        const existing = existingByExternalId.get(item.id);
        if (existing?.status === "DONE" || existing?.status === "ARCHIVED") continue;
        const tipo = plan.lessons.some((lesson) => lesson.id === item.id) ? "AULA" : "REVISAO";
        const priority = tipo === "AULA" ? inferPriority({ id: item.id, aula: item.title, disciplina: item.materia } as never).value : "MEDIUM";
        await tx.task.upsert({
          where: { userId_externalId: { userId, externalId: item.id } },
          create: { userId, externalId: item.id, titulo: item.title, data: parseISODate(item.targetDate!), tipo, status: "RESCHEDULED", prioridade: priority, materia: item.materia, metadata: { reorganized: true, snapshotId: snapshot.id, originalDate: item.originalDate } },
          update: { data: parseISODate(item.targetDate!), status: "RESCHEDULED", metadata: { ...taskMetadata(existing || { metadata: null }), reorganized: true, snapshotId: snapshot.id, originalDate: item.originalDate } }
        });
      }
      for (const item of plan.flashcards) {
        await tx.flashcard.updateMany({ where: { id: item.id, userId }, data: { dueDate: parseISODate(item.targetDate!) } });
      }
      return snapshot;
    });

    return ok({ snapshotId: result.id, lessons: plan.lessons.length, reviews: plan.reviews.length, flashcards: plan.flashcards.length }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
