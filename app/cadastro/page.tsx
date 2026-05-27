"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { registerSchema } from "@/lib/validations";

type FormData = z.infer<typeof registerSchema>;

export default function CadastroPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormData>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: FormData) {
    const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!response.ok) {
      toast.error("Não foi possível criar a conta");
      return;
    }
    await signIn("credentials", { email: data.email, password: data.password, redirect: false });
    router.push("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <section className="card w-full max-w-md p-6">
        <div className="mb-6">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 font-black text-white">CL</div>
          <h1 className="text-2xl font-black tracking-tight">Criar conta</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Seu estudo sincronizado com PostgreSQL e APIs protegidas.</p>
        </div>
        <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <input className="input" placeholder="Nome" {...register("nome")} />
          <input className="input" type="email" placeholder="E-mail" {...register("email")} />
          <input className="input" type="password" placeholder="Senha com 8+ caracteres" {...register("password")} />
          <button className="btn-primary" disabled={isSubmitting}>Cadastrar</button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">Já tem conta? <Link className="font-bold text-brand-600" href="/login">Entrar</Link></p>
      </section>
    </main>
  );
}
