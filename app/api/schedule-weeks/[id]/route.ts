import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { scheduleWeekSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = scheduleWeekSchema.partial().parse(await req.json());
    return ok(await prisma.scheduleWeek.update({
      where: { id, userId },
      data: {
        ...body,
        tarefas: body.tarefas as Prisma.InputJsonValue | undefined,
        revisoes: body.revisoes as Prisma.InputJsonValue | undefined,
        simulados: body.simulados as Prisma.InputJsonValue | undefined,
        board: body.board as Prisma.InputJsonValue | undefined
      }
    }));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await prisma.scheduleWeek.delete({ where: { id, userId } });
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
