import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { scheduleSettingsSchema } from "@/lib/validations";
import { parseISODate, schedule } from "@/utils/schedule";

export async function GET() {
  try {
    const userId = await requireUserId();
    const settings = await prisma.scheduleSettings.upsert({
      where: { userId },
      create: { userId, cronogramStartDate: parseISODate(schedule.stats.inicio), resetMode: "SMART" },
      update: {}
    });
    return ok(settings);
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (!limited.ok) return fail(new Error("Rate limit excedido"), 429);

  try {
    const userId = await requireUserId();
    const body = scheduleSettingsSchema.parse(await req.json());

    if (body.resetMode === "FULL") return fail(new Error("Reset completo foi desativado para proteger o historico."), 422);
    const settings = await prisma.scheduleSettings.upsert({
      where: { userId },
      create: { userId, cronogramStartDate: body.cronogramStartDate, resetMode: "SMART" },
      update: { cronogramStartDate: body.cronogramStartDate, resetMode: "SMART" }
    });

    return ok(settings, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
