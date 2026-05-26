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

export function todayISO() {
  return new Date().toLocaleDateString("sv-SE");
}

export function isSaturday(iso: string) {
  return parseISODate(iso).getDay() === 6;
}

export function saturdaySimuladoId(iso: string) {
  return `simulado-sabado-${iso}`;
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
