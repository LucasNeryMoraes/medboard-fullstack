import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { lessonQuestionSchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await prisma.lessonQuestion.findMany({ where: { userId } }));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = lessonQuestionSchema.parse(await req.json());
    const item = await prisma.lessonQuestion.upsert({
      where: { userId_lessonId: { userId, lessonId: body.lessonId } },
      create: { ...body, userId },
      update: body
    });
    return ok(item, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
