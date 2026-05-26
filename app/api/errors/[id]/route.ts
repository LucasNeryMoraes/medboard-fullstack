import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { errorNotebookSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    return ok(await prisma.errorNotebook.update({ where: { id, userId }, data: errorNotebookSchema.partial().parse(await req.json()) }));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await prisma.errorNotebook.delete({ where: { id, userId } });
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
