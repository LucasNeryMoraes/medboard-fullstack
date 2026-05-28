"use client";

import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, CalendarCheck2, Clock3, Save, Target } from "lucide-react";
import { toast } from "sonner";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { api } from "@/services/api";
import { allLessons, allProgressIds, areas, parseISODate, schedule, todayISO } from "@/utils/schedule";

type LessonQuestionRecord = { lessonId: string; done: boolean; feitas: number; acertos: number; erros: number; observacoes: string | null };
type Productivity = { id: string; data: string; materia: string | null; horas: number; observacoes: string | null; rendimento?: number };
type ErrorNote = { id: string; tema: string; materia: string | null };
type Flashcard = { id: string; pergunta: string; tag: string | null; materia: string | null; deck: string | null; acertos: number; erros: number };

const compactDate = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");
const colors = ["#b91c1c", "#d946ef", "#7c3aed", "#0f766e", "#f59e0b"];

function clockToHours(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) + Number(minutes) / 60;
}

function hoursToClock(value: number) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatHours(value: number) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

export function DashboardView() {
  const doneIds = useMedboardStore((state) => state.doneIds);
  const storeQuestions = useMedboardStore((state) => state.lessonQuestions);
  const ids = useMemo(() => allProgressIds(), []);
  const lessons = useMemo(() => allLessons(), []);
  const [lessonQuestionRecords, setLessonQuestionRecords] = useState<LessonQuestionRecord[]>([]);
  const [productivity, setProductivity] = useState<Productivity[]>([]);
  const [errors, setErrors] = useState<ErrorNote[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [hoursForm, setHoursForm] = useState({ data: todayISO(), materia: areas[0], horas: "", observacoes: "" });
  const [editingHours, setEditingHours] = useState<Record<string, string>>({});
  const [editingArea, setEditingArea] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      api<LessonQuestionRecord[]>("/api/lesson-questions"),
      api<Productivity[]>("/api/productivity"),
      api<ErrorNote[]>("/api/errors"),
      api<Flashcard[]>("/api/flashcards")
    ])
      .then(([questionItems, productivityItems, errorItems, cardItems]) => {
        setLessonQuestionRecords(questionItems);
        setProductivity(productivityItems);
        setErrors(errorItems);
        setFlashcards(cardItems);
        setEditingHours(Object.fromEntries(productivityItems.map((item) => [item.id, hoursToClock(item.horas)])));
        setEditingArea(Object.fromEntries(productivityItems.map((item) => [item.id, item.materia || areas[0]])));
      })
      .catch(() => {
        setLessonQuestionRecords([]);
        setProductivity([]);
        setErrors([]);
        setFlashcards([]);
      });
  }, []);

  const overdue = lessons.filter((lesson) => parseISODate(lesson.data) < parseISODate(todayISO()) && !doneIds.includes(lesson.id));
  const progress = ids.length ? Math.round((doneIds.length / ids.length) * 100) : 0;

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

  const performanceByArea = useMemo(() => areas.map((area) => {
    const questionStats = lessons.filter((lesson) => lesson.disciplina === area).reduce((acc, lesson) => {
      const item = questionByLesson[lesson.id];
      if (!item) return acc;
      acc.acertos += Number(item.acertos || 0);
      acc.erros += Number(item.erros || 0);
      acc.feitas += Math.max(Number(item.feitas || 0), Number(item.acertos || 0) + Number(item.erros || 0));
      if (item.done || item.feitas || item.acertos || item.erros) acc.aulas += 1;
      return acc;
    }, { acertos: 0, erros: 0, feitas: 0, aulas: 0 });
    const cardStats = flashcards.filter((card) => card.materia === area || card.deck === area).reduce((acc, card) => {
      acc.acertos += Number(card.acertos || 0);
      acc.erros += Number(card.erros || 0);
      return acc;
    }, { acertos: 0, erros: 0 });
    const acertos = questionStats.acertos + cardStats.acertos;
    const erros = questionStats.erros + cardStats.erros;
    const respondidas = acertos + erros;
    const percentual = respondidas ? Math.round((acertos / respondidas) * 100) : 0;
    const peso = respondidas ? Math.max(1, percentual) : 0;
    return { area, ...questionStats, acertos, erros, respondidas, percentual, peso };
  }), [flashcards, lessons, questionByLesson]);

  const pieData = performanceByArea.filter((item) => item.peso > 0).map((item) => ({
    name: item.area,
    value: item.peso,
    percentual: item.percentual,
    acertos: item.acertos,
    erros: item.erros
  }));

  const questionTotals = useMemo(() => {
    const acertos = performanceByArea.reduce((acc, item) => acc + item.acertos, 0);
    const erros = performanceByArea.reduce((acc, item) => acc + item.erros, 0);
    const feitas = performanceByArea.reduce((acc, item) => acc + item.feitas, 0);
    const aulas = performanceByArea.reduce((acc, item) => acc + item.aulas, 0);
    const respondidas = acertos + erros;
    return { acertos, erros, feitas, aulas, respondidas, percentual: respondidas ? Math.round((acertos / respondidas) * 100) : 0 };
  }, [performanceByArea]);

  const rankedAreas = performanceByArea.filter((item) => item.respondidas > 0).sort((a, b) => b.percentual - a.percentual);
  const bestAreas = rankedAreas.slice(0, 3);
  const worstAreas = [...rankedAreas].sort((a, b) => a.percentual - b.percentual).slice(0, 3);

  const wrongRanking = useMemo(() => {
    const ranking: Record<string, number> = {};
    errors.forEach((item) => {
      const key = `${item.tema}${item.materia ? ` · ${item.materia}` : ""}`;
      ranking[key] = (ranking[key] || 0) + 1;
    });
    flashcards.forEach((card) => {
      const misses = Number(card.erros || 0);
      if (!misses) return;
      const topic = card.tag || card.pergunta.slice(0, 70);
      const key = `${topic}${card.materia || card.deck ? ` · ${card.materia || card.deck}` : ""}`;
      ranking[key] = (ranking[key] || 0) + misses;
    });
    return Object.entries(ranking).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [errors, flashcards]);

  const hoursTotal = productivity.reduce((acc, item) => acc + Number(item.horas || 0), 0);
  const activeDays = new Set(productivity.map((item) => compactDate(item.data))).size;
  const hoursByArea = areas.map((area) => ({
    area,
    horas: productivity.filter((item) => item.materia === area).reduce((acc, item) => acc + Number(item.horas || 0), 0)
  })).filter((item) => item.horas > 0);

  const cards = [
    { label: "Progresso total", value: `${progress}%`, icon: Target, detail: `${doneIds.length} de ${ids.length} itens` },
    { label: "Aulas atrasadas", value: overdue.length, icon: AlertTriangle, detail: "pendentes até hoje" },
    { label: "Dias do cronograma", value: schedule.stats.totalDias, icon: CalendarCheck2, detail: `${schedule.stats.inicio} até ${schedule.stats.fim}` },
    { label: "Revisões planejadas", value: schedule.stats.totalRevisoes, icon: Clock3, detail: "15 e 30 dias" }
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
    setEditingHours((current) => ({ ...current, [saved.id]: hoursToClock(saved.horas) }));
    setEditingArea((current) => ({ ...current, [saved.id]: saved.materia || hoursForm.materia }));
    setHoursForm((current) => ({ ...current, horas: "", observacoes: "" }));
    toast.success("Horas registradas");
  }

  async function saveHours(item: Productivity) {
    const value = editingHours[item.id];
    if (!value) return;
    const updated = await api<Productivity>(`/api/productivity/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ horas: clockToHours(value), materia: editingArea[item.id] || item.materia || areas[0] })
    });
    setProductivity((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    setEditingArea((current) => ({ ...current, [updated.id]: updated.materia || areas[0] }));
    toast.success("Registro atualizado");
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
          <h2 className="text-lg font-black">Desempenho por área</h2>
          <p className="mt-1 text-sm text-slate-500">Pizza ponderada por aproveitamento em questões do cronograma e flashcards. Quanto melhor a área, maior a fatia.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_.9fr]">
            <div className="h-80">
              {pieData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={120} paddingAngle={3}>
                      {pieData.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
                    </Pie>
                    <Tooltip formatter={(_, __, payload) => [`${payload.payload.percentual}% · ${payload.payload.acertos} acertos · ${payload.payload.erros} erros`, payload.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty text="Preencha acertos/erros no cronograma ou revise flashcards para gerar o gráfico." />
              )}
            </div>
            <div className="grid content-center gap-2">
              {pieData.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{item.name}</span>
                  <strong>{item.percentual}%</strong>
                </div>
              ))}
            </div>
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
            {!overdue.length && <Empty text="Nenhuma aula atrasada pendente." />}
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-black">Controle automático de questões por grande área</h2>
        <p className="mt-1 text-sm text-slate-500">Dados puxados automaticamente da aba Cronograma e das respostas dos flashcards.</p>
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
              {performanceByArea.map((item) => <AreaInsight key={item.area} item={item} />)}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-black">Overview dos estudos</h3>
            <div className="mt-3 grid gap-3">
              <InsightBox title="Melhor desempenho" items={bestAreas} empty="Preencha acertos e erros para descobrir suas áreas mais fortes." tone="good" />
              <InsightBox title="Precisa de mais revisão" items={worstAreas} empty="Ainda não há dados suficientes para apontar os pontos fracos." tone="risk" />
              <div className="rounded-xl border border-violet-100 bg-slate-50 p-3 text-sm dark:border-violet-400/20 dark:bg-slate-900">
                <strong>Leitura rápida</strong>
                <p className="mt-1 text-slate-500">{questionTotals.respondidas ? `Você tem ${questionTotals.percentual}% de aproveitamento geral, com ${questionTotals.erros} erro(s) distribuídos nas matérias preenchidas.` : "Assim que você preencher questões ou flashcards, este painel passa a mostrar seu aproveitamento por matéria automaticamente."}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="card min-h-80 p-5">
          <h2 className="text-lg font-black">Ranking de assuntos mais errados</h2>
          <p className="mt-1 text-sm text-slate-500">Considera erros salvos no caderno e flashcards marcados como difíceis.</p>
          <div className="mt-6 grid gap-2">
            {wrongRanking.map(([topic, count]) => <Row key={topic} left={topic} right={`${count} erro(s)`} />)}
            {!wrongRanking.length && <Empty text="O ranking será criado automaticamente a partir do caderno de erros e flashcards." />}
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-black">Horas estudadas por matéria</h2>
          <p className="mt-1 text-sm text-slate-500">Registros manuais e do cronômetro entram aqui. Você pode corrigir qualquer lançamento.</p>
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
          <h3 className="mt-5 text-sm font-black">Últimos registros editáveis</h3>
          <div className="mt-3 grid gap-2">
            {productivity.slice(0, 8).map((item) => (
              <div key={item.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                <span><strong>{compactDate(item.data)} · {item.materia || "Sem matéria"}</strong><span className="block text-slate-500">{item.observacoes || "Sem observação"}</span></span>
                <select className="input h-10 md:w-48" value={editingArea[item.id] || item.materia || areas[0]} onChange={(event) => setEditingArea((current) => ({ ...current, [item.id]: event.target.value }))}>
                  {areas.map((area) => <option key={area}>{area}</option>)}
                </select>
                <input className="input h-10 md:w-32" type="time" value={editingHours[item.id] || hoursToClock(item.horas)} onChange={(event) => setEditingHours((current) => ({ ...current, [item.id]: event.target.value }))} />
                <button className="btn-secondary h-10" onClick={() => saveHours(item)}><Save size={16} /> Salvar</button>
              </div>
            ))}
            {!productivity.length && <Empty text="Nenhum registro manual ainda. Adicione suas horas acima ou use o cronômetro." />}
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

function AreaInsight({ item }: { item: { area: string; acertos: number; erros: number; feitas: number; aulas: number; respondidas: number; percentual: number } }) {
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
