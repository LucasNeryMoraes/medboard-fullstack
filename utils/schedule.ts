import rawSchedule from "@/src-data/schedule.json";
import type { ScheduleData, ScheduleLesson, ScheduleRow } from "@/types/schedule";

export const schedule = rawSchedule as ScheduleData;

export const areas = ["Clínica Médica", "Cirurgia Geral", "Pediatria", "Ginecologia e Obstetrícia", "Preventiva"];

export function normalizeText(text: unknown) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function parseISODate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function dateOnlyISO(value: string | Date | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("sv-SE");
}

export function todayISO() {
  return new Date().toLocaleDateString("sv-SE");
}

export function isSaturday(iso: string) {
  return parseISODate(iso).getDay() === 6;
}

export function saturdaySimuladoId(iso: string) {
  return `simulado-sabado-${iso}`;
}

function addDays(iso: string, days: number) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("sv-SE");
}

function formatBR(iso: string) {
  return parseISODate(iso).toLocaleDateString("pt-BR");
}

function weekdayLabel(iso: string) {
  const [label] = parseISODate(iso).toLocaleDateString("pt-BR", { weekday: "long" }).split(",");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isReviewExternalId(id: string) {
  return id.startsWith("review-") || id.startsWith("rev-");
}

function reviewInterval(review: ScheduleRow["revisoesDoDia"][number]) {
  const idMatch = review.id.match(/-(15|30)(?:-|$)/);
  const labelMatch = review.tipoRevisao.match(/(15|30)/);
  return Number(idMatch?.[1] || labelMatch?.[1] || 0);
}

function sameReviewContent(review: ScheduleRow["revisoesDoDia"][number], lesson: ScheduleLesson) {
  return normalizeText(review.disciplina) === normalizeText(lesson.disciplina)
    && normalizeText(review.aula) === normalizeText(lesson.aula);
}

function weekLabel(startISO: string, dateISO: string) {
  const diff = Math.max(0, Math.floor((parseISODate(dateISO).getTime() - parseISODate(startISO).getTime()) / 86_400_000));
  return `Semana ${Math.floor(diff / 7) + 1}`;
}

function nextStudyDate(cursorISO: string) {
  let cursor = cursorISO;
  while ([0, 6].includes(parseISODate(cursor).getDay())) cursor = addDays(cursor, 1);
  return cursor;
}

function rowBase(row: number, startISO: string, dateISO: string, tipo: ScheduleRow["tipo"], overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    row,
    semana: weekLabel(startISO, dateISO),
    data: dateISO,
    dataBR: formatBR(dateISO),
    diaSemana: weekdayLabel(dateISO),
    horario: tipo === "simulado" ? "08h00 - 12h00" : tipo === "revisao" ? "21h30 - 22h30" : "19h30 - 21h30",
    disciplina: tipo === "simulado" ? "Simulado" : tipo === "livre" ? "Livre" : overrides.disciplina || "Revisao",
    assunto: overrides.assunto || (tipo === "simulado" ? "Simulado semanal" : tipo === "livre" ? "Domingo livre" : "Revisao"),
    tipo,
    domingo: tipo === "livre",
    aulas: [],
    revisoesDoDia: [],
    ...overrides
  };
}

function addSpacedReviews(reviewMap: Map<string, ScheduleRow["revisoesDoDia"]>, lesson: ScheduleLesson, lessonDate: string, startDate: string) {
  [15, 30].forEach((days) => {
    const reviewDate = addDays(lessonDate, days);
    reviewMap.set(reviewDate, [
      ...(reviewMap.get(reviewDate) || []),
      {
        id: `review-${lesson.id}-${days}`,
        tipoRevisao: `D+${days}`,
        disciplina: lesson.disciplina,
        aula: lesson.aula,
        dataOriginal: lessonDate,
        semanaOriginal: weekLabel(startDate, lessonDate)
      }
    ]);
  });
}

export function buildCronogramSchedule(options: { startDate?: string | null; completedIds?: string[]; completedDates?: Record<string, string>; resetMode?: "SMART" | "FULL" } = {}) {
  const startDate = options.startDate || schedule.stats.inicio;
  if (startDate === schedule.stats.inicio) return schedule;

  const completed = new Set(options.resetMode === "FULL" ? [] : options.completedIds || []);
  const completedDates = options.completedDates || {};
  const sourceLessons = allLessons(schedule.rows);
  const lockedLessons = sourceLessons.filter((lesson) => completed.has(lesson.id) && completedDates[lesson.id]);
  const pendingLessons = sourceLessons
    .filter((lesson) => !completed.has(lesson.id))
    .sort((a, b) => inferPriority(b).score - inferPriority(a).score || a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  const rows: ScheduleRow[] = [];
  const reviewMap = new Map<string, ScheduleRow["revisoesDoDia"]>();
  let cursor = nextStudyDate(startDate);
  let row = 1;
  let index = 0;

  const lockedByDate = new Map<string, ScheduleLesson[]>();
  lockedLessons.forEach((lesson) => {
    const date = completedDates[lesson.id];
    lockedByDate.set(date, [...(lockedByDate.get(date) || []), {
      ...lesson,
      data: date,
      dataBR: formatBR(date),
      diaSemana: weekdayLabel(date),
      semana: weekLabel(startDate, date)
    }]);
  });
  lockedByDate.forEach((lessons, date) => {
    rows.push(rowBase(row++, startDate, date, "aula", {
      disciplina: lessons[0]?.disciplina || "Aula",
      assunto: lessons.map((lesson) => lesson.aula).join(" | "),
      aulas: lessons
    }));
    lessons.forEach((lesson) => addSpacedReviews(reviewMap, lesson, date, startDate));
  });

  while (index < pendingLessons.length) {
    const day = parseISODate(cursor).getDay();
    if (day === 6) {
      rows.push(rowBase(row++, startDate, cursor, "simulado"));
      cursor = addDays(cursor, 1);
      continue;
    }
    if (day === 0) {
      rows.push(rowBase(row++, startDate, cursor, "livre"));
      cursor = addDays(cursor, 1);
      continue;
    }

    const dayLessons = pendingLessons.slice(index, index + 2);
    index += dayLessons.length;
    const lessons = dayLessons.map((lesson): ScheduleLesson => ({
      ...lesson,
      data: cursor,
      dataBR: formatBR(cursor),
      diaSemana: weekdayLabel(cursor),
      semana: weekLabel(startDate, cursor)
    }));
    rows.push(rowBase(row++, startDate, cursor, "aula", {
      disciplina: lessons[0]?.disciplina || "Aula",
      assunto: lessons.map((lesson) => lesson.aula).join(" | "),
      aulas: lessons
    }));

    lessons.forEach((lesson) => addSpacedReviews(reviewMap, lesson, cursor, startDate));

    cursor = addDays(cursor, 1);
  }

  const endWithReviews = [...reviewMap.keys()].sort().at(-1);
  const finalDate = endWithReviews && endWithReviews > cursor ? endWithReviews : cursor;
  let fillCursor = startDate;
  while (fillCursor <= finalDate) {
    const day = parseISODate(fillCursor).getDay();
    const hasRow = rows.some((item) => item.data === fillCursor && (item.tipo === "aula" || item.tipo === "simulado" || item.tipo === "livre"));
    if (!hasRow && day === 6) rows.push(rowBase(row++, startDate, fillCursor, "simulado"));
    if (!hasRow && day === 0) rows.push(rowBase(row++, startDate, fillCursor, "livre"));
    const reviews = reviewMap.get(fillCursor);
    if (reviews?.length) rows.push(rowBase(row++, startDate, fillCursor, "revisao", { revisoesDoDia: reviews, disciplina: "Revisao", assunto: `${reviews.length} revisao(oes)` }));
    fillCursor = addDays(fillCursor, 1);
  }

  rows.sort((a, b) => a.data.localeCompare(b.data) || a.row - b.row);
  rows.forEach((item, idx) => { item.row = idx + 1; });

  const semanas = [...new Set(rows.map((item) => item.semana))];
  return {
    ...schedule,
    rows,
    semanas,
    stats: {
      ...schedule.stats,
      inicio: startDate,
      fim: rows.at(-1)?.data || startDate,
      totalDias: new Set(rows.map((item) => item.data)).size,
      totalAulas: pendingLessons.length,
      totalRevisoes: rows.reduce((acc, item) => acc + item.revisoesDoDia.length, 0)
    }
  } satisfies ScheduleData;
}

export function applyScheduleOverrides(
  source: ScheduleData,
  options: { rescheduledDates?: Record<string, string>; completedIds?: string[] } = {}
) {
  const overrides = options.rescheduledDates || {};
  if (!Object.keys(overrides).length) return source;

  const completed = new Set(options.completedIds || []);
  const rows = source.rows.map((row) => ({
    ...row,
    aulas: row.aulas.map((lesson) => ({ ...lesson })),
    revisoesDoDia: row.revisoesDoDia.map((review) => ({ ...review }))
  }));
  const lessons = new Map(rows.flatMap((row) => row.aulas).map((lesson) => [lesson.id, { ...lesson }]));
  const reviews = new Map(rows.flatMap((row) => row.revisoesDoDia).map((review) => [review.id, { ...review }]));

  function ensureRow(date: string, type: "aula" | "revisao") {
    let row = rows.find((item) => item.data === date && item.tipo === type);
    if (!row) {
      row = rowBase(rows.length + 1, source.stats.inicio, date, type, type === "revisao"
        ? { disciplina: "Revisao", assunto: "Revisoes reorganizadas" }
        : { disciplina: "Aula", assunto: "Aulas reorganizadas" });
      rows.push(row);
    }
    return row;
  }

  const movedLessons = new Map<string, string>();
  Object.entries(overrides).forEach(([id, date]) => {
    if (completed.has(id) || isReviewExternalId(id)) return;
    const lesson = lessons.get(id);
    if (!lesson) return;
    rows.forEach((row) => { row.aulas = row.aulas.filter((item) => item.id !== id); });
    const target = ensureRow(date, "aula");
    target.aulas.push({
      ...lesson,
      data: date,
      dataBR: formatBR(date),
      diaSemana: weekdayLabel(date),
      semana: weekLabel(source.stats.inicio, date)
    });
    target.disciplina = target.aulas[0]?.disciplina || "Aula";
    target.assunto = target.aulas.map((item) => item.aula).join(" | ");
    movedLessons.set(id, date);
  });

  movedLessons.forEach((lessonDate, lessonId) => {
    const lesson = lessons.get(lessonId);
    if (!lesson) return;
    [15, 30].forEach((days) => {
      const review = [...reviews.values()].find((item) => reviewInterval(item) === days && sameReviewContent(item, lesson));
      if (!review) return;
      if (completed.has(review.id)) return;
      rows.forEach((row) => { row.revisoesDoDia = row.revisoesDoDia.filter((item) => item.id !== review.id); });
      const date = addDays(lessonDate, days);
      const target = ensureRow(date, "revisao");
      target.revisoesDoDia.push({
        ...review,
        dataOriginal: lessonDate,
        semanaOriginal: weekLabel(source.stats.inicio, lessonDate)
      });
      target.assunto = `${target.revisoesDoDia.length} revisao(oes)`;
    });
  });

  Object.entries(overrides).forEach(([id, date]) => {
    if (completed.has(id) || !isReviewExternalId(id)) return;
    const review = reviews.get(id);
    if (!review) return;
    rows.forEach((row) => { row.revisoesDoDia = row.revisoesDoDia.filter((item) => item.id !== id); });
    const target = ensureRow(date, "revisao");
    target.revisoesDoDia.push(review);
    target.assunto = `${target.revisoesDoDia.length} revisao(oes)`;
  });

  const filtered = rows.filter((row) => row.tipo === "simulado" || row.tipo === "livre" || row.aulas.length || row.revisoesDoDia.length);
  filtered.sort((a, b) => a.data.localeCompare(b.data) || a.row - b.row);
  filtered.forEach((row, index) => {
    row.row = index + 1;
    row.semana = weekLabel(source.stats.inicio, row.data);
    row.dataBR = formatBR(row.data);
    row.diaSemana = weekdayLabel(row.data);
  });

  return {
    ...source,
    rows: filtered,
    semanas: [...new Set(filtered.map((row) => row.semana))],
    stats: {
      ...source.stats,
      fim: filtered.at(-1)?.data || source.stats.fim,
      totalDias: new Set(filtered.map((row) => row.data)).size,
      totalAulas: filtered.reduce((total, row) => total + row.aulas.length, 0),
      totalRevisoes: filtered.reduce((total, row) => total + row.revisoesDoDia.length, 0)
    }
  } satisfies ScheduleData;
}

export function allLessons(rows: ScheduleRow[] = schedule.rows) {
  return rows.flatMap((row) => row.aulas || []);
}

export function allProgressIds(rows: ScheduleRow[] = schedule.rows) {
  const ids = new Set<string>();
  rows.forEach((row) => {
    row.aulas.forEach((lesson) => ids.add(lesson.id));
    row.revisoesDoDia.forEach((review) => ids.add(review.id));
    if (isSaturday(row.data)) ids.add(saturdaySimuladoId(row.data));
  });
  return [...ids];
}

export function inferPriority(lesson: ScheduleLesson) {
  const high = ["sepse", "pneumonia", "asma", "dpoc", "diabetes", "avc", "iam", "trauma", "abdome agudo", "preeclampsia", "vacina", "aps", "sus", "tuberculose"];
  const mid = ["drge", "ulcera", "anemia", "tireoide", "cefaleia", "meningite", "endometriose", "mioma", "contracepcao", "obesidade"];
  const text = normalizeText(`${lesson.disciplina} ${lesson.aula}`);
  if (high.some((term) => text.includes(normalizeText(term)))) return { label: "Alta", value: "HIGH" as const, score: 92 };
  if (mid.some((term) => text.includes(normalizeText(term)))) return { label: "Média", value: "MEDIUM" as const, score: 68 };
  return { label: "Baixa", value: "LOW" as const, score: 38 };
}

export function weekRange(week: string) {
  const dates = schedule.rows.filter((row) => row.semana === week).map((row) => row.data).sort();
  if (!dates.length) return "";
  const format = (iso: string) => parseISODate(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${format(dates[0])} a ${format(dates[dates.length - 1])}`;
}
