-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('AULA', 'REVISAO', 'SIMULADO', 'LIVRE', 'EXTRA');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleWeek" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "semana" TEXT NOT NULL,
    "tarefas" JSONB NOT NULL,
    "revisoes" JSONB NOT NULL,
    "simulados" JSONB NOT NULL,
    "board" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TaskType" NOT NULL,
    "prioridade" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "materia" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Performance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "materia" TEXT NOT NULL,
    "acertos" INTEGER NOT NULL,
    "erros" INTEGER NOT NULL,
    "percentual" DOUBLE PRECISION NOT NULL,
    "examName" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorNotebook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tema" TEXT NOT NULL,
    "erro" TEXT NOT NULL,
    "revisao" TEXT,
    "flashcard" TEXT,
    "resposta" TEXT,
    "materia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorNotebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "materia" TEXT,
    "deck" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lastDifficulty" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyTimer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tempo" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Productivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL,
    "rendimento" INTEGER NOT NULL,
    "observacoes" TEXT,
    "materia" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Productivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "feitas" INTEGER NOT NULL DEFAULT 0,
    "acertos" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ScheduleWeek_userId_idx" ON "ScheduleWeek"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleWeek_userId_semana_key" ON "ScheduleWeek"("userId", "semana");

-- CreateIndex
CREATE INDEX "Task_userId_data_idx" ON "Task"("userId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Task_userId_externalId_key" ON "Task"("userId", "externalId");

-- CreateIndex
CREATE INDEX "Performance_userId_materia_idx" ON "Performance"("userId", "materia");

-- CreateIndex
CREATE INDEX "ErrorNotebook_userId_tema_idx" ON "ErrorNotebook"("userId", "tema");

-- CreateIndex
CREATE INDEX "Flashcard_userId_dueDate_idx" ON "Flashcard"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "StudyTimer_userId_data_idx" ON "StudyTimer"("userId", "data");

-- CreateIndex
CREATE INDEX "Productivity_userId_data_idx" ON "Productivity"("userId", "data");

-- CreateIndex
CREATE INDEX "LessonQuestion_userId_idx" ON "LessonQuestion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonQuestion_userId_lessonId_key" ON "LessonQuestion"("userId", "lessonId");

-- AddForeignKey
ALTER TABLE "ScheduleWeek" ADD CONSTRAINT "ScheduleWeek_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Performance" ADD CONSTRAINT "Performance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorNotebook" ADD CONSTRAINT "ErrorNotebook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTimer" ADD CONSTRAINT "StudyTimer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Productivity" ADD CONSTRAINT "Productivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonQuestion" ADD CONSTRAINT "LessonQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

