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
  questoes: z.coerce.number().int().min(0).optional(),
  acertos: z.coerce.number().int().min(0),
  erros: z.coerce.number().int().min(0),
  examName: z.string().optional().nullable(),
  instituicao: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  data: z.coerce.date().optional()
});

export const errorNotebookSchema = z.object({
  tema: z.string().min(1),
  erro: z.string().min(1),
  revisao: z.string().optional().nullable(),
  flashcard: z.string().optional().nullable(),
  resposta: z.string().optional().nullable(),
  alternativas: z.array(z.object({
    letra: z.string().max(4),
    texto: z.string()
  })).optional().nullable(),
  respostaMarcada: z.string().optional().nullable(),
  respostaCorreta: z.string().optional().nullable(),
  explicacao: z.string().optional().nullable(),
  statusRevisao: z.enum(["NAO_REVISADA", "ACERTEI_DEPOIS", "ERREI_NOVAMENTE"]).optional().nullable(),
  materia: z.string().optional().nullable(),
  imagem: z.string().optional().nullable(),
  dificuldade: z.string().optional().nullable(),
  data: z.coerce.date().optional()
});

export const flashcardSchema = z.object({
  pergunta: z.string().min(1),
  resposta: z.string().min(1),
  materia: z.string().optional().nullable(),
  deck: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
  imagem: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional(),
  intervalDays: z.coerce.number().int().min(0).optional(),
  repetitions: z.coerce.number().int().min(0).optional(),
  acertos: z.coerce.number().int().min(0).optional(),
  erros: z.coerce.number().int().min(0).optional(),
  lastDifficulty: z.string().optional().nullable()
});

export const timerSchema = z.object({
  tempo: z.coerce.number().int().min(1),
  materia: z.string().optional().nullable(),
  data: z.coerce.date().optional()
});

export const productivitySchema = z.object({
  horas: z.coerce.number().min(0.001),
  rendimento: z.coerce.number().int().min(0).max(100),
  observacoes: z.string().optional().nullable(),
  materia: z.string().optional().nullable(),
  data: z.coerce.date().optional()
});

export const lessonQuestionSchema = z.object({
  lessonId: z.string().min(1),
  done: z.boolean().default(false),
  feitas: z.coerce.number().int().min(0).default(0),
  acertos: z.coerce.number().int().min(0).default(0),
  erros: z.coerce.number().int().min(0).default(0),
  observacoes: z.string().optional().nullable()
});

export const dailyQuestionSchema = z.object({
  data: z.coerce.date(),
  materia: z.string().min(1),
  acertos: z.coerce.number().int().min(0).default(0),
  erros: z.coerce.number().int().min(0).default(0),
  observacoes: z.string().optional().nullable()
});

export const scheduleWeekSchema = z.object({
  semana: z.string().min(1),
  tarefas: z.unknown().default([]),
  revisoes: z.unknown().default([]),
  simulados: z.unknown().default([]),
  board: z.unknown().optional()
});

export const scheduleSettingsSchema = z.object({
  cronogramStartDate: z.coerce.date(),
  resetMode: z.enum(["SMART", "FULL"]).default("SMART")
});
