import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { errorNotebookSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = errorNotebookSchema.partial().parse(await req.json());
    return ok(await prisma.errorNotebook.update({
      where: { id, userId },
      data: {
        ...body,
        tema: body.tema ? sanitizeText(body.tema) : undefined,
        erro: body.erro ? sanitizeText(body.erro) : undefined,
        revisao: body.revisao ? sanitizeText(body.revisao) : body.revisao,
        resposta: body.resposta ? sanitizeText(body.resposta) : body.resposta,
        flashcard: body.flashcard ? sanitizeText(body.flashcard) : body.flashcard,
        respostaMarcada: body.respostaMarcada ? sanitizeText(body.respostaMarcada) : body.respostaMarcada,
        respostaCorreta: body.respostaCorreta ? sanitizeText(body.respostaCorreta) : body.respostaCorreta,
        explicacao: body.explicacao ? sanitizeText(body.explicacao) : body.explicacao,
        alternativas: body.alternativas === undefined ? undefined : body.alternativas as Prisma.InputJsonValue
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
    await prisma.errorNotebook.delete({ where: { id, userId } });
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
