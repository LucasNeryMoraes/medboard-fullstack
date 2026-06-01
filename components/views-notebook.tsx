"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Database, FileQuestion, ImagePlus, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { areas } from "@/utils/schedule";

type Alternative = { letra: string; texto: string };
type ReviewStatus = "NAO_REVISADA" | "ACERTEI_DEPOIS" | "ERREI_NOVAMENTE";
type Note = {
  id: string;
  tema: string;
  materia: string | null;
  erro: string;
  resposta: string | null;
  revisao: string | null;
  flashcard: string | null;
  alternativas: Alternative[] | null;
  respostaMarcada: string | null;
  respostaCorreta: string | null;
  explicacao: string | null;
  statusRevisao: ReviewStatus | null;
  imagem: string | null;
  dificuldade: string | null;
  data: string;
  createdAt: string;
};

type NotebookSection = "overview" | "review" | "simulation" | "new" | "manage";
type SimAnswer = { noteId: string; selected: string; correct: boolean };

const choices = ["A", "B", "C", "D", "E"];
const quantities = [5, 10, 20, 30, 50];

const emptyQuestion = {
  materia: areas[0],
  tema: "",
  erro: "",
  alternativas: choices.map((letra) => ({ letra, texto: "" })),
  respostaMarcada: "",
  respostaCorreta: "",
  explicacao: "",
  revisao: "",
  imagem: ""
};

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function statusLabel(status?: ReviewStatus | null) {
  if (status === "ACERTEI_DEPOIS") return "Acertei depois";
  if (status === "ERREI_NOVAMENTE") return "Errei novamente";
  return "Nao revisada";
}

function normalizeAlternatives(note: Pick<Note, "alternativas">): Alternative[] {
  return Array.isArray(note.alternativas) ? note.alternativas.filter((item) => item.texto?.trim()) : [];
}

function correctAnswer(note: Note) {
  return note.respostaCorreta || note.resposta || "";
}

async function fileToDataUrl(file?: File) {
  if (!file) return "";
  if (file.size > 850_000) {
    toast.error("Use uma imagem menor que 850 KB.");
    return "";
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function NotebookView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [section, setSection] = useState<NotebookSection>("overview");
  const [questionForm, setQuestionForm] = useState(emptyQuestion);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manageArea, setManageArea] = useState("Todas");
  const [reviewArea, setReviewArea] = useState("Todas");
  const [reviewSession, setReviewSession] = useState<Note[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showReviewAnswer, setShowReviewAnswer] = useState(false);
  const [simArea, setSimArea] = useState("Todas");
  const [simQuantity, setSimQuantity] = useState("10");
  const [simSession, setSimSession] = useState<Note[]>([]);
  const [simIndex, setSimIndex] = useState(0);
  const [simSelected, setSimSelected] = useState("");
  const [simAnswers, setSimAnswers] = useState<SimAnswer[]>([]);
  const [simRevealed, setSimRevealed] = useState(false);
  const [simFinished, setSimFinished] = useState(false);

  useEffect(() => {
    api<Note[]>("/api/errors").then(setNotes).catch(() => setNotes([]));
  }, []);

  const stats = useMemo(() => ({
    total: notes.length,
    pending: notes.filter((note) => !note.statusRevisao || note.statusRevisao === "NAO_REVISADA").length,
    hits: notes.filter((note) => note.statusRevisao === "ACERTEI_DEPOIS").length,
    misses: notes.filter((note) => note.statusRevisao === "ERREI_NOVAMENTE").length
  }), [notes]);

  const filteredManage = useMemo(() => notes.filter((note) => manageArea === "Todas" || note.materia === manageArea), [manageArea, notes]);
  const currentReview = reviewSession[reviewIndex];
  const currentSim = simSession[simIndex];
  const simCorrectCount = simAnswers.filter((answer) => answer.correct).length;

  function resetForm(materia = questionForm.materia) {
    setQuestionForm({ ...emptyQuestion, materia });
    setEditingId(null);
  }

  function updateAlternative(index: number, texto: string) {
    setQuestionForm((current) => ({
      ...current,
      alternativas: current.alternativas.map((item, itemIndex) => itemIndex === index ? { ...item, texto } : item)
    }));
  }

  async function saveQuestion() {
    if (!questionForm.tema.trim() || !questionForm.erro.trim() || !questionForm.respostaCorreta.trim()) {
      toast.error("Preencha assunto, questao e resposta correta.");
      return;
    }
    const payload = {
      materia: questionForm.materia,
      tema: questionForm.tema,
      erro: questionForm.erro,
      alternativas: questionForm.alternativas.filter((item) => item.texto.trim()),
      respostaMarcada: questionForm.respostaMarcada || undefined,
      respostaCorreta: questionForm.respostaCorreta,
      explicacao: questionForm.explicacao || undefined,
      revisao: questionForm.revisao || undefined,
      resposta: questionForm.respostaCorreta,
      imagem: questionForm.imagem || undefined,
      statusRevisao: editingId ? undefined : "NAO_REVISADA"
    };
    const saved = await api<Note>(editingId ? `/api/errors/${editingId}` : "/api/errors", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    setNotes((current) => editingId ? current.map((note) => note.id === saved.id ? saved : note) : [saved, ...current]);
    resetForm(questionForm.materia);
    setSection("overview");
    toast.success(editingId ? "Questao atualizada" : "Questao salva no banco");
  }

  function editQuestion(note: Note) {
    const alternatives = normalizeAlternatives(note);
    const filled = choices.map((letra) => alternatives.find((item) => item.letra === letra) || { letra, texto: "" });
    setQuestionForm({
      materia: note.materia || areas[0],
      tema: note.tema,
      erro: note.erro,
      alternativas: filled,
      respostaMarcada: note.respostaMarcada || "",
      respostaCorreta: correctAnswer(note),
      explicacao: note.explicacao || "",
      revisao: note.revisao || "",
      imagem: note.imagem || ""
    });
    setEditingId(note.id);
    setSection("new");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeQuestion(id: string) {
    await api(`/api/errors/${id}`, { method: "DELETE" });
    setNotes((current) => current.filter((note) => note.id !== id));
    setReviewSession((current) => current.filter((note) => note.id !== id));
    setSimSession((current) => current.filter((note) => note.id !== id));
    toast.success("Questao removida do banco");
  }

  function startReview() {
    const pool = notes.filter((note) => reviewArea === "Todas" || note.materia === reviewArea);
    const selected = shuffle(pool);
    setReviewSession(selected);
    setReviewIndex(0);
    setShowReviewAnswer(false);
    setSection("review");
    if (!selected.length) toast.error("Nenhuma questao encontrada para revisar.");
  }

  async function rateReview(statusRevisao: ReviewStatus) {
    if (!currentReview) return;
    const updated = await api<Note>(`/api/errors/${currentReview.id}`, {
      method: "PATCH",
      body: JSON.stringify({ statusRevisao })
    });
    setNotes((current) => current.map((note) => note.id === updated.id ? updated : note));
    setReviewSession((current) => current.map((note) => note.id === updated.id ? updated : note));
    setShowReviewAnswer(false);
    setReviewIndex((current) => Math.min(current + 1, Math.max(reviewSession.length - 1, 0)));
  }

  function startSimulation() {
    const quantity = Number(simQuantity);
    const pool = notes.filter((note) => simArea === "Todas" || note.materia === simArea);
    const selected = shuffle(pool).slice(0, Math.min(quantity, pool.length));
    setSimSession(selected);
    setSimIndex(0);
    setSimSelected("");
    setSimAnswers([]);
    setSimRevealed(false);
    setSimFinished(false);
    setSection("simulation");
    if (!selected.length) toast.error("Nenhuma questao cadastrada para essa selecao.");
  }

  async function answerSimulation() {
    if (!currentSim || !simSelected) {
      toast.error("Selecione uma resposta.");
      return;
    }
    const correct = simSelected.trim().toUpperCase() === correctAnswer(currentSim).trim().toUpperCase();
    setSimAnswers((current) => [...current.filter((item) => item.noteId !== currentSim.id), { noteId: currentSim.id, selected: simSelected, correct }]);
    const updated = await api<Note>(`/api/errors/${currentSim.id}`, {
      method: "PATCH",
      body: JSON.stringify({ statusRevisao: correct ? "ACERTEI_DEPOIS" : "ERREI_NOVAMENTE" })
    });
    setNotes((current) => current.map((note) => note.id === updated.id ? updated : note));
    setSimRevealed(true);
  }

  async function finishSimulation() {
    if (!simSession.length) return;
    const grouped = simSession.reduce<Record<string, { acertos: number; erros: number }>>((acc, note) => {
      const area = note.materia || "Sem area";
      const answer = simAnswers.find((item) => item.noteId === note.id);
      acc[area] ||= { acertos: 0, erros: 0 };
      if (answer?.correct) acc[area].acertos += 1;
      else acc[area].erros += 1;
      return acc;
    }, {});
    await Promise.all(Object.entries(grouped).map(([materia, result]) => api("/api/performance", {
      method: "POST",
      body: JSON.stringify({ materia, acertos: result.acertos, erros: result.erros, examName: "Simulado do caderno de erros", data: new Date() })
    })));
    setSimFinished(true);
    toast.success("Simulado finalizado e desempenho registrado");
  }

  function nextSimulationQuestion() {
    if (simIndex >= simSession.length - 1) {
      finishSimulation();
      return;
    }
    setSimIndex((current) => current + 1);
    setSimSelected("");
    setSimRevealed(false);
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Total de questoes" value={stats.total} />
        <Metric title="Nao revisadas" value={stats.pending} />
        <Metric title="Acertei depois" value={stats.hits} />
        <Metric title="Errei novamente" value={stats.misses} />
      </section>

      <section className="card p-4">
        <div className="grid gap-2 md:grid-cols-4">
          <button className="btn-secondary justify-center" onClick={startReview}><BookOpenCheck size={18} /> Revisar Questoes</button>
          <button className="btn-secondary justify-center" onClick={() => setSection("simulation")}><FileQuestion size={18} /> Criar Simulado</button>
          <button className="btn-primary justify-center bg-red-700 hover:bg-red-800" onClick={() => { resetForm(); setSection("new"); }}><Plus size={18} /> Nova Questao</button>
          <button className="btn-secondary justify-center" onClick={() => setSection("manage")}><Database size={18} /> Gerenciar Banco</button>
        </div>
      </section>

      {section === "overview" && (
        <section className="card p-8 text-center">
          <h2 className="text-2xl font-black">Banco de questoes erradas</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">Cadastre questoes importantes, revise quando quiser e crie simulados usando somente o que voce errou antes.</p>
        </section>
      )}

      {section === "new" && (
        <QuestionForm
          form={questionForm}
          editing={!!editingId}
          onChange={setQuestionForm}
          onAlternativeChange={updateAlternative}
          onImage={(imagem) => setQuestionForm((current) => ({ ...current, imagem }))}
          onSave={saveQuestion}
          onCancel={() => { resetForm(); setSection("overview"); }}
        />
      )}

      {section === "review" && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Revisar questoes</h2>
              <p className="mt-1 text-sm text-slate-500">Refaca questoes do banco e marque o resultado da revisao.</p>
            </div>
            <div className="flex gap-2">
              <select className="input w-52" value={reviewArea} onChange={(event) => setReviewArea(event.target.value)}>
                <option>Todas</option>
                {areas.map((area) => <option key={area}>{area}</option>)}
              </select>
              <button className="btn-secondary" onClick={startReview}><RotateCcw size={16} /> Embaralhar</button>
            </div>
          </div>
          {currentReview ? (
            <QuestionPractice
              note={currentReview}
              index={reviewIndex}
              total={reviewSession.length}
              revealed={showReviewAnswer}
              selected=""
              onSelected={() => null}
              onReveal={() => setShowReviewAnswer(true)}
              onHit={() => rateReview("ACERTEI_DEPOIS")}
              onMiss={() => rateReview("ERREI_NOVAMENTE")}
              onNext={() => {
                setShowReviewAnswer(false);
                setReviewIndex((current) => Math.min(current + 1, Math.max(reviewSession.length - 1, 0)));
              }}
            />
          ) : <Empty text="Escolha uma area e clique em Embaralhar para revisar." />}
        </section>
      )}

      {section === "simulation" && (
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Simulado do caderno de erros</h2>
              <p className="mt-1 text-sm text-slate-500">Gerado exclusivamente com as questoes cadastradas no banco.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-[150px_220px_auto]">
              <select className="input" value={simQuantity} onChange={(event) => setSimQuantity(event.target.value)}>
                {quantities.map((quantity) => <option key={quantity} value={quantity}>{quantity} questoes</option>)}
              </select>
              <select className="input" value={simArea} onChange={(event) => setSimArea(event.target.value)}>
                <option>Todas</option>
                {areas.map((area) => <option key={area}>{area}</option>)}
              </select>
              <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={startSimulation}>Gerar simulado</button>
            </div>
          </div>
          {simFinished ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-400/20 dark:bg-emerald-500/10">
              <span className="text-sm font-black uppercase text-emerald-700 dark:text-emerald-200">Resultado registrado</span>
              <strong className="mt-2 block text-4xl font-black">{simSession.length ? Math.round((simCorrectCount / simSession.length) * 100) : 0}%</strong>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{simCorrectCount} acertos de {simSession.length} questoes.</p>
            </div>
          ) : currentSim ? (
            <QuestionPractice
              note={currentSim}
              index={simIndex}
              total={simSession.length}
              revealed={simRevealed}
              selected={simSelected}
              onSelected={setSimSelected}
              onReveal={answerSimulation}
              onNext={nextSimulationQuestion}
              simulationMode
            />
          ) : <Empty text="Escolha quantidade e area para gerar um simulado." />}
        </section>
      )}

      {section === "manage" && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Gerenciar banco</h2>
              <p className="mt-1 text-sm text-slate-500">Edite, exclua ou reutilize suas questoes erradas.</p>
            </div>
            <select className="input w-64" value={manageArea} onChange={(event) => setManageArea(event.target.value)}>
              <option>Todas</option>
              {areas.map((area) => <option key={area}>{area}</option>)}
            </select>
          </div>
          <div className="mt-5 grid gap-3">
            {filteredManage.map((note) => (
              <article key={note.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">{note.materia || "Sem area"} · {statusLabel(note.statusRevisao)}</span>
                    <h3 className="mt-1 text-lg font-black">{note.tema}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{note.erro}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary px-3" onClick={() => editQuestion(note)}><Pencil size={16} /> Editar</button>
                    <button className="btn-secondary px-3" onClick={() => removeQuestion(note.id)}><Trash2 size={16} /></button>
                  </div>
                </div>
              </article>
            ))}
            {!filteredManage.length && <Empty text="Nenhuma questao cadastrada nessa selecao." />}
          </div>
        </section>
      )}
    </div>
  );
}

function QuestionForm({ form, editing, onChange, onAlternativeChange, onImage, onSave, onCancel }: {
  form: typeof emptyQuestion;
  editing: boolean;
  onChange: (value: typeof emptyQuestion) => void;
  onAlternativeChange: (index: number, texto: string) => void;
  onImage: (image: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="card p-5">
      <h2 className="text-xl font-black">{editing ? "Editar questao" : "Nova questao"}</h2>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <select className="input" value={form.materia} onChange={(event) => onChange({ ...form, materia: event.target.value })}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
          <input className="input" placeholder="Assunto" value={form.tema} onChange={(event) => onChange({ ...form, tema: event.target.value })} />
        </div>
        <textarea className="input min-h-36" placeholder="Questao completa" value={form.erro} onChange={(event) => onChange({ ...form, erro: event.target.value })} />
        <div className="grid gap-2">
          {form.alternativas.map((alternative, index) => (
            <label key={alternative.letra} className="grid gap-1">
              <span className="text-xs font-black uppercase text-slate-400">Alternativa {alternative.letra}</span>
              <input className="input" value={alternative.texto} onChange={(event) => onAlternativeChange(index, event.target.value)} />
            </label>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="Resposta marcada. Ex.: B" value={form.respostaMarcada} onChange={(event) => onChange({ ...form, respostaMarcada: event.target.value.toUpperCase() })} />
          <input className="input" placeholder="Resposta correta. Ex.: D" value={form.respostaCorreta} onChange={(event) => onChange({ ...form, respostaCorreta: event.target.value.toUpperCase() })} />
        </div>
        <textarea className="input min-h-24" placeholder="Explicacao" value={form.explicacao} onChange={(event) => onChange({ ...form, explicacao: event.target.value })} />
        <textarea className="input min-h-20" placeholder="Motivo do erro (opcional)" value={form.revisao} onChange={(event) => onChange({ ...form, revisao: event.target.value })} />
        <ImageUpload label="Imagem opcional" onImage={onImage} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={onSave}>{editing ? "Atualizar questao" : "Salvar questao"}</button>
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </section>
  );
}

function QuestionPractice({ note, index, total, revealed, selected, onSelected, onReveal, onHit, onMiss, onNext, simulationMode = false }: {
  note: Note;
  index: number;
  total: number;
  revealed: boolean;
  selected: string;
  onSelected: (value: string) => void;
  onReveal: () => void;
  onHit?: () => void;
  onMiss?: () => void;
  onNext: () => void;
  simulationMode?: boolean;
}) {
  const alternatives = normalizeAlternatives(note);
  return (
    <div className="mt-5 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-slate-500">
        <span>{index + 1} de {total} · {note.materia || "Sem area"}</span>
        <span>{note.tema}</span>
      </div>
      <div className="rounded-2xl border border-violet-100 bg-slate-50 p-5 dark:border-violet-400/20 dark:bg-slate-900">
        <p className="whitespace-pre-wrap text-base font-bold">{note.erro}</p>
        {note.imagem && <img className="mt-4 max-h-80 rounded-xl border border-slate-200 object-contain dark:border-white/10" src={note.imagem} alt="" />}
      </div>
      {!!alternatives.length && (
        <div className="grid gap-2">
          {alternatives.map((alternative) => (
            <button
              key={alternative.letra}
              disabled={revealed}
              className={`rounded-xl border p-3 text-left text-sm font-bold ${selected === alternative.letra ? "border-red-600 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200" : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950"}`}
              onClick={() => onSelected(alternative.letra)}
            >
              {alternative.letra}) {alternative.texto}
            </button>
          ))}
        </div>
      )}
      {!alternatives.length && simulationMode && (
        <input className="input" placeholder="Digite a alternativa ou resposta" value={selected} disabled={revealed} onChange={(event) => onSelected(event.target.value.toUpperCase())} />
      )}
      {revealed && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-400/20 dark:bg-emerald-500/10">
          <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-200">Resposta correta</span>
          <p className="mt-2 whitespace-pre-wrap font-black">{correctAnswer(note) || "Sem resposta registrada."}</p>
          {note.explicacao && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{note.explicacao}</p>}
          {note.revisao && <p className="mt-3 text-sm text-slate-500">Motivo original do erro: {note.revisao}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!revealed && <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={onReveal}>{simulationMode ? "Responder" : "Mostrar resposta"}</button>}
        {revealed && !simulationMode && <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={onHit}>Acertei depois</button>}
        {revealed && !simulationMode && <button className="btn-secondary" onClick={onMiss}>Errei novamente</button>}
        {revealed && simulationMode && <button className="btn-secondary" onClick={onNext}>{index >= total - 1 ? "Finalizar" : "Proxima"}</button>}
        {!simulationMode && <button className="btn-secondary" onClick={onNext}>Pular</button>}
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <article className="card p-4">
      <span className="text-xs font-black uppercase tracking-wider text-slate-400">{title}</span>
      <strong className="mt-1 block text-3xl font-black">{value}</strong>
    </article>
  );
}

function ImageUpload({ label, onImage }: { label: string; onImage: (image: string) => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 p-4 dark:border-violet-400/30 dark:bg-violet-500/10">
      <label className="text-sm font-black"><ImagePlus className="mr-2 inline" size={16} />{label}</label>
      <input className="input mt-3" type="file" accept="image/*" onChange={async (event) => onImage(await fileToDataUrl(event.target.files?.[0]))} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">{text}</div>;
}
