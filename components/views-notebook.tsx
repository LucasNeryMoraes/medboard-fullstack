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
  deck: "",
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
  const [quizArea, setQuizArea] = useState("Todas as áreas");
  const [quizLimit, setQuizLimit] = useState("10");
  const [quizItems, setQuizItems] = useState<Note[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

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
    return areas
      .map((area) => ({ name: area, materia: area, count: notes.filter((note) => note.materia === area).length, auto: true }))
      .filter((deck) => deck.count > 0);
  }, [notes]);

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
  const currentQuiz = quizItems[quizIndex];

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
    if (!cardForm.deck) {
      toast.error("Crie ou selecione um baralho primeiro.");
      return;
    }
    if (!cardForm.pergunta.trim() || !cardForm.resposta.trim()) {
      toast.error("Preencha frente e verso do flashcard.");
      return;
    }
    const saved = await api<Flashcard>("/api/flashcards", {
      method: "POST",
      body: JSON.stringify({
        pergunta: cardForm.pergunta,
        resposta: cardForm.resposta,
        materia: cardForm.materia,
        deck: cardForm.deck,
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

  function startQuiz(asFlashcards = false) {
    const source = notes.filter((note) => quizArea === "Todas as áreas" || note.materia === quizArea);
    const shuffled = [...source].sort(() => Math.random() - 0.5).slice(0, Math.max(1, Number(quizLimit || 10)));
    setQuizItems(shuffled);
    setQuizIndex(0);
    setShowAnswer(asFlashcards);
    if (!shuffled.length) toast.error("Cadastre questões no caderno primeiro.");
  }

  function nextQuiz() {
    setShowAnswer(false);
    setQuizIndex((current) => Math.min(current + 1, Math.max(quizItems.length - 1, 0)));
  }

  async function markReviewed() {
    if (!currentQuiz) return;
    await api(`/api/errors/${currentQuiz.id}`, { method: "PATCH", body: JSON.stringify({ data: new Date(), dificuldade: "Revisado" }) });
    toast.success("Revisão marcada");
    nextQuiz();
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
        <div className="mt-4 flex flex-wrap gap-2">
          <select className="input max-w-48" value={quizArea} onChange={(event) => setQuizArea(event.target.value)}>
            <option>Todas as áreas</option>
            {areas.map((area) => <option key={area}>{area}</option>)}
          </select>
          <input className="input max-w-56" type="number" min="1" placeholder="Quantidade de questões" value={quizLimit} onChange={(event) => setQuizLimit(event.target.value)} />
          <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={() => startQuiz(false)}>Iniciar simulado</button>
          <button className="btn-secondary" onClick={() => startQuiz(true)}>Revisar como flashcards</button>
        </div>
        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-5 dark:border-violet-400/20 dark:bg-violet-500/10">
          {currentQuiz ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-500">Questão {quizIndex + 1} de {quizItems.length}</span>
                <span className="badge">{currentQuiz.materia}</span>
              </div>
              <h3 className="text-lg font-black">{currentQuiz.tema}</h3>
              <p className="whitespace-pre-wrap text-sm">{currentQuiz.erro}</p>
              {currentQuiz.imagem && <img className="max-h-64 rounded-xl border border-slate-200 object-contain dark:border-white/10" src={currentQuiz.imagem} alt="" />}
              {showAnswer && <div className="rounded-xl bg-white p-4 text-sm shadow-sm dark:bg-slate-900"><strong>Resposta:</strong><p className="mt-2 whitespace-pre-wrap">{currentQuiz.resposta || currentQuiz.flashcard || "Sem resposta registrada."}</p></div>}
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => setShowAnswer((value) => !value)}>{showAnswer ? "Ocultar resposta" : "Revelar resposta"}</button>
                <button className="btn-primary bg-red-700 hover:bg-red-800" onClick={markReviewed}>Marcar revisada</button>
                <button className="btn-secondary" onClick={nextQuiz}>Próxima</button>
              </div>
            </div>
          ) : (
            <Empty text={'Nenhum simulado iniciado. Cadastre questões no caderno de erros e clique em "Iniciar simulado".'} />
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
          <div className="mt-4 grid gap-2">
            {deckOptions.map((deck) => <ItemRow key={`${deck.auto ? "auto" : "manual"}-${deck.name}`} title={deck.name} detail={`${deck.count} flashcard(s) · ${deck.materia}`} />)}
            {!deckOptions.length && <Empty text="Nenhum baralho ainda. Salve erros no caderno de erros para criar baralhos automáticos por matéria." />}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="text-lg font-black">Novo flashcard manual</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <select className="input" value={cardForm.deck} onChange={(event) => setCardForm({ ...cardForm, deck: event.target.value })}>
              <option value="">Crie um baralho manual primeiro</option>
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
          <div className="mt-5 grid gap-3">
            {filteredFlashcards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div><strong>{card.pergunta}</strong><p className="text-sm text-slate-500">{card.deck || "Manual"} · {card.materia || "Sem matéria"}{card.tag ? ` · ${card.tag}` : ""}</p></div>
                  <button className="btn-secondary px-3" onClick={() => removeFlashcard(card.id)}><Trash2 size={16} /></button>
                </div>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{card.resposta}</p>
                {card.imagem && <img className="mt-3 max-h-48 rounded-xl border border-slate-200 object-contain dark:border-white/10" src={card.imagem} alt="" />}
              </div>
            ))}
            {!filteredFlashcards.length && <Empty text="Nenhum flashcard vencido ou previsto para hoje. Para estudar mesmo assim, selecione Todos os flashcards." />}
          </div>
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
