import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = resetPasswordSchema.parse(await req.json());
    const tokenHash = hashToken(body.token);
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return fail(new Error("Link de redefinicao invalido ou expirado"), 400);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { senha: await hash(body.password, 12) }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() }
      })
    ]);

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
