import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { rateLimit, sanitizeText } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { taskSchema } from "@/lib/validations";

function metadataHours(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return 0;
  const raw = (metadata as Record<string, unknown>).horas;
  const value = typeof raw === "number" ? raw : Number(raw || 0);
  return Number.isFinite(value) ? value : 0;
}

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
    const horas = metadataHours(body.metadata);
    if (body.tipo === "EXTRA" && horas > 0) {
      const marker = `extra-study:${externalId}:`;
      const existing = await prisma.productivity.findFirst({
        where: { userId, observacoes: { startsWith: marker } },
        select: { id: true }
      });
      const productivityData = {
        userId,
        materia: body.materia || null,
        horas,
        rendimento: 100,
        data: body.data || new Date(),
        observacoes: `${marker}${sanitizeText(body.titulo)}`
      };
      if (existing) {
        await prisma.productivity.update({ where: { id: existing.id }, data: productivityData });
      } else {
        await prisma.productivity.create({ data: productivityData });
      }
    }
    return ok(task, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = req.nextUrl;
    const source = searchParams.get("source");
    const sourceId = searchParams.get("sourceId");
    if (!source || !sourceId) return fail(new Error("source e sourceId sao obrigatorios"), 422);

    const tasks = await prisma.task.findMany({
      where: { userId, tipo: "REVISAO", externalId: { startsWith: `review-${source}-${sourceId}-` } },
      select: { id: true }
    });
    await prisma.task.deleteMany({ where: { userId, id: { in: tasks.map((task) => task.id) } } });
    return ok({ deleted: tasks.length });
  } catch (error) {
    return fail(error);
  }
}
