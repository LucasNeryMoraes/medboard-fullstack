ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'RESCHEDULED';

CREATE TABLE "ScheduleSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REORGANIZE',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleSnapshot_userId_createdAt_idx" ON "ScheduleSnapshot"("userId", "createdAt");

ALTER TABLE "ScheduleSnapshot" ADD CONSTRAINT "ScheduleSnapshot_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
