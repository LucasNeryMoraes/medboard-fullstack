"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { changePasswordSchema } from "@/lib/validations";

type FormData = z.infer<typeof changePasswordSchema>;

export default function AlterarSenhaPage() {
  const router = useRouter();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormData>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(data: FormData) {
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(payload?.error || "Nao foi possivel alterar a senha");
      return;
    }
    reset();
    toast.success("Senha alterada. Entre novamente.");
    await signOut({ redirect: false });
    router.push("/login");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <section className="card w-full max-w-md p-6">
        <div className="mb-6">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 font-black text-white">CM</div>
          <h1 className="text-2xl font-black tracking-tight">Alterar senha</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Informe a senha atual e escolha uma nova senha.</p>
        </div>
        <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <input className="input" type="password" placeholder="Senha atual" {...register("currentPassword")} />
          <input className="input" type="password" placeholder="Nova senha" {...register("newPassword")} />
          <button className="btn-primary" disabled={isSubmitting}>Alterar senha</button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500"><Link className="font-bold text-brand-600" href="/">Voltar para o sistema</Link></p>
      </section>
    </main>
  );
}
