import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { timerSchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await prisma.studyTimer.findMany({ where: { userId }, orderBy: { data: "desc" }, take: 50 }));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = timerSchema.parse(await req.json());
    return ok(await prisma.studyTimer.create({ data: { ...body, userId } }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
