"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { loginSchema } from "@/lib/validations";

type FormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormData>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: FormData) {
    const result = await signIn("credentials", { ...data, redirect: false });
    if (result?.error) {
      toast.error("E-mail ou senha inválidos");
      return;
    }
    router.push("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <section className="card w-full max-w-md p-6">
        <div className="mb-6">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 font-black text-white">CL</div>
          <h1 className="text-2xl font-black tracking-tight">Entrar no Cronograma Lalazinha</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acesse seu cronograma, simulados e caderno de erros.</p>
        </div>
        <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <input className="input" type="email" placeholder="E-mail" {...register("email")} />
          <input className="input" type="password" placeholder="Senha" {...register("password")} />
          <button className="btn-primary" disabled={isSubmitting}>Entrar</button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">Ainda não tem conta? <Link className="font-bold text-brand-600" href="/cadastro">Criar cadastro</Link></p>
      </section>
    </main>
  );
}
