import { createHash, randomBytes } from "node:crypto";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = forgotPasswordSchema.parse(await req.json());
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return ok({ success: true, resetUrl: null });

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt
      }
    });

    const origin = req.headers.get("origin") || process.env.NEXTAUTH_URL || "";
    return ok({ success: true, resetUrl: `${origin}/resetar-senha?token=${token}` });
  } catch (error) {
    return fail(error);
  }
}
