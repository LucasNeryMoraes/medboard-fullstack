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
    const total = body.acertos + body.erros;
    const percentual = total ? Math.round((body.acertos / total) * 1000) / 10 : 0;
    return ok(await prisma.performance.create({ data: { ...body, percentual, userId } }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
