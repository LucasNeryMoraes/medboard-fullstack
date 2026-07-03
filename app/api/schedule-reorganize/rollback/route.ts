import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security";
import { requireUserId } from "@/lib/session";

type SnapshotData = {
  tasks: Array<{ externalId: string; existed: boolean; previous?: { status: "PENDING" | "OVERDUE" | "DONE" | "RESCHEDULED" | "ARCHIVED"; data: string; titulo: string; descricao: string | null; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; prioridade: "LOW" | "MEDIUM" | "HIGH"; materia: string | null; metadata: Prisma.JsonValue } }>;
  flashcards: Array<{ id: string; dueDate: string }>;
};

export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (!limited.ok) return fail(new Error("Rate limit excedido"), 429);
  try {
    const userId = await requireUserId();
    const requested = (await req.json().catch(() => ({}))) as { snapshotId?: string };
    const snapshot = requested.snapshotId
      ? await prisma.scheduleSnapshot.findFirst({ where: { id: requested.snapshotId, userId, kind: "REORGANIZE" } })
      : await prisma.scheduleSnapshot.findFirst({ where: { userId, kind: "REORGANIZE" }, orderBy: { createdAt: "desc" } });
    if (!snapshot) return fail(new Error("Nenhum ponto de restauracao encontrado."), 404);
    const data = snapshot.data as unknown as SnapshotData;

    await prisma.$transaction(async (tx) => {
      for (const item of data.tasks || []) {
        const current = await tx.task.findUnique({ where: { userId_externalId: { userId, externalId: item.externalId } } });
        if (current?.status === "DONE" || current?.status === "ARCHIVED") continue;
        if (!item.existed) {
          await tx.task.deleteMany({ where: { userId, externalId: item.externalId, status: { in: ["PENDING", "OVERDUE", "RESCHEDULED"] } } });
        } else if (item.previous) {
          await tx.task.updateMany({
            where: { userId, externalId: item.externalId, status: { in: ["PENDING", "OVERDUE", "RESCHEDULED"] } },
            data: { status: item.previous.status, data: new Date(item.previous.data), titulo: item.previous.titulo, descricao: item.previous.descricao, tipo: item.previous.tipo, prioridade: item.previous.prioridade, materia: item.previous.materia, metadata: item.previous.metadata as Prisma.InputJsonValue }
          });
        }
      }
      for (const card of data.flashcards || []) {
        await tx.flashcard.updateMany({ where: { id: card.id, userId }, data: { dueDate: new Date(card.dueDate) } });
      }
      await tx.scheduleSnapshot.delete({ where: { id: snapshot.id } });
    });

    return ok({ restored: true, snapshotId: snapshot.id });
  } catch (error) {
    return fail(error);
  }
}
