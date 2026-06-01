import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { performanceSchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await prisma.performance.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = performanceSchema.parse(await req.json());
    const questoes = body.questoes || body.acertos + body.erros;
    const erros = body.erros || Math.max(0, questoes - body.acertos);
    const percentual = questoes ? Math.round((body.acertos / questoes) * 1000) / 10 : 0;
    return ok(await prisma.performance.create({ data: { ...body, questoes, erros, percentual, userId } }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
