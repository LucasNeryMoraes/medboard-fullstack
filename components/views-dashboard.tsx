"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarCheck2, Clock3, Target } from "lucide-react";
import { toast } from "sonner";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, allProgressIds, areas, parseISODate, schedule, todayISO } from "@/utils/schedule";

type DailyQuestion = { id: string; data: string; materia: string; acertos: number; erros: number; observacoes: string | null };
type Productivity = { id: string; data: string; materia: string | null; horas: number; observacoes: string | null };
type ErrorNote = { id: string; tema: string; materia: string | null };

const compactDate = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");

export function DashboardView() {
  const doneIds = useMedboardStore((state) => state.doneIds);
  const setTab = useMedboardStore((state) => state.setTab);
  const ids = useMemo(() => allProgressIds(), []);
  const lessons = useMemo(() => allLessons(), []);
  const [daily, setDaily] = useState<DailyQuestion[]>([]);
  const [productivity, setProductivity] = useState<Productivity[]>([]);
  const [errors, setErrors] = useState<ErrorNote[]>([]);
  const [dailyForm, setDailyForm] = useState({ data: todayISO(), materia: areas[0], acertos: "0", erros: "0", observacoes: "" });
  const [hoursForm, setHoursForm] = useState({ data: todayISO(), materia: areas[0], horas: "", observacoes: "" });

  useEffect(() => {
    Promise.all([api<DailyQuestion[]>("/api/daily-questions"), api<Productivity[]>("/api/productivity"), api<ErrorNote[]>("/api/errors")])
      .then(([dailyItems, productivityItems, errorItems]) => {
        setDaily(dailyItems);
        setProductivity(productivityItems);
        setErrors(errorItems);
      })
      .catch(() => {
        setDaily([]);
        setProductivity([]);
        setErrors([]);
      });
  }, []);

  const overdue = lessons.filter((lesson) => parseISODate(lesson.data) < parseISODate(todayISO()) && !doneIds.includes(lesson.id));
  const progress = ids.length ? Math.round((doneIds.length / ids.length) * 100) : 0;
  const areaData = areas.map((area) => {
    const total = lessons.filter((lesson) => lesson.disciplina === area).length;
    const done = lessons.filter((lesson) => lesson.disciplina === area && doneIds.includes(lesson.id)).length;
    return { area: area.replace("Ginecologia e Obstetrícia", "GO").replace("Clínica Médica", "Clínica"), progresso: total ? Math.round((done / total) * 100) : 0 };
  });

  const dailyTotals = useMemo(() => {
    const today = todayISO();
    const totalAcertos = daily.reduce((acc, item) => acc + item.acertos, 0);
    const totalErros = daily.reduce((acc, item) => acc + item.erros, 0);
    const todayItems = daily.filter((item) => compactDate(item.data) === today);
    const todayAcertos = todayItems.reduce((acc, item) => acc + item.acertos, 0);
    const todayErros = todayItems.reduce((acc, item) => acc + item.erros, 0);
    return { totalAcertos, totalErros, total: totalAcertos + totalErros, todayAcertos, todayErros, today: todayAcertos + todayErros };
  }, [daily]);

  const dailyByArea = areas.map((area) => {
    const items = daily.filter((item) => item.materia === area);
    const acertos = items.reduce((acc, item) => acc + item.acertos, 0);
    const erros = items.reduce((acc, item) => acc + item.erros, 0);
    return { area, acertos, erros, total: acertos + erros };
  }).filter((item) => item.total > 0);

  const wrongRanking = Object.entries(errors.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.tema}${item.materia ? ` · ${item.materia}` : ""}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const hoursTotal = productivity.reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const activeDays = new Set(productivity.map((item) => compactDate(item.data))).size;
  const hoursByArea = areas.map((area) => ({
    area,
    horas: productivity.filter((item) => item.materia === area).reduce((acc, item) => acc + Number(item.horas || 0), 0)
  })).filter((item) => item.horas > 0);

  const cards = [
    { label: "Progresso total", value: `${progress}%`, icon: Target, detail: `${doneIds.length} de ${ids.length} itens` },
    { label: "Aulas atrasadas", value: overdue.length, icon: AlertTriangle, detail: "pendentes ate hoje" },
    { label: "Dias do cronograma", value: schedule.stats.totalDias, icon: CalendarCheck2, detail: `${schedule.stats.inicio} ate ${schedule.stats.fim}` },
    { label: "Revisoes planejadas", value: schedule.stats.totalRevisoes, icon: Clock3, detail: "15 e 30 dias" }
  ];

  async function addDaily() {
    const payload = { ...dailyForm, acertos: Number(dailyForm.acertos || 0), erros: Number(dailyForm.erros || 0) };
    const saved = await api<DailyQuestion>("/api/daily-questions", { method: "POST", body: JSON.stringify(payload) });
    setDaily((current) => [saved, ...current]);
    setDailyForm((current) => ({ ...current, acertos: "0", erros: "0", observacoes: "" }));
    toast.success("Questões registradas");
  }

  async function addHours() {
    if (!hoursForm.horas) {
      toast.error("Informe as horas estudadas.");
      return;
    }
    const saved = await api<Productivity>("/api/productivity", {
      method: "POST",
      body: JSON.stringify({ ...hoursForm, horas: Number(hoursForm.horas), rendimento: 100 })
    });
    setProductivity((current) => [saved, ...current]);
    setHoursForm((current) => ({ ...current, horas: "", observacoes: "" }));
    toast.success("Horas registradas");
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article className="card p-5" key={card.label}>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">{card.label}</span>
              <card.icon className="text-brand-600" size={20} />
            </div>
            <strong className="text-3xl font-black tracking-tight">{card.value}</strong>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <article className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black">Desempenho por área</h2>
            <button className="btn-secondary" onClick={() => setTab("simulados")}>Registrar simulado</button>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areaData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="area" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="progresso" fill="#b91c1c" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Prioridades automáticas</h2>
          <div className="mt-4 grid gap-3">
            {overdue.slice(0, 6).map((lesson) => (
              <div key={lesson.id} className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm dark:border-rose-500/20 dark:bg-rose-500/10">
                <strong>{lesson.disciplina}</strong>
                <p className="text-slate-600 dark:text-slate-300">{lesson.aula}</p>
              </div>
            ))}
            {!overdue.length && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-white/10">Nenhuma aula atrasada pendente.</div>}
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Controle diário de questões por grande área</h2>
        <p className="mt-1 text-sm text-slate-500">Registre as questões feitas no dia a dia, separando acertos e erros por área estudada. Isso fica independente dos simulados.</p>
        <div className="mt-4 rounded-2xl border border-violet-100 bg-slate-50 p-3 dark:border-violet-400/20 dark:bg-slate-900">
          <div className="grid gap-3 lg:grid-cols-[.95fr_.95fr_.95fr_.95fr_auto]">
            <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">Data<input className="input" type="date" value={dailyForm.data} onChange={(e) => setDailyForm({ ...dailyForm, data: e.target.value })} /></label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">Grande área<select className="input" value={dailyForm.materia} onChange={(e) => setDailyForm({ ...dailyForm, materia: e.target.value })}>{areas.map((area) => <option key={area}>{area}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">Acertos<input className="input" type="number" min="0" value={dailyForm.acertos} onChange={(e) => setDailyForm({ ...dailyForm, acertos: e.target.value })} /></label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">Erros<input className="input" type="number" min="0" value={dailyForm.erros} onChange={(e) => setDailyForm({ ...dailyForm, erros: e.target.value })} /></label>
            <button className="btn-primary self-end bg-red-700 hover:bg-red-800" onClick={addDaily}>Adicionar</button>
          </div>
          <label className="mt-3 grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">Observação<input className="input" placeholder="Ex.: 20 questões de pneumonia, bloco de HAS, revisão de prova..." value={dailyForm.observacoes} onChange={(e) => setDailyForm({ ...dailyForm, observacoes: e.target.value })} /></label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric title="Hoje" value={dailyTotals.today} detail={`${dailyTotals.todayAcertos} acertos · ${dailyTotals.todayErros} erros`} />
          <Metric title="Total registrado" value={dailyTotals.total} detail="questões" />
          <Metric title="Acertos" value={dailyTotals.totalAcertos} detail={`${dailyTotals.total ? Math.round((dailyTotals.totalAcertos / dailyTotals.total) * 100) : 0}% de aproveitamento`} />
          <Metric title="Erros" value={dailyTotals.totalErros} detail="para revisar no caderno" />
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-black">Resumo por grande área</h3>
            <div className="mt-3 grid gap-2">
              {dailyByArea.map((item) => <Row key={item.area} left={item.area} right={`${item.acertos} acertos · ${item.erros} erros`} />)}
              {!dailyByArea.length && <Empty text="Registre suas questões do dia a dia para montar o desempenho por grande área." />}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-black">Últimos registros</h3>
            <div className="mt-3 grid gap-2">
              {daily.slice(0, 5).map((item) => <Row key={item.id} left={`${compactDate(item.data)} · ${item.materia}`} right={`${item.acertos}A · ${item.erros}E`} />)}
              {!daily.length && <Empty text="Nenhum registro diário ainda." />}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="card min-h-80 p-5">
          <h2 className="text-lg font-black">Ranking de assuntos mais errados</h2>
          <div className="mt-6 grid gap-2">
            {wrongRanking.map(([topic, count]) => <Row key={topic} left={topic} right={`${count} erro(s)`} />)}
            {!wrongRanking.length && <Empty text="O ranking será criado automaticamente a partir do caderno de erros." />}
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Horas estudadas por matéria</h2>
          <p className="mt-1 text-sm text-slate-500">Registre manualmente quanto estudou em cada disciplina. O dashboard soma tudo por matéria e também usa esses registros para contar seus dias ativos.</p>
          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-3 dark:border-violet-400/20 dark:bg-violet-500/10">
            <div className="grid gap-3 md:grid-cols-3">
              <input className="input" type="date" value={hoursForm.data} onChange={(e) => setHoursForm({ ...hoursForm, data: e.target.value })} />
              <select className="input" value={hoursForm.materia} onChange={(e) => setHoursForm({ ...hoursForm, materia: e.target.value })}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
              <input className="input" type="number" min="0" step="0.25" placeholder="Horas estudadas. Ex.: 1.5" value={hoursForm.horas} onChange={(e) => setHoursForm({ ...hoursForm, horas: e.target.value })} />
            </div>
            <input className="input mt-3" placeholder="Observação opcional. Ex.: aula de HAS + 20 questões" value={hoursForm.observacoes} onChange={(e) => setHoursForm({ ...hoursForm, observacoes: e.target.value })} />
            <button className="btn-primary mt-3 w-full bg-red-700 hover:bg-red-800" onClick={addHours}>Adicionar horas estudadas</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Metric title="Horas totais" value={`${Math.round(hoursTotal * 10) / 10}h`} />
            <Metric title="Dias ativos" value={activeDays} />
            <Metric title="Média por dia ativo" value={`${activeDays ? Math.round((hoursTotal / activeDays) * 10) / 10 : 0}h`} />
          </div>
          <h3 className="mt-5 text-sm font-black">Distribuição por matéria</h3>
          <div className="mt-3 grid gap-2">
            {hoursByArea.map((item) => <Row key={item.area} left={item.area} right={`${Math.round(item.horas * 10) / 10}h`} />)}
            {!hoursByArea.length && <Empty text="Ainda não há horas registradas por matéria." />}
          </div>
          <h3 className="mt-5 text-sm font-black">Últimos registros</h3>
          <div className="mt-3 grid gap-2">
            {productivity.slice(0, 5).map((item) => <Row key={item.id} left={`${compactDate(item.data)} · ${item.materia || "Sem matéria"}`} right={`${item.horas}h`} />)}
            {!productivity.length && <Empty text="Nenhum registro manual ainda. Adicione suas horas acima." />}
          </div>
        </article>
      </section>
    </div>
  );
}

function Metric({ title, value, detail }: { title: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-slate-50 p-3 dark:border-violet-400/20 dark:bg-slate-900">
      <span className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</span>
      <strong className="block text-2xl font-black">{value}</strong>
      {detail && <small className="text-slate-500">{detail}</small>}
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><span>{left}</span><strong>{right}</strong></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">{text}</div>;
}
