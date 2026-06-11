CREATE TABLE "ScheduleSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cronogramStartDate" TIMESTAMP(3) NOT NULL,
    "resetMode" TEXT NOT NULL DEFAULT 'SMART',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduleSettings_userId_key" ON "ScheduleSettings"("userId");

ALTER TABLE "ScheduleSettings" ADD CONSTRAINT "ScheduleSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
