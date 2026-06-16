"use client";

import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { resetPasswordSchema } from "@/lib/validations";

type FormData = z.infer<typeof resetPasswordSchema>;

export default function ResetarSenhaPage() {
  return (
    <Suspense fallback={<ResetShell />}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "" }
  });

  async function onSubmit(data: FormData) {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(payload?.error || "Nao foi possivel redefinir a senha");
      return;
    }
    toast.success("Senha redefinida. Entre novamente.");
    router.push("/login");
  }

  return (
    <ResetShell>
      <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
        <input type="hidden" {...register("token")} />
        <input className="input" type="password" placeholder="Nova senha" {...register("password")} />
        <button className="btn-primary" disabled={isSubmitting || !token}>Salvar nova senha</button>
      </form>
      {!token && <p className="mt-3 text-sm text-red-600">Link sem token de redefinicao.</p>}
    </ResetShell>
  );
}

function ResetShell({ children }: { children?: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <section className="card w-full max-w-md p-6">
        <div className="mb-6">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 font-black text-white">CM</div>
          <h1 className="text-2xl font-black tracking-tight">Redefinir senha</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Crie uma nova senha com pelo menos 8 caracteres.</p>
        </div>
        {children}
        <p className="mt-4 text-center text-sm text-slate-500"><Link className="font-bold text-brand-600" href="/login">Voltar para o login</Link></p>
      </section>
    </main>
  );
}
