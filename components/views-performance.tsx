"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { areas, isSaturday, schedule } from "@/utils/schedule";

type Performance = { id: string; materia: string; acertos: number; erros: number; percentual: number; examName: string | null; data: string; createdAt: string };

const emptyAreas = () => Object.fromEntries(areas.map((area) => [area, { acertos: "", erros: "" }])) as Record<string, { acertos: string; erros: string }>;

export function PerformanceView() {
  const [items, setItems] = useState<Performance[]>([]);
  const [form, setForm] = useState({ examName: "", data: "", observacoes: "", areas: emptyAreas() });

  useEffect(() => {
    api<Performance[]>("/api/performance").then(setItems).catch(() => setItems([]));
  }, []);

  const summary = useMemo(() => {
    return areas.map((area) => {
      const areaItems = items.filter((item) => item.materia === area);
      const acertos = areaItems.reduce((acc, item) => acc + item.acertos, 0);
      const erros = areaItems.reduce((acc, item) => acc + item.erros, 0);
      const total = acertos + erros;
      return { area, acertos, erros, total, pct: total ? Math.round((acertos / total) * 100) : 0 };
    });
  }, [items]);

  const scheduled = useMemo(() => {
    return schedule.rows
      .filter((row) => isSaturday(row.data))
      .map((row) => ({
        id: row.data,
        title: `Simulado semanal · ${row.semana}`,
        subtitle: `${row.dataBR} · ${row.semana} · pendente`
      }));
  }, []);

  function updateArea(area: string, field: "acertos" | "erros", value: string) {
    setForm((current) => ({ ...current, areas: { ...current.areas, [area]: { ...current.areas[area], [field]: value } } }));
  }

  async function savePerformance(extra = false) {
    const examName = form.examName.trim() || (extra ? "Simulado extra" : "Simulado semanal");
    const entries = Object.entries(form.areas)
      .map(([materia, values]) => ({ materia, acertos: Number(values.acertos || 0), erros: Number(values.erros || 0) }))
      .filter((entry) => entry.acertos > 0 || entry.erros > 0);

    if (!entries.length) {
      toast.error("Preencha acertos ou erros em pelo menos uma grande área.");
      return;
    }

    const saved: Performance[] = [];
    for (const entry of entries) {
      const item = await api<Performance>("/api/performance", {
        method: "POST",
        body: JSON.stringify({ ...entry, examName, data: form.data || undefined })
      });
      saved.push(item);
    }
    setItems((current) => [...saved, ...current]);
    setForm({ examName: "", data: "", observacoes: "", areas: emptyAreas() });
    toast.success(extra ? "Simulado extra salvo" : "Desempenho salvo");
  }

  function fillScheduled(item: { title: string; id: string }) {
    setForm((current) => ({ ...current, examName: item.title, data: item.id }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-2">
        <article className="card p-5">
          <h2 className="text-lg font-black">Registrar simulado</h2>
          <div className="mt-4 grid gap-3">
            <input className="input" placeholder="Nome do simulado" value={form.examName} onChange={(event) => setForm((current) => ({ ...current, examName: event.target.value }))} />
            <input className="input" type="date" value={form.data} onChange={(event) => setForm((current) => ({ ...current, data: event.target.value }))} />
            <textarea className="input min-h-20" placeholder="Observações importantes do simulado" value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} />
            <div className="grid gap-3 md:grid-cols-2">
              {areas.map((area) => (
                <div key={area} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                  <strong className="text-sm">{area}</strong>
                  <input className="input mt-3" type="number" min="0" placeholder="Acertos" value={form.areas[area].acertos} onChange={(event) => updateArea(area, "acertos", event.target.value)} />
                  <input className="input mt-2" type="number" min="0" placeholder="Erros" value={form.areas[area].erros} onChange={(event) => updateArea(area, "erros", event.target.value)} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={() => savePerformance(false)}>Salvar desempenho</button>
              <button className="btn-secondary" onClick={() => savePerformance(true)}>Adicionar simulado extra</button>
              <button className="btn-secondary" onClick={() => setForm({ examName: "", data: "", observacoes: "", areas: emptyAreas() })}>Limpar edição</button>
            </div>
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Desempenho por área</h2>
          <div className="mt-4 grid gap-3">
            {summary.map((item) => (
              <div key={item.area} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <strong className="text-sm text-fuchsia-600">{item.area}</strong>
                <p className="text-sm">{item.pct}% de acertos acumulados</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-white/10">
                  <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Simulados programados</h2>
        <p className="mt-1 text-sm text-slate-500">Clique em cada simulado para preencher ou editar o desempenho quando fizer.</p>
        <div className="mt-4 grid gap-3">
          {scheduled.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-400/20 dark:bg-violet-500/10">
              <div>
                <strong>{item.title}</strong>
                <p className="text-sm text-slate-500 dark:text-slate-300">{item.subtitle}</p>
              </div>
              <button className="btn-secondary" onClick={() => fillScheduled(item)}>Preencher</button>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Histórico de simulados</h2>
        <div className="mt-4 grid gap-2">
          {items.slice(0, 12).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
              <span><strong>{item.examName || "Simulado"}</strong><span className="block text-slate-500">{item.materia} · {new Date(item.data).toLocaleDateString("pt-BR")}</span></span>
              <strong>{item.percentual}%</strong>
            </div>
          ))}
          {!items.length && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-white/10">Nenhum simulado registrado ainda.</div>}
        </div>
      </section>
    </div>
  );
}
