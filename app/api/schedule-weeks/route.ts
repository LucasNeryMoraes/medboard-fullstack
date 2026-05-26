import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { scheduleWeekSchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await prisma.scheduleWeek.findMany({ where: { userId }, orderBy: { semana: "asc" } }));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = scheduleWeekSchema.parse(await req.json());
    const data = {
      ...body,
      tarefas: body.tarefas as Prisma.InputJsonValue,
      revisoes: body.revisoes as Prisma.InputJsonValue,
      simulados: body.simulados as Prisma.InputJsonValue,
      board: body.board as Prisma.InputJsonValue | undefined
    };
    const week = await prisma.scheduleWeek.upsert({
      where: { userId_semana: { userId, semana: body.semana } },
      create: { ...data, userId },
      update: data
    });
    return ok(week, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
