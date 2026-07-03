"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, areas, isSaturday, schedule } from "@/utils/schedule";

type Performance = { id: string; materia: string; questoes?: number; acertos: number; erros: number; percentual: number; examName: string | null; instituicao?: string | null; observacoes?: string | null; data: string; createdAt: string };
type LessonQuestionRecord = { lessonId: string; done: boolean; feitas: number; acertos: number; erros: number; observacoes: string | null };
type TaskRecord = { id: string; externalId: string | null; titulo: string; descricao: string | null; status: "PENDING" | "OVERDUE" | "DONE" | "RESCHEDULED" | "ARCHIVED"; data: string; tipo: "AULA" | "REVISAO" | "SIMULADO" | "LIVRE" | "EXTRA"; materia: string | null; metadata?: unknown };

const emptyAreas = () => Object.fromEntries(areas.map((area) => [area, { questoes: "", acertos: "", erros: "" }])) as Record<string, { questoes: string; acertos: string; erros: string }>;

function areaTotal(item: Pick<Performance, "questoes" | "acertos" | "erros">) {
  return Number(item.questoes || 0) || Number(item.acertos || 0) + Number(item.erros || 0);
}

function monthKey(value: string | Date) {
  return new Date(value).toLocaleDateString("sv-SE").slice(0, 7);
}

export function PerformanceView() {
  const storeQuestions = useMedboardStore((state) => state.lessonQuestions);
  const [items, setItems] = useState<Performance[]>([]);
  const [lessonQuestionRecords, setLessonQuestionRecords] = useState<LessonQuestionRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [form, setForm] = useState({ examName: "", instituicao: "", data: "", observacoes: "", areas: emptyAreas() });

  useEffect(() => {
    Promise.all([
      api<Performance[]>("/api/performance"),
      api<LessonQuestionRecord[]>("/api/lesson-questions"),
      api<TaskRecord[]>("/api/tasks")
    ])
      .then(([performanceItems, questionItems, taskItems]) => {
        setItems(performanceItems);
        setLessonQuestionRecords(questionItems);
        setTasks(taskItems);
      })
      .catch(() => {
        setItems([]);
        setLessonQuestionRecords([]);
        setTasks([]);
      });
  }, []);

  const questionByLesson = useMemo(() => {
    const remote = Object.fromEntries(lessonQuestionRecords.map((item) => [item.lessonId, {
      done: item.done,
      feitas: item.feitas,
      acertos: item.acertos,
      erros: item.erros,
      observacoes: item.observacoes || ""
    }]));
    return { ...remote, ...storeQuestions };
  }, [lessonQuestionRecords, storeQuestions]);

  const summary = useMemo(() => {
    const lessons = allLessons();
    const extraTasks = tasks.filter((task) => task.tipo === "EXTRA");
    return areas.map((area) => {
      const areaItems = items.filter((item) => item.materia === area);
      const questionItems = lessons.filter((lesson) => lesson.disciplina === area).map((lesson) => questionByLesson[lesson.id]).filter(Boolean);
      const extraQuestionItems = extraTasks.filter((task) => task.materia === area).map((task) => questionByLesson[task.externalId || task.id]).filter(Boolean);
      const simQuestions = areaItems.reduce((acc, item) => acc + areaTotal(item), 0);
      const acertos = areaItems.reduce((acc, item) => acc + item.acertos, 0)
        + questionItems.reduce((acc, item) => acc + Number(item.acertos || 0), 0)
        + extraQuestionItems.reduce((acc, item) => acc + Number(item.acertos || 0), 0);
      const erros = areaItems.reduce((acc, item) => acc + item.erros, 0)
        + questionItems.reduce((acc, item) => acc + Number(item.erros || 0), 0)
        + extraQuestionItems.reduce((acc, item) => acc + Number(item.erros || 0), 0);
      const lessonQuestions = [...questionItems, ...extraQuestionItems].reduce((acc, item) => acc + Math.max(Number(item.feitas || 0), Number(item.acertos || 0) + Number(item.erros || 0)), 0);
      const total = Math.max(simQuestions + lessonQuestions, acertos + erros);
      return { area, acertos, erros, total, pct: total ? Math.round((acertos / total) * 100) : 0, errorPct: total ? Math.round((erros / total) * 100) : 0 };
    });
  }, [items, questionByLesson, tasks]);

  const ranking = [...summary].filter((item) => item.total > 0).sort((a, b) => b.pct - a.pct);
  const bestArea = ranking[0];
  const worstArea = [...ranking].sort((a, b) => a.pct - b.pct)[0];
  const evolution = useMemo(() => {
    const months = [...new Set(items.map((item) => monthKey(item.data)))].sort().slice(-8);
    return months.map((month) => {
      const row: Record<string, string | number> = { month };
      areas.forEach((area) => {
        const areaItems = items.filter((item) => item.materia === area && monthKey(item.data) === month);
        const questoes = areaItems.reduce((acc, item) => acc + areaTotal(item), 0);
        const acertos = areaItems.reduce((acc, item) => acc + item.acertos, 0);
        row[area] = questoes ? Math.round((acertos / questoes) * 100) : 0;
      });
      return row;
    });
  }, [items]);

  const scheduled = useMemo(() => schedule.rows.filter((row) => isSaturday(row.data)).map((row) => ({
    id: row.data,
    title: `Simulado semanal · ${row.semana}`,
    subtitle: `${row.dataBR} · ${row.semana} · pendente`
  })), []);

  function updateArea(area: string, field: "questoes" | "acertos" | "erros", value: string) {
    setForm((current) => ({ ...current, areas: { ...current.areas, [area]: { ...current.areas[area], [field]: value } } }));
  }

  async function savePerformance(extra = false) {
    const examName = form.examName.trim() || (extra ? "Simulado extra" : "Simulado semanal");
    const entries = Object.entries(form.areas)
      .map(([materia, values]) => {
        const acertos = Number(values.acertos || 0);
        const erros = Number(values.erros || 0);
        const questoes = Number(values.questoes || 0) || acertos + erros;
        return { materia, questoes, acertos, erros: erros || Math.max(0, questoes - acertos) };
      })
      .filter((entry) => entry.questoes > 0 || entry.acertos > 0 || entry.erros > 0);

    if (!entries.length) {
      toast.error("Preencha questões, acertos ou erros em pelo menos uma grande área.");
      return;
    }

    const saved: Performance[] = [];
    for (const entry of entries) {
      const item = await api<Performance>("/api/performance", {
        method: "POST",
        body: JSON.stringify({ ...entry, examName, instituicao: form.instituicao || undefined, observacoes: form.observacoes || undefined, data: form.data || undefined })
      });
      saved.push(item);
    }
    setItems((current) => [...saved, ...current]);
    setForm({ examName: "", instituicao: "", data: "", observacoes: "", areas: emptyAreas() });
    toast.success(extra ? "Simulado extra salvo" : "Desempenho salvo");
  }

  function fillScheduled(item: { title: string; id: string }) {
    setForm((current) => ({ ...current, examName: item.title, data: item.id }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[1fr_.9fr]">
        <article className="card p-5">
          <h2 className="text-lg font-black">Registrar simulado</h2>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <input className="input" placeholder="Nome do simulado" value={form.examName} onChange={(event) => setForm((current) => ({ ...current, examName: event.target.value }))} />
              <input className="input" placeholder="Instituição" value={form.instituicao} onChange={(event) => setForm((current) => ({ ...current, instituicao: event.target.value }))} />
              <input className="input" type="date" value={form.data} onChange={(event) => setForm((current) => ({ ...current, data: event.target.value }))} />
            </div>
            <textarea className="input min-h-16" placeholder="Observações importantes do simulado" value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} />
            <div className="grid gap-3 md:grid-cols-2">
              {areas.map((area) => {
                const values = form.areas[area];
                const questoes = Number(values.questoes || 0) || Number(values.acertos || 0) + Number(values.erros || 0);
                const acertos = Number(values.acertos || 0);
                const erros = Number(values.erros || 0);
                return (
                  <div key={area} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm">{area}</strong>
                      <span className="text-xs font-bold text-slate-400">{questoes ? Math.round((acertos / questoes) * 100) : 0}% acerto · {questoes ? Math.round((erros / questoes) * 100) : 0}% erro</span>
                    </div>
                    <input className="input mt-3" type="number" min="0" placeholder="Questões feitas" value={values.questoes} onChange={(event) => updateArea(area, "questoes", event.target.value)} />
                    <input className="input mt-2" type="number" min="0" placeholder="Acertos" value={values.acertos} onChange={(event) => updateArea(area, "acertos", event.target.value)} />
                    <input className="input mt-2" type="number" min="0" placeholder="Erros" value={values.erros} onChange={(event) => updateArea(area, "erros", event.target.value)} />
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={() => savePerformance(false)}>Salvar desempenho</button>
              <button className="btn-secondary" onClick={() => savePerformance(true)}>Adicionar simulado extra</button>
              <button className="btn-secondary" onClick={() => setForm({ examName: "", instituicao: "", data: "", observacoes: "", areas: emptyAreas() })}>Limpar edição</button>
            </div>
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Análise automática</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric title="Melhor área atual" value={bestArea ? bestArea.area : "Sem dados"} detail={bestArea ? `${bestArea.pct}% de aproveitamento` : ""} />
            <Metric title="Precisa de atenção" value={worstArea ? worstArea.area : "Sem dados"} detail={worstArea ? `${worstArea.pct}% de aproveitamento` : ""} />
          </div>
          <h3 className="mt-5 text-sm font-black">Ranking das grandes áreas</h3>
          <div className="mt-3 grid gap-2">
            {ranking.map((item, index) => <Row key={item.area} left={`${index + 1}º ${item.area}`} right={`${item.pct}% · ${item.acertos}/${item.total}`} />)}
            {!ranking.length && <Empty text="O ranking será criado automaticamente após os simulados." />}
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Desempenho por grande área</h2>
        <div className="mt-4 grid gap-3">
          {summary.map((item) => (
            <div key={item.area} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong className="text-sm text-fuchsia-600">{item.area}</strong>
                <span className="text-xs font-bold text-slate-500">{item.acertos} acertos · {item.erros} erros · {item.total} questões</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-white/10">
                <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${item.pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{item.pct}% acerto · {item.errorPct}% erro</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Evolução por área</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolution}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              {areas.map((area, index) => <Line key={area} type="monotone" dataKey={area} stroke={["#b91c1c", "#7c3aed", "#0f766e", "#d946ef", "#f59e0b"][index]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
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
              <span><strong>{item.examName || "Simulado"}</strong><span className="block text-slate-500">{item.materia} · {areaTotal(item)} questões · {new Date(item.data).toLocaleDateString("pt-BR")}</span></span>
              <strong>{item.percentual}%</strong>
            </div>
          ))}
          {!items.length && <Empty text="Nenhum simulado registrado ainda." />}
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-slate-50 p-3 dark:border-violet-400/20 dark:bg-slate-900">
      <span className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</span>
      <strong className="block text-xl font-black">{value}</strong>
      {detail && <small className="text-slate-500">{detail}</small>}
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900"><strong>{left}</strong><span className="text-slate-500">{right}</span></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-white/10">{text}</div>;
}
