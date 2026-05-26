import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/security";
import { requireUserId } from "@/lib/session";
import { errorNotebookSchema } from "@/lib/validations";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await prisma.errorNotebook.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = errorNotebookSchema.parse(await req.json());
    const note = await prisma.errorNotebook.create({
      data: {
        ...body,
        userId,
        tema: sanitizeText(body.tema),
        erro: sanitizeText(body.erro)
      }
    });
    return ok(note, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
