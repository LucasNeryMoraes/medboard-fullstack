import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

const authMiddleware = withAuth({});

export default function middleware(...args: Parameters<typeof authMiddleware>) {
  if (!process.env.DATABASE_URL) return NextResponse.next();
  return authMiddleware(...args);
}

export const config = {
  matcher: ["/((?!api/auth|api/register|login|cadastro|_next|favicon.ico).*)"]
};
