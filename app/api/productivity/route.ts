import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { productivitySchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await prisma.productivity.findMany({ where: { userId }, orderBy: { data: "desc" } }));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = productivitySchema.parse(await req.json());
    const extraStudyId = body.observacoes?.match(/^extra-study:([^:]+):/)?.[1];
    if (extraStudyId) {
      const marker = `extra-study:${extraStudyId}:`;
      const existing = await prisma.productivity.findFirst({
        where: { userId, observacoes: { startsWith: marker } },
        select: { id: true }
      });
      if (existing) {
        return ok(await prisma.productivity.update({ where: { id: existing.id }, data: body }));
      }
    }
    return ok(await prisma.productivity.create({ data: { ...body, userId } }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
