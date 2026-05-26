import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { rateLimit, sanitizeText } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { taskSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = req.nextUrl;
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        ...(searchParams.get("status") ? { status: searchParams.get("status") as never } : {}),
        ...(searchParams.get("tipo") ? { tipo: searchParams.get("tipo") as never } : {})
      },
      orderBy: [{ data: "asc" }, { createdAt: "desc" }]
    });
    return ok(tasks);
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (!limited.ok) return fail(new Error("Rate limit excedido"), 429);
  try {
    const userId = await requireUserId();
    const body = taskSchema.parse(await req.json());
    const externalId = body.externalId || crypto.randomUUID();
    const data = {
      ...body,
      externalId,
      userId,
      titulo: sanitizeText(body.titulo),
      descricao: body.descricao ? sanitizeText(body.descricao) : null,
      metadata: (body.metadata ?? undefined) as Prisma.InputJsonValue | undefined
    };
    const task = await prisma.task.upsert({
      where: { userId_externalId: { userId, externalId } },
      create: data,
      update: data
    });
    return ok(task, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
