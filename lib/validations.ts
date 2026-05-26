import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const registerSchema = loginSchema.extend({
  nome: z.string().min(2).max(100)
});

export const taskSchema = z.object({
  externalId: z.string().optional(),
  titulo: z.string().min(1),
  descricao: z.string().optional().nullable(),
  status: z.enum(["PENDING", "DONE", "ARCHIVED"]).default("PENDING"),
  data: z.coerce.date(),
  tipo: z.enum(["AULA", "REVISAO", "SIMULADO", "LIVRE", "EXTRA"]),
  prioridade: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  materia: z.string().optional().nullable(),
  metadata: z.unknown().optional()
});

export const performanceSchema = z.object({
  materia: z.string().min(1),
  acertos: z.coerce.number().int().min(0),
  erros: z.coerce.number().int().min(0),
  examName: z.string().optional().nullable(),
  data: z.coerce.date().optional()
});

export const errorNotebookSchema = z.object({
  tema: z.string().min(1),
  erro: z.string().min(1),
  revisao: z.string().optional().nullable(),
  flashcard: z.string().optional().nullable(),
  resposta: z.string().optional().nullable(),
  materia: z.string().optional().nullable()
});

export const timerSchema = z.object({
  tempo: z.coerce.number().int().min(60),
  data: z.coerce.date().optional()
});

export const productivitySchema = z.object({
  horas: z.coerce.number().min(0.1),
  rendimento: z.coerce.number().int().min(0).max(100),
  observacoes: z.string().optional().nullable(),
  materia: z.string().optional().nullable(),
  data: z.coerce.date().optional()
});

export const scheduleWeekSchema = z.object({
  semana: z.string().min(1),
  tarefas: z.unknown().default([]),
  revisoes: z.unknown().default([]),
  simulados: z.unknown().default([]),
  board: z.unknown().optional()
});
