export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/((?!api/auth|api/register|login|cadastro|_next|favicon.ico).*)"]
};
