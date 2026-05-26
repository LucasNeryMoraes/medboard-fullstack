import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { taskSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = taskSchema.partial().parse(await req.json());
    const task = await prisma.task.update({ where: { id, userId }, data: { ...body, metadata: body.metadata as Prisma.InputJsonValue | undefined } });
    return ok(task);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await prisma.task.delete({ where: { id, userId } });
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
