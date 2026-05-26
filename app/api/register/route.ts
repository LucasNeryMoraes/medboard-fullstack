import { hash } from "bcryptjs";
import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { rateLimit, sanitizeText } from "@/lib/security";
import { registerSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 8, 60_000);
  if (!limited.ok) return fail(new Error("Muitas tentativas. Tente novamente em instantes."), 429);

  try {
    const body = registerSchema.parse(await req.json());
    const senha = await hash(body.password, 12);
    const user = await prisma.user.create({
      data: { nome: sanitizeText(body.nome), email: body.email.toLowerCase(), senha },
      select: { id: true, nome: true, email: true, createdAt: true }
    });
    return ok(user, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
