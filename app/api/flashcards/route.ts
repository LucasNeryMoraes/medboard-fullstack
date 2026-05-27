import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { flashcardSchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await prisma.flashcard.findMany({ where: { userId }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] }));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = flashcardSchema.parse(await req.json());
    const flashcard = await prisma.flashcard.create({
      data: {
        ...body,
        userId,
        pergunta: sanitizeText(body.pergunta),
        resposta: sanitizeText(body.resposta),
        tag: body.tag ? sanitizeText(body.tag) : body.tag
      }
    });
    return ok(flashcard, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
