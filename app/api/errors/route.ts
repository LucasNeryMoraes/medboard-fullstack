import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { errorNotebookSchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await prisma.errorNotebook.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = errorNotebookSchema.parse(await req.json());
    const note = await prisma.errorNotebook.create({
      data: {
        ...body,
        userId,
        tema: sanitizeText(body.tema),
        erro: sanitizeText(body.erro),
        revisao: body.revisao ? sanitizeText(body.revisao) : null,
        resposta: body.resposta ? sanitizeText(body.resposta) : null,
        flashcard: body.flashcard ? sanitizeText(body.flashcard) : null,
        respostaMarcada: body.respostaMarcada ? sanitizeText(body.respostaMarcada) : null,
        respostaCorreta: body.respostaCorreta ? sanitizeText(body.respostaCorreta) : null,
        explicacao: body.explicacao ? sanitizeText(body.explicacao) : null,
        alternativas: (body.alternativas ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });
    return ok(note, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
