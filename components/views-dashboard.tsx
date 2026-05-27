"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarCheck2, Clock3, Target } from "lucide-react";
import { toast } from "sonner";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, allProgressIds, areas, parseISODate, schedule, todayISO } from "@/utils/schedule";

type LessonQuestionRecord = { lessonId: string; done: boolean; feitas: number; acertos: number; erros: number; observacoes: string | null };
type Productivity = { id: string; data: string; materia: string | null; horas: number; observacoes: string | null };
type ErrorNote = { id: string; tema: string; materia: string | null };

const compactDate = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");
const clockToHours = (value: string) => {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) + Number(minutes) / 60;
};
const formatHours = (value: number) => {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
};

export function DashboardView() {
  const doneIds = useMedboardStore((state) => state.doneIds);
  const storeQuestions = useMedboardStore((state) => state.lessonQuestions);
  const setTab = useMedboardStore((state) => state.setTab);
  const ids = useMemo(() => allProgressIds(), []);
  const lessons = useMemo(() => allLessons(), []);
  const [lessonQuestionRecords, setLessonQuestionRecords] = useState<LessonQuestionRecord[]>([]);
  const [productivity, setProductivity] = useState<Productivity[]>([]);
  const [errors, setErrors] = useState<ErrorNote[]>([]);
  const [hoursForm, setHoursForm] = useState({ data: todayISO(), materia: areas[0], horas: "", observacoes: "" });

  useEffect(() => {
    Promise.all([api<LessonQuestionRecord[]>("/api/lesson-questions"), api<Productivity[]>("/api/productivity"), api<ErrorNote[]>("/api/errors")])
      .then(([questionItems, productivityItems, errorItems]) => {
        setLessonQuestionRecords(questionItems);
        setProductivity(productivityItems);
        setErrors(errorItems);
      })
      .catch(() => {
        setLessonQuestionRecords([]);
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

  const questionsByArea = useMemo(() => areas.map((area) => {
    const areaLessons = lessons.filter((lesson) => lesson.disciplina === area);
    const stats = areaLessons.reduce((acc, lesson) => {
      const item = questionByLesson[lesson.id];
      if (!item) return acc;
      acc.acertos += Number(item.acertos || 0);
      acc.erros += Number(item.erros || 0);
      acc.feitas += Math.max(Number(item.feitas || 0), Number(item.acertos || 0) + Number(item.erros || 0));
      if (item.done || item.feitas || item.acertos || item.erros) acc.aulas += 1;
      return acc;
    }, { acertos: 0, erros: 0, feitas: 0, aulas: 0 });
    const respondidas = stats.acertos + stats.erros;
    const percentual = respondidas ? Math.round((stats.acertos / respondidas) * 100) : 0;
    const erroPercentual = respondidas ? Math.round((stats.erros / respondidas) * 100) : 0;
    return { area, ...stats, respondidas, percentual, erroPercentual, totalAulas: areaLessons.length };
  }), [lessons, questionByLesson]);

  const questionTotals = useMemo(() => {
    const acertos = questionsByArea.reduce((acc, item) => acc + item.acertos, 0);
    const erros = questionsByArea.reduce((acc, item) => acc + item.erros, 0);
    const feitas = questionsByArea.reduce((acc, item) => acc + item.feitas, 0);
    const aulas = questionsByArea.reduce((acc, item) => acc + item.aulas, 0);
    const respondidas = acertos + erros;
    return { acertos, erros, feitas, aulas, respondidas, percentual: respondidas ? Math.round((acertos / respondidas) * 100) : 0 };
  }, [questionsByArea]);

  const rankedAreas = questionsByArea.filter((item) => item.respondidas > 0).sort((a, b) => b.percentual - a.percentual);
  const bestAreas = rankedAreas.slice(0, 3);
  const worstAreas = [...rankedAreas].sort((a, b) => a.percentual - b.percentual).slice(0, 3);

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

  async function addHours() {
    if (!hoursForm.horas) {
      toast.error("Informe as horas estudadas.");
      return;
    }
    const saved = await api<Productivity>("/api/productivity", {
      method: "POST",
      body: JSON.stringify({ ...hoursForm, horas: clockToHours(hoursForm.horas), rendimento: 100 })
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
        <h2 className="text-lg font-black">Controle automático de questões por grande área</h2>
        <p className="mt-1 text-sm text-slate-500">Dados puxados automaticamente da aba Cronograma, a partir dos campos de questões, acertos e erros preenchidos em cada aula.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric title="Questões registradas" value={questionTotals.feitas || questionTotals.respondidas} detail={`${questionTotals.aulas} aula(s) com questões`} />
          <Metric title="Acertos" value={questionTotals.acertos} detail={`${questionTotals.percentual}% de aproveitamento`} />
          <Metric title="Erros" value={questionTotals.erros} detail="para revisar no caderno" />
          <Metric title="Áreas monitoradas" value={rankedAreas.length} detail={`${areas.length} grandes áreas no cronograma`} />
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <div>
            <h3 className="text-sm font-black">Resumo por grande área</h3>
            <div className="mt-3 grid gap-2">
              {questionsByArea.map((item) => (
                <AreaInsight key={item.area} item={item} />
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-black">Overview dos estudos</h3>
            <div className="mt-3 grid gap-3">
              <InsightBox title="Melhor desempenho" items={bestAreas} empty="Preencha acertos e erros no cronograma para descobrir suas áreas mais fortes." tone="good" />
              <InsightBox title="Precisa de mais revisão" items={worstAreas} empty="Ainda não há dados suficientes para apontar os pontos fracos." tone="risk" />
              <div className="rounded-xl border border-violet-100 bg-slate-50 p-3 text-sm dark:border-violet-400/20 dark:bg-slate-900">
                <strong>Leitura rápida</strong>
                <p className="mt-1 text-slate-500">{questionTotals.respondidas ? `Você tem ${questionTotals.percentual}% de aproveitamento geral, com ${questionTotals.erros} erro(s) distribuídos nas matérias preenchidas no cronograma.` : "Assim que você preencher questões nas aulas do cronograma, este painel passa a mostrar seu aproveitamento por matéria automaticamente."}</p>
              </div>
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
              <input className="input" type="time" value={hoursForm.horas} onChange={(e) => setHoursForm({ ...hoursForm, horas: e.target.value })} />
            </div>
            <input className="input mt-3" placeholder="Observação opcional. Ex.: aula de HAS + 20 questões" value={hoursForm.observacoes} onChange={(e) => setHoursForm({ ...hoursForm, observacoes: e.target.value })} />
            <button className="btn-primary mt-3 w-full bg-red-700 hover:bg-red-800" onClick={addHours}>Adicionar horas estudadas</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Metric title="Horas totais" value={formatHours(hoursTotal)} />
            <Metric title="Dias ativos" value={activeDays} />
            <Metric title="Média por dia ativo" value={formatHours(activeDays ? hoursTotal / activeDays : 0)} />
          </div>
          <h3 className="mt-5 text-sm font-black">Distribuição por matéria</h3>
          <div className="mt-3 grid gap-2">
            {hoursByArea.map((item) => <Row key={item.area} left={item.area} right={formatHours(item.horas)} />)}
            {!hoursByArea.length && <Empty text="Ainda não há horas registradas por matéria." />}
          </div>
          <h3 className="mt-5 text-sm font-black">Últimos registros</h3>
          <div className="mt-3 grid gap-2">
            {productivity.slice(0, 5).map((item) => <Row key={item.id} left={`${compactDate(item.data)} · ${item.materia || "Sem matéria"}`} right={formatHours(item.horas)} />)}
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

function AreaInsight({ item }: { item: { area: string; acertos: number; erros: number; feitas: number; aulas: number; respondidas: number; percentual: number; erroPercentual: number } }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-slate-50 p-3 dark:border-violet-400/20 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{item.area}</strong>
        <span className="text-sm font-black">{item.respondidas ? `${item.percentual}%` : "sem dados"}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.percentual}%` }} />
      </div>
      <p className="mt-2 text-sm text-slate-500">{item.acertos} acertos · {item.erros} erros · {item.aulas} aula(s) preenchidas</p>
      {!!item.respondidas && <p className="mt-1 text-xs text-slate-400">{item.erroPercentual}% das respostas registradas viraram erro.</p>}
    </div>
  );
}

function InsightBox({ title, items, empty, tone }: { title: string; items: { area: string; percentual: number; acertos: number; erros: number; respondidas: number }[]; empty: string; tone: "good" | "risk" }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-slate-50 p-3 dark:border-violet-400/20 dark:bg-slate-900">
      <strong>{title}</strong>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item.area} className="flex items-center justify-between gap-3 text-sm">
            <span>{item.area}</span>
            <span className={`font-black ${tone === "good" ? "text-emerald-600" : "text-red-600"}`}>{item.percentual}%</span>
          </div>
        ))}
        {!items.length && <p className="text-sm text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><span>{left}</span><strong>{right}</strong></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">{text}</div>;
}
