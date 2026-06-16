import { compare, hash } from "bcryptjs";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { changePasswordSchema } from "@/lib/validations";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = changePasswordSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(new Error("Usuario nao encontrado"), 404);

    const valid = await compare(body.currentPassword, user.senha);
    if (!valid) return fail(new Error("Senha atual incorreta"), 400);
    if (body.currentPassword === body.newPassword) return fail(new Error("A nova senha deve ser diferente da atual"), 400);

    await prisma.user.update({
      where: { id: userId },
      data: { senha: await hash(body.newPassword, 12) }
    });

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
