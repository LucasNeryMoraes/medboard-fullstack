"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Brain, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/services/api";
import { areas } from "@/utils/schedule";

const schema = z.object({
  tema: z.string().min(2),
  materia: z.string().min(1),
  erro: z.string().min(3),
  resposta: z.string().optional(),
  revisao: z.string().optional(),
  flashcard: z.string().optional()
});

type Note = z.infer<typeof schema> & { id: string; createdAt: string };

export function NotebookView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { materia: areas[0] } });

  useEffect(() => {
    api<Note[]>("/api/errors").then(setNotes).catch(() => setNotes([]));
  }, []);

  const filtered = notes.filter((note) => `${note.tema} ${note.materia} ${note.erro}`.toLowerCase().includes(query.toLowerCase()));

  async function onSubmit(data: z.infer<typeof schema>) {
    const saved = await api<Note>("/api/errors", { method: "POST", body: JSON.stringify(data) });
    setNotes((current) => [saved, ...current]);
    reset({ materia: data.materia, tema: "", erro: "", resposta: "", revisao: "", flashcard: "" });
    toast.success("Erro salvo no caderno");
  }

  async function remove(id: string) {
    await api(`/api/errors/${id}`, { method: "DELETE" });
    setNotes((current) => current.filter((note) => note.id !== id));
    toast.success("Item removido");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <article className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-black"><BookOpen size={20} /> Caderno de erros</h2>
        <form className="mt-4 grid gap-3" onSubmit={handleSubmit(onSubmit)}>
          <input className="input" placeholder="Tema" {...register("tema")} />
          <select className="input" {...register("materia")}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
          <textarea className="input min-h-24" placeholder="Qual foi o erro?" {...register("erro")} />
          <textarea className="input min-h-20" placeholder="Resposta correta / explicação" {...register("resposta")} />
          <textarea className="input min-h-20" placeholder="Plano de revisão" {...register("revisao")} />
          <input className="input" placeholder="Flashcard rápido" {...register("flashcard")} />
          <button className="btn-primary" disabled={isSubmitting}>Adicionar ao caderno</button>
        </form>
      </article>

      <article className="card p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black"><Brain size={20} /> Erros e flashcards</h2>
          <input className="input md:max-w-xs" placeholder="Buscar no caderno" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="grid gap-3">
          {filtered.map((note) => (
            <div key={note.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div><strong>{note.tema}</strong><p className="text-sm text-slate-500">{note.materia}</p></div>
                <button className="btn-secondary px-3" onClick={() => remove(note.id)}><Trash2 size={16} /></button>
              </div>
              <p className="mt-3 text-sm">{note.erro}</p>
              {note.flashcard && <div className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-700/20 dark:text-rose-100">{note.flashcard}</div>}
            </div>
          ))}
          {!filtered.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-white/10">Nenhum erro encontrado.</div>}
        </div>
      </article>
    </div>
  );
}
