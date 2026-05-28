"use client";

import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { useMedboardStore } from "@/hooks/use-medboard-store";
import { areas, todayISO } from "@/utils/schedule";

type Note = {
  id: string;
  tema: string;
  materia: string | null;
  erro: string;
  resposta: string | null;
  revisao: string | null;
  flashcard: string | null;
  imagem: string | null;
  dificuldade: string | null;
  data: string;
  createdAt: string;
};

type Flashcard = {
  id: string;
  pergunta: string;
  resposta: string;
  materia: string | null;
  deck: string | null;
  tag: string | null;
  imagem: string | null;
  dueDate: string;
  acertos: number;
  erros: number;
  createdAt: string;
};

const emptyNote = {
  materia: areas[0],
  tema: "",
  erro: "",
  resposta: "",
  revisao: "",
  imagem: "",
  data: "",
  dificuldade: "Dificuldade baixa"
};

const emptyCard = {
  materia: areas[0],
  tag: "",
  pergunta: "",
  resposta: "",
  imagem: ""
};

function compactDate(value: string | Date) {
  return new Date(value).toLocaleDateString("sv-SE");
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
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
  const reviewTarget = useMedboardStore((state) => state.reviewTarget);
  const setReviewTarget = useMedboardStore((state) => state.setReviewTarget);
  const [notes, setNotes] = useState<Note[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [noteForm, setNoteForm] = useState(emptyNote);
  const [cardForm, setCardForm] = useState(emptyCard);

  const [noteArea, setNoteArea] = useState("Todas as matérias");
  const [noteMode, setNoteMode] = useState("Revisões de hoje/atrasadas");
  const [noteSession, setNoteSession] = useState<Note[]>([]);
  const [noteIndex, setNoteIndex] = useState(0);
  const [showNoteAnswer, setShowNoteAnswer] = useState(false);

  const [flashArea, setFlashArea] = useState("Todas as matérias");
  const [flashMode, setFlashMode] = useState("Revisões de hoje/atrasadas");
  const [flashSession, setFlashSession] = useState<Flashcard[]>([]);
  const [flashIndex, setFlashIndex] = useState(0);
  const [showFlashAnswer, setShowFlashAnswer] = useState(false);
  const [simAreas, setSimAreas] = useState<string[]>(areas);
  const [simQuantity, setSimQuantity] = useState("10");
  const [simSession, setSimSession] = useState<Note[]>([]);
  const [simIndex, setSimIndex] = useState(0);
  const [showSimAnswer, setShowSimAnswer] = useState(false);

  useEffect(() => {
    Promise.all([api<Note[]>("/api/errors"), api<Flashcard[]>("/api/flashcards")])
      .then(([noteItems, cardItems]) => {
        setNotes(noteItems);
        setFlashcards(cardItems);
      })
      .catch(() => {
        setNotes([]);
        setFlashcards([]);
      });
  }, []);

  const today = todayISO();
  const decks = useMemo(() => areas.map((area) => ({
    area,
    notes: notes.filter((note) => note.materia === area).length,
    flashcards: flashcards.filter((card) => card.materia === area || card.deck === area).length
  })), [notes, flashcards]);

  const currentNote = noteSession[noteIndex];
  const currentFlashcard = flashSession[flashIndex];
  const currentSimQuestion = simSession[simIndex];
  const simulationPool = useMemo(() => notes.filter((note) => note.erro.trim() && simAreas.length > 0 && note.materia && simAreas.includes(note.materia)), [notes, simAreas]);

  useEffect(() => {
    if (!reviewTarget) return;
    if (reviewTarget.source === "error-note" && notes.length) {
      const target = notes.find((note) => note.id === reviewTarget.sourceId);
      if (target) {
        setNoteArea(target.materia || "Todas as matérias");
        setNoteMode("Todos os erros");
        setNoteSession([target]);
        setNoteIndex(0);
        setShowNoteAnswer(false);
      }
    }
    if (reviewTarget.source === "flashcard" && flashcards.length) {
      const target = flashcards.find((card) => card.id === reviewTarget.sourceId);
      if (target) {
        setFlashArea(target.materia || target.deck || "Todas as matérias");
        setFlashMode("Todos os flashcards");
        setFlashSession([target]);
        setFlashIndex(0);
        setShowFlashAnswer(false);
      }
    }
  }, [reviewTarget, notes, flashcards]);

  function dueNote(note: Note) {
    return compactDate(note.data || note.createdAt) <= today;
  }

  function dueFlashcard(card: Flashcard) {
    return compactDate(card.dueDate || card.createdAt) <= today;
  }

  async function createScheduleReview(payload: { id: string; title: string; materia?: string | null; date: Date; source: "error-note" | "flashcard"; difficulty: string }) {
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        externalId: `review-${payload.source}-${payload.id}-${payload.date.toLocaleDateString("sv-SE")}`,
        titulo: payload.title,
        descricao: `Revisão gerada pelo caderno de erros (${payload.difficulty}).`,
        data: payload.date,
        tipo: "REVISAO",
        materia: payload.materia || "Caderno de erros",
        prioridade: payload.difficulty === "Muito difícil" || payload.difficulty === "Difícil" ? "HIGH" : "MEDIUM",
        status: "PENDING",
        metadata: { source: payload.source, sourceId: payload.id, difficulty: payload.difficulty }
      })
    });
  }

  async function completeOpenedReminder(source: "error-note" | "flashcard", sourceId: string) {
    if (!reviewTarget || reviewTarget.source !== source || reviewTarget.sourceId !== sourceId || !reviewTarget.taskId) return;
    await api(`/api/tasks/${reviewTarget.taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "DONE", descricao: "Respondido no caderno." })
    });
    setReviewTarget(null);
  }

  async function removeLinkedScheduleReviews(source: "error-note" | "flashcard", sourceId: string) {
    await api(`/api/tasks?source=${encodeURIComponent(source)}&sourceId=${encodeURIComponent(sourceId)}`, { method: "DELETE" });
  }

  function nextDate(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  async function saveNote() {
    if (!noteForm.tema.trim() || !noteForm.erro.trim()) {
      toast.error("Preencha o tema e a questão/erro.");
      return;
    }
    const saved = await api<Note>("/api/errors", {
      method: "POST",
      body: JSON.stringify({
        ...noteForm,
        resposta: noteForm.resposta || undefined,
        revisao: noteForm.revisao || undefined,
        flashcard: noteForm.resposta || undefined,
        imagem: noteForm.imagem || undefined,
        data: noteForm.data || undefined
      })
    });
    setNotes((current) => [saved, ...current]);
    setNoteForm({ ...emptyNote, materia: noteForm.materia });
    toast.success("Erro salvo");
  }

  async function saveFlashcard() {
    if (!cardForm.pergunta.trim() || !cardForm.resposta.trim()) {
      toast.error("Preencha pergunta e resposta do flashcard.");
      return;
    }
    const saved = await api<Flashcard>("/api/flashcards", {
      method: "POST",
      body: JSON.stringify({
        pergunta: cardForm.pergunta,
        resposta: cardForm.resposta,
        materia: cardForm.materia,
        deck: cardForm.materia,
        tag: cardForm.tag,
        imagem: cardForm.imagem || undefined
      })
    });
    setFlashcards((current) => [saved, ...current]);
    setCardForm({ ...emptyCard, materia: cardForm.materia });
    toast.success("Flashcard salvo");
  }

  async function removeNote(id: string) {
    await api(`/api/errors/${id}`, { method: "DELETE" });
    await removeLinkedScheduleReviews("error-note", id);
    setNotes((current) => current.filter((note) => note.id !== id));
    setNoteSession((current) => current.filter((note) => note.id !== id));
    if (reviewTarget?.source === "error-note" && reviewTarget.sourceId === id) setReviewTarget(null);
    toast.success("Erro apagado");
  }

  async function removeFlashcard(id: string) {
    await api(`/api/flashcards/${id}`, { method: "DELETE" });
    await removeLinkedScheduleReviews("flashcard", id);
    setFlashcards((current) => current.filter((card) => card.id !== id));
    setFlashSession((current) => current.filter((card) => card.id !== id));
    if (reviewTarget?.source === "flashcard" && reviewTarget.sourceId === id) setReviewTarget(null);
    toast.success("Flashcard apagado");
  }

  function startNoteSession() {
    const filtered = notes.filter((note) => {
      const areaOk = noteArea === "Todas as matérias" || note.materia === noteArea;
      const modeOk = noteMode === "Todos os erros" || dueNote(note);
      return areaOk && modeOk;
    });
    setNoteSession(shuffle(filtered));
    setNoteIndex(0);
    setShowNoteAnswer(false);
    if (!filtered.length) toast.error("Nenhum erro encontrado para essa seleção.");
  }

  function startFlashSession() {
    const filtered = flashcards.filter((card) => {
      const areaOk = flashArea === "Todas as matérias" || card.materia === flashArea || card.deck === flashArea;
      const modeOk = flashMode === "Todos os flashcards" || dueFlashcard(card);
      return areaOk && modeOk;
    });
    setFlashSession(shuffle(filtered));
    setFlashIndex(0);
    setShowFlashAnswer(false);
    if (!filtered.length) toast.error("Nenhum flashcard encontrado para essa seleção.");
  }

  function toggleSimArea(area: string) {
    setSimAreas((current) => current.includes(area) ? current.filter((item) => item !== area) : [...current, area]);
  }

  function startErrorSimulation() {
    if (!simAreas.length) {
      toast.error("Selecione pelo menos uma matéria para montar o simulado.");
      return;
    }
    const quantity = Math.max(1, Number(simQuantity || 1));
    const selected = shuffle(simulationPool).slice(0, Math.min(quantity, simulationPool.length));
    setSimSession(selected);
    setSimIndex(0);
    setShowSimAnswer(false);
    if (!selected.length) toast.error("Nenhuma questão errada cadastrada para essa seleção.");
  }

  function nextSimQuestion() {
    setShowSimAnswer(false);
    setSimIndex((current) => Math.min(current + 1, Math.max(simSession.length - 1, 0)));
  }

  function nextNote() {
    setShowNoteAnswer(false);
    setNoteIndex((current) => Math.min(current + 1, Math.max(noteSession.length - 1, 0)));
  }

  function previousNote() {
    setShowNoteAnswer(false);
    setNoteIndex((current) => Math.max(current - 1, 0));
  }

  function nextFlashcard() {
    setShowFlashAnswer(false);
    setFlashIndex((current) => Math.min(current + 1, Math.max(flashSession.length - 1, 0)));
  }

  function previousFlashcard() {
    setShowFlashAnswer(false);
    setFlashIndex((current) => Math.max(current - 1, 0));
  }

  async function rateNote(label: string, days: number) {
    if (!currentNote) return;
    const date = nextDate(days);
    const updated = await api<Note>(`/api/errors/${currentNote.id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: date, dificuldade: label })
    });
    await completeOpenedReminder("error-note", currentNote.id);
    setNotes((current) => current.map((note) => note.id === updated.id ? updated : note));
    setNoteSession((current) => current.map((note) => note.id === updated.id ? updated : note));
    toast.success("Erro atualizado no caderno");
    nextNote();
  }

  async function rateFlashcard(label: string, days: number) {
    if (!currentFlashcard) return;
    const date = nextDate(days);
    const isHit = label === "Médio" || label === "Fácil";
    const updated = await api<Flashcard>(`/api/flashcards/${currentFlashcard.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        dueDate: date,
        lastDifficulty: label,
        acertos: Number(currentFlashcard.acertos || 0) + (isHit ? 1 : 0),
        erros: Number(currentFlashcard.erros || 0) + (isHit ? 0 : 1)
      })
    });
    await completeOpenedReminder("flashcard", currentFlashcard.id);
    setFlashcards((current) => current.map((card) => card.id === updated.id ? updated : card));
    setFlashSession((current) => current.map((card) => card.id === updated.id ? updated : card));
    toast.success("Flashcard atualizado");
    nextFlashcard();
  }

  function prepareFlashcardFromCurrentNote() {
    if (!currentNote) return;
    setCardForm({
      materia: currentNote.materia || areas[0],
      tag: currentNote.tema,
      pergunta: currentNote.erro,
      resposta: currentNote.resposta || currentNote.revisao || "",
      imagem: currentNote.imagem || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[1fr_.9fr]">
        <article className="card p-5">
          <h2 className="text-xl font-black">Caderno de erros</h2>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <select className="input" value={noteForm.materia} onChange={(event) => setNoteForm({ ...noteForm, materia: event.target.value })}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
              <input className="input" placeholder="Assunto / tema da questão" value={noteForm.tema} onChange={(event) => setNoteForm({ ...noteForm, tema: event.target.value })} />
            </div>
            <textarea className="input min-h-28" placeholder="Cole aqui a questão que você errou ou um resumo dela" value={noteForm.erro} onChange={(event) => setNoteForm({ ...noteForm, erro: event.target.value })} />
            <textarea className="input min-h-24" placeholder="Resposta correta / explicação resumida" value={noteForm.resposta} onChange={(event) => setNoteForm({ ...noteForm, resposta: event.target.value })} />
            <textarea className="input min-h-20" placeholder="Por que eu errei? Ex.: falta de conteúdo, pegadinha, distração..." value={noteForm.revisao} onChange={(event) => setNoteForm({ ...noteForm, revisao: event.target.value })} />
            <ImageUpload label="Imagem da questão ou explicação (opcional)" onImage={(imagem) => setNoteForm({ ...noteForm, imagem })} />
            <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={saveNote}>Salvar erro</button>
          </div>
        </article>

        <article className="card p-5">
          <h2 className="text-xl font-black">Novo flashcard</h2>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <select className="input" value={cardForm.materia} onChange={(event) => setCardForm({ ...cardForm, materia: event.target.value })}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
              <input className="input" placeholder="Tag opcional. Ex.: HAS, arritmia..." value={cardForm.tag} onChange={(event) => setCardForm({ ...cardForm, tag: event.target.value })} />
            </div>
            <textarea className="input min-h-24" placeholder="Pergunta do flashcard" value={cardForm.pergunta} onChange={(event) => setCardForm({ ...cardForm, pergunta: event.target.value })} />
            <textarea className="input min-h-24" placeholder="Resposta e explicação" value={cardForm.resposta} onChange={(event) => setCardForm({ ...cardForm, resposta: event.target.value })} />
            <ImageUpload label="Imagem do flashcard (opcional)" onImage={(imagem) => setCardForm({ ...cardForm, imagem })} />
            <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={saveFlashcard}>Salvar flashcard</button>
          </div>
        </article>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-black">Baralhos automáticos por grande área</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {decks.map((deck) => (
            <div key={deck.area} className="rounded-xl border border-violet-100 bg-slate-50 p-3 dark:border-violet-400/20 dark:bg-slate-900">
              <strong>{deck.area}</strong>
              <p className="mt-1 text-sm text-slate-500">{deck.notes} erro(s) · {deck.flashcards} flashcard(s)</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Simulado do caderno de erros</h2>
            <p className="mt-1 text-sm text-slate-500">O simulado é montado somente a partir das questões salvas em Caderno de erros.</p>
            <p className="mt-2 text-sm font-bold text-slate-500">{simulationPool.length} questão(ões) errada(s) disponíveis na seleção atual.</p>
          </div>
          <div className="flex gap-2">
            <input className="input w-36" type="number" min="1" value={simQuantity} onChange={(event) => setSimQuantity(event.target.value)} />
            <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={startErrorSimulation}>Iniciar simulado</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary rounded-full px-3 py-2 text-sm font-bold" onClick={() => setSimAreas(areas)}>Todas</button>
          <button className="btn-secondary rounded-full px-3 py-2 text-sm font-bold" onClick={() => setSimAreas([])}>Limpar</button>
          {areas.map((area) => (
            <button key={area} className={`rounded-full px-3 py-2 text-sm font-bold ${simAreas.includes(area) ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "btn-secondary"}`} onClick={() => toggleSimArea(area)}>
              {area}
            </button>
          ))}
        </div>
        {currentSimQuestion ? (
          <div className="mt-5 grid gap-3">
            <div className="flex items-center justify-between text-sm font-black">
              <span>{simIndex + 1} de {simSession.length} · {currentSimQuestion.materia || "Sem matéria"}</span>
              <span>{currentSimQuestion.tema}</span>
            </div>
            <div className="grid min-h-48 content-center rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 dark:border-fuchsia-400/30 dark:from-violet-500/10 dark:to-fuchsia-500/10">
              <span className="text-xs font-black uppercase tracking-wider text-fuchsia-600">{showSimAnswer ? "Resposta e explicação" : "Questão errada"}</span>
              <p className="mt-4 whitespace-pre-wrap text-base font-black text-violet-950 dark:text-violet-50">{showSimAnswer ? `${currentSimQuestion.resposta || "Sem resposta registrada."}${currentSimQuestion.revisao ? `\n\nPor que errei: ${currentSimQuestion.revisao}` : ""}` : currentSimQuestion.erro}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setShowSimAnswer((value) => !value)}>{showSimAnswer ? "Ver questão" : "Revelar resposta"}</button>
              <button className="btn-secondary" disabled={simIndex >= simSession.length - 1} onClick={nextSimQuestion}>Próxima</button>
            </div>
          </div>
        ) : (
          <Empty text="Escolha as matérias, a quantidade e inicie um simulado com suas questões erradas." />
        )}
      </section>

      <section className="grid gap-6">
        <StudyCard
          title="Revisar flashcards"
          area={flashArea}
          setArea={setFlashArea}
          mode={flashMode}
          setMode={setFlashMode}
          modes={["Revisões de hoje/atrasadas", "Todos os flashcards"]}
          onShuffle={startFlashSession}
          current={currentFlashcard}
          index={flashIndex}
          total={flashSession.length}
          showAnswer={showFlashAnswer}
          setShowAnswer={setShowFlashAnswer}
          question={currentFlashcard?.pergunta}
          answer={currentFlashcard?.resposta || ""}
          image={currentFlashcard?.imagem || ""}
          onPrevious={previousFlashcard}
          onNext={nextFlashcard}
          disablePrevious={flashIndex === 0}
          disableNext={flashIndex >= flashSession.length - 1}
          onDelete={currentFlashcard ? () => removeFlashcard(currentFlashcard.id) : undefined}
          onRate={rateFlashcard}
          empty="Escolha uma matéria e clique em Embaralhar para revisar seus flashcards."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ListPanel title="Erros cadastrados" items={notes.map((note) => ({ id: note.id, title: note.tema, detail: `${note.materia || "Sem matéria"} · próxima revisão ${new Date(note.data || note.createdAt).toLocaleDateString("pt-BR")}` }))} onDelete={removeNote} />
        <ListPanel title="Flashcards cadastrados" items={flashcards.map((card) => ({ id: card.id, title: card.pergunta, detail: `${card.materia || "Sem matéria"} · próxima revisão ${new Date(card.dueDate || card.createdAt).toLocaleDateString("pt-BR")}` }))} onDelete={removeFlashcard} />
      </section>
    </div>
  );
}

function StudyCard({ title, area, setArea, mode, setMode, modes, onShuffle, current, index, total, showAnswer, setShowAnswer, question, answer, image, onPrevious, onNext, disablePrevious, disableNext, onDelete, onMakeFlashcard, onRate, empty }: {
  title: string;
  area: string;
  setArea: (value: string) => void;
  mode: string;
  setMode: (value: string) => void;
  modes: string[];
  onShuffle: () => void;
  current: unknown;
  index: number;
  total: number;
  showAnswer: boolean;
  setShowAnswer: (value: boolean | ((current: boolean) => boolean)) => void;
  question?: string;
  answer: string;
  image?: string;
  onPrevious: () => void;
  onNext: () => void;
  disablePrevious: boolean;
  disableNext: boolean;
  onDelete?: () => void;
  onMakeFlashcard?: () => void;
  onRate: (label: string, days: number) => void;
  empty: string;
}) {
  return (
    <article className="card p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <select className="input" value={area} onChange={(event) => setArea(event.target.value)}>
          <option>Todas as matérias</option>
          {areas.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="input" value={mode} onChange={(event) => setMode(event.target.value)}>{modes.map((item) => <option key={item}>{item}</option>)}</select>
        <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={onShuffle}><Shuffle size={16} /> Embaralhar</button>
      </div>
      {current ? (
        <div className="mt-5 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-violet-950 dark:text-violet-100">
            <span>{index + 1} de {total}</span>
            <div className="flex gap-2">
              {onMakeFlashcard && <button className="btn-secondary px-3" onClick={onMakeFlashcard}>Criar flashcard</button>}
              {onDelete && <button className="btn-secondary px-3" onClick={onDelete}><Trash2 size={16} /></button>}
            </div>
          </div>
          <div className="grid min-h-56 content-center rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 dark:border-fuchsia-400/30 dark:from-violet-500/10 dark:to-fuchsia-500/10">
            <span className="text-xs font-black uppercase tracking-wider text-fuchsia-600">{showAnswer ? "Resposta e explicação" : "Pergunta"}</span>
            <p className="mt-4 whitespace-pre-wrap text-base font-black text-violet-950 dark:text-violet-50">{showAnswer ? answer : question}</p>
            {image && !showAnswer && <img className="mt-4 max-h-64 rounded-xl border border-slate-200 object-contain dark:border-white/10" src={image} alt="" />}
          </div>
          {showAnswer && (
            <div className="grid gap-2 md:grid-cols-4">
              <button className="btn-secondary min-h-16" onClick={() => onRate("Muito difícil", 1)}>Muito difícil<br /><span className="text-xs">amanhã</span></button>
              <button className="btn-secondary min-h-16" onClick={() => onRate("Difícil", 3)}>Difícil<br /><span className="text-xs">3 dias</span></button>
              <button className="btn-secondary min-h-16" onClick={() => onRate("Médio", 7)}>Médio<br /><span className="text-xs">7 dias</span></button>
              <button className="btn-primary min-h-16 bg-red-700 hover:bg-red-800" onClick={() => onRate("Fácil", 14)}>Fácil<br /><span className="text-xs">14 dias</span></button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={disablePrevious} onClick={onPrevious}>Anterior</button>
            <button className="btn-secondary" onClick={() => setShowAnswer((value) => !value)}>{showAnswer ? "Ver pergunta" : "Virar card"}</button>
            <button className="btn-secondary" disabled={disableNext} onClick={onNext}>Próximo</button>
          </div>
        </div>
      ) : (
        <Empty text={empty} />
      )}
    </article>
  );
}

function ListPanel({ title, items, onDelete }: { title: string; items: { id: string; title: string; detail: string }[]; onDelete: (id: string) => void }) {
  return (
    <article className="card p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 grid gap-2">
        {items.slice(0, 12).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <span><strong>{item.title}</strong><span className="block text-slate-500">{item.detail}</span></span>
            <button className="btn-secondary px-3" onClick={() => onDelete(item.id)}><Trash2 size={16} /></button>
          </div>
        ))}
        {!items.length && <Empty text="Nada cadastrado ainda." />}
      </div>
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
