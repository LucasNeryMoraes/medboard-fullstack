import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { lessonQuestionSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  try {
    const userId = await requireUserId();
    const { lessonId } = await params;
    const body = lessonQuestionSchema.partial().parse(await req.json());
    return ok(await prisma.lessonQuestion.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { lessonId, done: false, feitas: 0, acertos: 0, erros: 0, userId, ...body },
      update: body
    }));
  } catch (error) {
    return fail(error);
  }
}
