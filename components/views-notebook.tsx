"use client";

import { useEffect, useMemo, useState } from "react";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
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
  deck: areas[0],
  materia: areas[0],
  tag: "",
  pergunta: "",
  resposta: "",
  imagem: ""
};

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

function compactDate(value: string | Date) {
  return new Date(value).toLocaleDateString("sv-SE");
}

export function NotebookView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [manualDecks, setManualDecks] = useState<{ name: string; materia: string }[]>([]);
  const [deckForm, setDeckForm] = useState({ name: "", materia: areas[0] });
  const [noteForm, setNoteForm] = useState(emptyNote);
  const [cardForm, setCardForm] = useState(emptyCard);
  const [deckFilter, setDeckFilter] = useState("Todos os baralhos");
  const [areaFilter, setAreaFilter] = useState("Todas as matérias");
  const [reviewFilter, setReviewFilter] = useState("Somente revisões de hoje/atrasadas");
  const [quizDeckFilter, setQuizDeckFilter] = useState("Todos os baralhos");
  const [quizAreaFilter, setQuizAreaFilter] = useState("Todas as matérias");
  const [quizReviewFilter, setQuizReviewFilter] = useState("Somente revisões de hoje/atrasadas");
  const [quizIndex, setQuizIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [showFlashcardAnswer, setShowFlashcardAnswer] = useState(false);

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

  const automaticDecks = useMemo(() => {
    return areas.map((area) => ({
      name: area,
      materia: area,
      count: notes.filter((note) => note.materia === area).length + flashcards.filter((card) => card.materia === area || card.deck === area).length,
      auto: true
    }));
  }, [notes, flashcards]);

  const savedManualDecks = useMemo(() => {
    const map = new Map<string, { name: string; materia: string; count: number; auto: boolean }>();
    flashcards.forEach((card) => {
      const name = card.deck || "Manual";
      const current = map.get(name) || { name, materia: card.materia || "Sem matéria", count: 0, auto: false };
      current.count += 1;
      map.set(name, current);
    });
    manualDecks.forEach((deck) => {
      if (!map.has(deck.name)) map.set(deck.name, { ...deck, count: 0, auto: false });
    });
    return [...map.values()];
  }, [flashcards, manualDecks]);

  const deckOptions = [...automaticDecks, ...savedManualDecks];
  const today = todayISO();
  const filteredFlashcards = flashcards.filter((card) => {
    const deckOk = deckFilter === "Todos os baralhos" || (card.deck || "Manual") === deckFilter;
    const areaOk = areaFilter === "Todas as matérias" || card.materia === areaFilter;
    const reviewOk = reviewFilter !== "Somente revisões de hoje/atrasadas" || compactDate(card.dueDate) <= today;
    return deckOk && areaOk && reviewOk;
  });
  const currentFlashcard = filteredFlashcards[flashcardIndex];
  const quizItems = notes.filter((note) => {
    const noteDeck = note.materia || "Sem matéria";
    const deckOk = quizDeckFilter === "Todos os baralhos" || noteDeck === quizDeckFilter;
    const areaOk = quizAreaFilter === "Todas as matérias" || note.materia === quizAreaFilter;
    const reviewOk = quizReviewFilter !== "Somente revisões de hoje/atrasadas" || compactDate(note.data || note.createdAt) <= today;
    return deckOk && areaOk && reviewOk;
  });
  const currentQuiz = quizItems[quizIndex];

  useEffect(() => {
    setQuizIndex(0);
    setShowAnswer(false);
  }, [quizDeckFilter, quizAreaFilter, quizReviewFilter, notes.length]);

  useEffect(() => {
    setFlashcardIndex(0);
    setShowFlashcardAnswer(false);
  }, [deckFilter, areaFilter, reviewFilter, flashcards.length]);

  async function createDeck() {
    const name = deckForm.name.trim();
    if (!name) {
      toast.error("Informe o nome do baralho.");
      return;
    }
    setManualDecks((current) => current.some((deck) => deck.name === name) ? current : [...current, { name, materia: deckForm.materia }]);
    setCardForm((current) => ({ ...current, deck: name, materia: deckForm.materia }));
    setDeckForm({ name: "", materia: deckForm.materia });
    toast.success("Baralho manual criado");
  }

  async function saveFlashcard() {
    if (!cardForm.pergunta.trim() || !cardForm.resposta.trim()) {
      toast.error("Preencha frente e verso do flashcard.");
      return;
    }
    const saved = await api<Flashcard>("/api/flashcards", {
      method: "POST",
      body: JSON.stringify({
        pergunta: cardForm.pergunta,
        resposta: cardForm.resposta,
        materia: cardForm.materia || cardForm.deck,
        deck: cardForm.deck || cardForm.materia,
        tag: cardForm.tag,
        imagem: cardForm.imagem || undefined
      })
    });
    setFlashcards((current) => [saved, ...current]);
    setCardForm((current) => ({ ...emptyCard, deck: current.deck, materia: current.materia }));
    toast.success("Flashcard adicionado");
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

  function prepareFlashcardFromError() {
    setCardForm({
      deck: noteForm.materia || areas[0],
      materia: noteForm.materia || areas[0],
      tag: noteForm.tema,
      pergunta: noteForm.erro,
      resposta: noteForm.resposta || noteForm.revisao,
      imagem: noteForm.imagem
    });
    toast.success("Modo flashcard preparado");
  }

  async function removeNote(id: string) {
    await api(`/api/errors/${id}`, { method: "DELETE" });
    setNotes((current) => current.filter((note) => note.id !== id));
    toast.success("Erro removido");
  }

  async function removeFlashcard(id: string) {
    await api(`/api/flashcards/${id}`, { method: "DELETE" });
    setFlashcards((current) => current.filter((card) => card.id !== id));
    toast.success("Flashcard removido");
  }

  function nextQuiz() {
    setShowAnswer(false);
    setQuizIndex((current) => Math.min(current + 1, Math.max(quizItems.length - 1, 0)));
  }

  function previousQuiz() {
    setShowAnswer(false);
    setQuizIndex((current) => Math.max(current - 1, 0));
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

  async function markReviewed(label = "Revisado", days = 1) {
    if (!currentQuiz) return;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + days);
    const updated = await api<Note>(`/api/errors/${currentQuiz.id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: nextDate, dificuldade: label })
    });
    await createScheduleReview({
      id: currentQuiz.id,
      title: currentQuiz.tema || currentQuiz.erro.slice(0, 80),
      materia: currentQuiz.materia,
      date: nextDate,
      source: "error-note",
      difficulty: label
    });
    setNotes((current) => current.map((note) => note.id === updated.id ? updated : note));
    toast.success("Revisão adicionada ao cronograma");
    nextQuiz();
  }

  function nextFlashcard() {
    setShowFlashcardAnswer(false);
    setFlashcardIndex((current) => Math.min(current + 1, Math.max(filteredFlashcards.length - 1, 0)));
  }

  function previousFlashcard() {
    setShowFlashcardAnswer(false);
    setFlashcardIndex((current) => Math.max(current - 1, 0));
  }

  async function rateFlashcard(label: string, days: number) {
    if (!currentFlashcard) return;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + days);
    const updated = await api<Flashcard>(`/api/flashcards/${currentFlashcard.id}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: nextDate })
    });
    await createScheduleReview({
      id: currentFlashcard.id,
      title: currentFlashcard.tag || currentFlashcard.pergunta.slice(0, 80),
      materia: currentFlashcard.materia || currentFlashcard.deck,
      date: nextDate,
      source: "flashcard",
      difficulty: label
    });
    setFlashcards((current) => current.map((card) => card.id === updated.id ? updated : card));
    toast.success("Flashcard agendado no cronograma");
    nextFlashcard();
  }

  function editCurrentQuiz() {
    if (!currentQuiz) return;
    setNoteForm({
      materia: currentQuiz.materia || areas[0],
      tema: currentQuiz.tema,
      erro: currentQuiz.erro,
      resposta: currentQuiz.resposta || "",
      revisao: currentQuiz.revisao || "",
      imagem: currentQuiz.imagem || "",
      data: compactDate(currentQuiz.data || currentQuiz.createdAt),
      dificuldade: currentQuiz.dificuldade || "Dificuldade baixa"
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <h2 className="text-xl font-black">Caderno de erros</h2>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <select className="input" value={noteForm.materia} onChange={(event) => setNoteForm({ ...noteForm, materia: event.target.value })}>
              {areas.map((area) => <option key={area}>{area}</option>)}
            </select>
            <input className="input" placeholder="Assunto / tema da questão" value={noteForm.tema} onChange={(event) => setNoteForm({ ...noteForm, tema: event.target.value })} />
          </div>
          <textarea className="input min-h-28" placeholder="Cole aqui a questão que você errou ou um resumo dela" value={noteForm.erro} onChange={(event) => setNoteForm({ ...noteForm, erro: event.target.value })} />
          <textarea className="input min-h-24" placeholder="Resposta correta / explicação resumida" value={noteForm.resposta} onChange={(event) => setNoteForm({ ...noteForm, resposta: event.target.value })} />
          <textarea className="input min-h-24" placeholder="Por que eu errei? Ex.: falta de conteúdo, pegadinha, distração, confundi conduta..." value={noteForm.revisao} onChange={(event) => setNoteForm({ ...noteForm, revisao: event.target.value })} />
          <ImageUpload label="Imagem da questão ou explicação (opcional)" onImage={(imagem) => setNoteForm({ ...noteForm, imagem })} />
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input" type="date" value={noteForm.data} onChange={(event) => setNoteForm({ ...noteForm, data: event.target.value })} />
            <select className="input" value={noteForm.dificuldade} onChange={(event) => setNoteForm({ ...noteForm, dificuldade: event.target.value })}>
              <option>Dificuldade baixa</option>
              <option>Dificuldade média</option>
              <option>Dificuldade alta</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={saveNote}>Salvar erro</button>
            <button className="btn-secondary" onClick={prepareFlashcardFromError}>Modo flashcard</button>
          </div>
          <div className="mt-3 grid gap-3">
            {notes.slice(0, 6).map((note) => (
              <ItemRow key={note.id} title={note.tema} detail={`${note.materia || "Sem matéria"} · ${note.dificuldade || "Sem dificuldade"}`} onRemove={() => removeNote(note.id)} />
            ))}
            {!notes.length && <Empty text="Nenhum erro registrado ainda." />}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-2xl font-black">Simulado do caderno de erros</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Use suas próprias questões erradas para revisar. O site embaralha os itens do caderno de erros, mostra a questão, revela a resposta correta e permite marcar se você acertou ou errou na revisão.</p>
        <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <div className="grid gap-3 md:grid-cols-2">
            <select className="input" value={quizDeckFilter} onChange={(event) => setQuizDeckFilter(event.target.value)}>
              <option>Todos os baralhos</option>
              {automaticDecks.map((deck) => <option key={deck.name}>{deck.name}</option>)}
            </select>
            <select className="input" value={quizAreaFilter} onChange={(event) => setQuizAreaFilter(event.target.value)}>
              <option>Todas as matérias</option>
              {areas.map((area) => <option key={area}>{area}</option>)}
            </select>
            <select className="input" value={quizReviewFilter} onChange={(event) => setQuizReviewFilter(event.target.value)}>
              <option>Somente revisões de hoje/atrasadas</option>
              <option>Todos os erros</option>
            </select>
          </div>

          {currentQuiz ? (
            <div className="mt-4 grid gap-3">
              <strong className="text-sm text-violet-950 dark:text-violet-100">
                {quizIndex + 1} de {quizItems.length} • {currentQuiz.materia || "Sem matéria"} • {currentQuiz.materia || "automático"} • automático • {currentQuiz.tema || "Sem assunto"}
              </strong>
              <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 text-sm text-violet-950 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100">
                <p><strong>Status:</strong> {compactDate(currentQuiz.data || currentQuiz.createdAt) <= today ? "para revisar hoje" : `próxima revisão em ${new Date(currentQuiz.data).toLocaleDateString("pt-BR")}`}</p>
                <p className="mt-2">{currentQuiz.dificuldade === "Revisado" ? "Revisado anteriormente." : "Ainda não revisado."}</p>
              </div>
              <div className="grid min-h-56 content-center rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 dark:border-fuchsia-400/30 dark:from-violet-500/10 dark:to-fuchsia-500/10">
                <span className="text-xs font-black uppercase tracking-wider text-fuchsia-600">{showAnswer ? "Verso do flashcard" : "Frente do flashcard"}</span>
                <p className="mt-4 whitespace-pre-wrap text-base font-black text-violet-950 dark:text-violet-50">{showAnswer ? (currentQuiz.resposta || currentQuiz.flashcard || "Sem resposta registrada.") : currentQuiz.erro}</p>
                {currentQuiz.imagem && !showAnswer && <img className="mt-4 max-h-64 rounded-xl border border-slate-200 object-contain dark:border-white/10" src={currentQuiz.imagem} alt="" />}
              </div>
              {showAnswer && (
                <div className="grid gap-2 md:grid-cols-4">
                  <button className="btn-secondary min-h-16" onClick={() => markReviewed("Muito difícil", 1)}>Muito difícil<br /><span className="text-xs">rever amanhã</span></button>
                  <button className="btn-secondary min-h-16" onClick={() => markReviewed("Difícil", 3)}>Difícil<br /><span className="text-xs">intervalo curto</span></button>
                  <button className="btn-secondary min-h-16" onClick={() => markReviewed("Médio", 7)}>Médio<br /><span className="text-xs">intervalo médio</span></button>
                  <button className="btn-primary min-h-16 bg-red-700 hover:bg-red-800" onClick={() => markReviewed("Fácil", 14)}>Fácil<br /><span className="text-xs">intervalo maior</span></button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={previousQuiz} disabled={quizIndex === 0}>Anterior</button>
                <button className="btn-secondary" onClick={() => setShowAnswer((value) => !value)}>{showAnswer ? "Ver frente" : "Virar card"}</button>
                <button className="btn-secondary" onClick={nextQuiz} disabled={quizIndex >= quizItems.length - 1}>Próximo</button>
                <button className="btn-secondary" onClick={editCurrentQuiz}>Editar erro</button>
                <button className="btn-secondary" onClick={() => removeNote(currentQuiz.id)}>Excluir erro</button>
              </div>
            </div>
          ) : (
            <Empty text="Nenhum flashcard vencido ou previsto para hoje. Para estudar mesmo assim, selecione Todos os erros." />
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-black">Flashcards do caderno de erros</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Baralhos por matéria, flashcards manuais, imagens e revisão espaçada ficam concentrados aqui.</p>
        <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="text-lg font-black">Baralhos manuais extras</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input className="input" placeholder="Nome do baralho. Ex.: Cardiologia" value={deckForm.name} onChange={(event) => setDeckForm({ ...deckForm, name: event.target.value })} />
            <select className="input" value={deckForm.materia} onChange={(event) => setDeckForm({ ...deckForm, materia: event.target.value })}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
            <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={createDeck}>Criar baralho manual</button>
          </div>
          <p className="mt-3 text-sm text-slate-500">Os baralhos das grandes áreas são criados automaticamente. Você pode estudar qualquer baralho quando quiser usando os filtros abaixo.</p>
          <div className="mt-4 grid gap-2">
            {deckOptions.map((deck) => <ItemRow key={`${deck.auto ? "auto" : "manual"}-${deck.name}`} title={deck.name} detail={`${deck.count} flashcard(s) · ${deck.materia}`} />)}
            {!deckOptions.length && <Empty text="Nenhum baralho ainda. Salve erros no caderno de erros para criar baralhos automáticos por matéria." />}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="text-lg font-black">Novo flashcard manual</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <select className="input" value={cardForm.deck} onChange={(event) => setCardForm({ ...cardForm, deck: event.target.value })}>
              <option value="">Selecione um baralho</option>
              {deckOptions.map((deck) => <option key={deck.name}>{deck.name}</option>)}
            </select>
            <input className="input" placeholder="Tag opcional. Ex.: arritmias, HAS, neonatologia" value={cardForm.tag} onChange={(event) => setCardForm({ ...cardForm, tag: event.target.value })} />
          </div>
          <textarea className="input mt-3 min-h-24" placeholder="Frente do card manual: pergunta, caso clínico ou conceito" value={cardForm.pergunta} onChange={(event) => setCardForm({ ...cardForm, pergunta: event.target.value })} />
          <textarea className="input mt-3 min-h-24" placeholder="Verso do card: resposta, explicação ou conduta" value={cardForm.resposta} onChange={(event) => setCardForm({ ...cardForm, resposta: event.target.value })} />
          <div className="mt-3">
            <ImageUpload label="Imagem do flashcard (opcional)" onImage={(imagem) => setCardForm({ ...cardForm, imagem })} />
          </div>
          <button className="btn-primary mt-3 bg-red-700 hover:bg-red-800" onClick={saveFlashcard}>Adicionar flashcard</button>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="text-lg font-black">Estudar flashcards</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <select className="input" value={deckFilter} onChange={(event) => setDeckFilter(event.target.value)}>
              <option>Todos os baralhos</option>
              {deckOptions.map((deck) => <option key={deck.name}>{deck.name}</option>)}
            </select>
            <select className="input" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
              <option>Todas as matérias</option>
              {areas.map((area) => <option key={area}>{area}</option>)}
            </select>
            <select className="input" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
              <option>Somente revisões de hoje/atrasadas</option>
              <option>Todos os flashcards</option>
            </select>
          </div>
          {currentFlashcard ? (
            <div className="mt-5 grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-violet-950 dark:text-violet-100">
                <span>{flashcardIndex + 1} de {filteredFlashcards.length} · {currentFlashcard.deck || "Manual"} · {currentFlashcard.materia || "Sem matéria"}</span>
                <button className="btn-secondary px-3" onClick={() => removeFlashcard(currentFlashcard.id)}><Trash2 size={16} /></button>
              </div>
              <div className="grid min-h-56 content-center rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 dark:border-fuchsia-400/30 dark:from-violet-500/10 dark:to-fuchsia-500/10">
                <span className="text-xs font-black uppercase tracking-wider text-fuchsia-600">{showFlashcardAnswer ? "Resposta e explicação" : "Pergunta"}</span>
                <p className="mt-4 whitespace-pre-wrap text-base font-black text-violet-950 dark:text-violet-50">{showFlashcardAnswer ? currentFlashcard.resposta : currentFlashcard.pergunta}</p>
                {currentFlashcard.imagem && !showFlashcardAnswer && <img className="mt-4 max-h-64 rounded-xl border border-slate-200 object-contain dark:border-white/10" src={currentFlashcard.imagem} alt="" />}
              </div>
              {showFlashcardAnswer && (
                <div className="grid gap-2 md:grid-cols-4">
                  <button className="btn-secondary min-h-16" onClick={() => rateFlashcard("Muito difícil", 1)}>Muito difícil<br /><span className="text-xs">rever amanhã</span></button>
                  <button className="btn-secondary min-h-16" onClick={() => rateFlashcard("Difícil", 3)}>Difícil<br /><span className="text-xs">em 3 dias</span></button>
                  <button className="btn-secondary min-h-16" onClick={() => rateFlashcard("Médio", 7)}>Médio<br /><span className="text-xs">em 7 dias</span></button>
                  <button className="btn-primary min-h-16 bg-red-700 hover:bg-red-800" onClick={() => rateFlashcard("Fácil", 14)}>Fácil<br /><span className="text-xs">em 14 dias</span></button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={previousFlashcard} disabled={flashcardIndex === 0}>Anterior</button>
                <button className="btn-secondary" onClick={() => setShowFlashcardAnswer((value) => !value)}>{showFlashcardAnswer ? "Ver pergunta" : "Virar flashcard"}</button>
                <button className="btn-secondary" onClick={nextFlashcard} disabled={flashcardIndex >= filteredFlashcards.length - 1}>Próximo</button>
              </div>
            </div>
          ) : (
            <Empty text="Nenhum flashcard vencido ou previsto para hoje. Para estudar mesmo assim, selecione Todos os flashcards." />
          )}
        </div>
      </section>
    </div>
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

function ItemRow({ title, detail, onRemove }: { title: string; detail: string; onRemove?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
      <span><strong>{title}</strong><span className="block text-slate-500">{detail}</span></span>
      {onRemove ? <button className="btn-secondary px-3" onClick={onRemove}><Trash2 size={16} /></button> : <RotateCcw size={16} className="text-slate-400" />}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">{text}</div>;
}
