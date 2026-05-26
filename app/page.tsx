import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MedboardApp } from "@/components/medboard-app";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <MedboardApp userName={session.user.name || "Estudante"} />;
}
