"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/services/api";
import { areas } from "@/utils/schedule";

const schema = z.object({
  examName: z.string().min(2),
  materia: z.string().min(1),
  acertos: z.coerce.number().min(0),
  erros: z.coerce.number().min(0)
});

type FormData = z.infer<typeof schema>;
type Performance = FormData & { id: string; percentual: number; createdAt: string };

export function PerformanceView() {
  const [items, setItems] = useState<Performance[]>([]);
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { materia: areas[0], acertos: 0, erros: 0 } });

  useEffect(() => {
    api<Performance[]>("/api/performance").then(setItems).catch(() => setItems([]));
  }, []);

  const chart = useMemo(() => [...items].reverse().map((item, index) => ({ name: item.examName || `Sim ${index + 1}`, percentual: item.percentual })), [items]);
  const media = items.length ? Math.round(items.reduce((acc, item) => acc + item.percentual, 0) / items.length) : 0;

  async function onSubmit(data: FormData) {
    const saved = await api<Performance>("/api/performance", { method: "POST", body: JSON.stringify(data) });
    setItems((current) => [saved, ...current]);
    reset({ examName: "", materia: data.materia, acertos: 0, erros: 0 });
    toast.success("Simulado salvo");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <article className="card p-5">
        <h2 className="text-lg font-black">Registrar desempenho</h2>
        <form className="mt-4 grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <input className="input" placeholder="Nome do simulado" {...register("examName")} />
          <select className="input" {...register("materia")}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" placeholder="Acertos" {...register("acertos")} />
            <input className="input" type="number" placeholder="Erros" {...register("erros")} />
          </div>
          <button className="btn-primary" disabled={isSubmitting}>Salvar desempenho</button>
        </form>
      </article>

      <article className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">Evolução</h2>
          <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-700/20">Média {media}%</span>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Line dataKey="percentual" stroke="#b91c1c" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid gap-2">
          {items.slice(0, 6).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
              <span><strong>{item.examName}</strong><span className="block text-slate-500">{item.materia}</span></span>
              <strong>{item.percentual}%</strong>
            </div>
          ))}
          {!items.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-white/10">Nenhum simulado registrado ainda.</div>}
        </div>
      </article>
    </div>
  );
}
