"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { forgotPasswordSchema } from "@/lib/validations";

type FormData = z.infer<typeof forgotPasswordSchema>;

export default function EsqueciSenhaPage() {
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormData>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(data: FormData) {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(payload?.error || "Nao foi possivel solicitar a redefinicao");
      return;
    }
    setResetUrl(payload?.data?.resetUrl || null);
    toast.success("Solicitacao registrada");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <section className="card w-full max-w-md p-6">
        <div className="mb-6">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 font-black text-white">CM</div>
          <h1 className="text-2xl font-black tracking-tight">Esqueci minha senha</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Informe seu e-mail para gerar um link de redefinicao.</p>
        </div>
        <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <input className="input" type="email" placeholder="E-mail" {...register("email")} />
          <button className="btn-primary" disabled={isSubmitting}>Gerar link de redefinicao</button>
        </form>
        {resetUrl && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-400/20 dark:bg-emerald-500/10">
            <strong className="block">Link gerado</strong>
            <Link className="mt-2 inline-flex font-black text-brand-600" href={resetUrl}>Redefinir senha agora</Link>
            <p className="mt-2 text-xs text-slate-500">Este link expira em 30 minutos.</p>
          </div>
        )}
        <p className="mt-4 text-center text-sm text-slate-500"><Link className="font-bold text-brand-600" href="/login">Voltar para o login</Link></p>
      </section>
    </main>
  );
}
