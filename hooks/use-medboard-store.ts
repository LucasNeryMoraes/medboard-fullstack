"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TabKey } from "@/types/schedule";

type Board = Record<string, Record<string, string>>;
export type LessonQuestionState = Record<string, { done: boolean; feitas: number; acertos: number; erros: number; observacoes: string }>;
export type ExtraStudy = { id: string; titulo: string; materia: string; data: string; horas: number };
export type ReviewTarget = { source: "error-note" | "flashcard"; sourceId: string; materia?: string | null; taskId?: string; externalId?: string | null } | null;

type MedboardState = {
  tab: TabKey;
  search: string;
  week: string;
  discipline: string;
  type: string;
  doneIds: string[];
  board: Board;
  lessonQuestions: LessonQuestionState;
  extraStudies: ExtraStudy[];
  reviewTarget: ReviewTarget;
  onboardingDone: boolean;
  setTab: (tab: TabKey) => void;
  setReviewTarget: (target: ReviewTarget) => void;
  setFilter: (key: "search" | "week" | "discipline" | "type", value: string) => void;
  toggleDone: (id: string) => void;
  setDoneIds: (ids: string[]) => void;
  resetProgress: () => void;
  setLessonQuestion: (lessonId: string, value: Partial<LessonQuestionState[string]>) => void;
  setLessonQuestions: (items: LessonQuestionState) => void;
  addExtraStudy: (study: ExtraStudy) => void;
  setExtraStudies: (studies: ExtraStudy[]) => void;
  setBoardField: (week: string, field: string, value: string) => void;
  fillBoardTemplate: (week: string) => void;
  finishOnboarding: () => void;
};

const days = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
const shifts = ["manha", "tarde", "noite"];
const emptyLessonQuestion = () => ({ done: false, feitas: 0, acertos: 0, erros: 0, observacoes: "" });

export const useMedboardStore = create<MedboardState>()(
  persist(
    (set) => ({
      tab: "dashboard",
      search: "",
      week: "",
      discipline: "",
      type: "",
      doneIds: [],
      board: {},
      lessonQuestions: {},
      extraStudies: [],
      reviewTarget: null,
      onboardingDone: false,
      setTab: (tab) => set({ tab }),
      setReviewTarget: (reviewTarget) => set({ reviewTarget }),
      setFilter: (key, value) => set({ [key]: value }),
      toggleDone: (id) =>
        set((state) => ({
          doneIds: state.doneIds.includes(id) ? state.doneIds.filter((item) => item !== id) : [...state.doneIds, id]
        })),
      setDoneIds: (ids) => set({ doneIds: [...new Set(ids)] }),
      resetProgress: () => set({ doneIds: [] }),
      setLessonQuestion: (lessonId, value) =>
        set((state) => ({
          lessonQuestions: {
            ...state.lessonQuestions,
            [lessonId]: Object.assign(emptyLessonQuestion(), state.lessonQuestions[lessonId] || {}, value)
          }
        })),
      setLessonQuestions: (items) => set({ lessonQuestions: items }),
      addExtraStudy: (study) => set((state) => ({ extraStudies: [study, ...state.extraStudies] })),
      setExtraStudies: (studies) => set({ extraStudies: studies }),
      setBoardField: (week, field, value) =>
        set((state) => ({ board: { ...state.board, [week]: { ...(state.board[week] || {}), [field]: value } } })),
      fillBoardTemplate: (week) =>
        set((state) => {
          const template: Record<string, string> = {};
          days.forEach((day) =>
            shifts.forEach((shift) => {
              template[`${day}_${shift}`] =
                day === "domingo" ? (shift === "manha" ? "Livre / descanso" : "") : shift === "noite" ? "Aula:\nMedCof:\nQuestões:" : "Internato:\nEstudo:";
            })
          );
          return { board: { ...state.board, [week]: { ...template, ...(state.board[week] || {}) } } };
        }),
      finishOnboarding: () => set({ onboardingDone: true })
    }),
    { name: "medboard-fullstack-state-v1" }
  )
);
