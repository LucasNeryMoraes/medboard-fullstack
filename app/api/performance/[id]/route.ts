import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await prisma.performance.delete({ where: { id, userId } });
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
