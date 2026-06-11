import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { scheduleSettingsSchema } from "@/lib/validations";
import { parseISODate, schedule } from "@/utils/schedule";

export async function GET() {
  try {
    const userId = await requireUserId();
    const settings = await prisma.scheduleSettings.upsert({
      where: { userId },
      create: { userId, cronogramStartDate: parseISODate(schedule.stats.inicio), resetMode: "SMART" },
      update: {}
    });
    return ok(settings);
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (!limited.ok) return fail(new Error("Rate limit excedido"), 429);

  try {
    const userId = await requireUserId();
    const body = scheduleSettingsSchema.parse(await req.json());

    const settings = await prisma.$transaction(async (tx) => {
      if (body.resetMode === "FULL") {
        await tx.task.deleteMany({
          where: {
            userId,
            OR: [
              { tipo: { in: ["AULA", "REVISAO", "SIMULADO", "LIVRE"] } },
              { externalId: { startsWith: "aula-" } },
              { externalId: { startsWith: "review-" } },
              { externalId: { startsWith: "simulado-sabado-" } }
            ]
          }
        });
        await tx.lessonQuestion.deleteMany({ where: { userId, lessonId: { startsWith: "aula-" } } });
      }

      await tx.flashcard.updateMany({
        where: { userId, dueDate: { gt: new Date() } },
        data: { dueDate: body.cronogramStartDate }
      });

      return tx.scheduleSettings.upsert({
        where: { userId },
        create: {
          userId,
          cronogramStartDate: body.cronogramStartDate,
          resetMode: body.resetMode
        },
        update: {
          cronogramStartDate: body.cronogramStartDate,
          resetMode: body.resetMode
        }
      });
    });

    return ok(settings, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
