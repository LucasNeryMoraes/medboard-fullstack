"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TabKey } from "@/types/schedule";

type Board = Record<string, Record<string, string>>;

type MedboardState = {
  tab: TabKey;
  search: string;
  week: string;
  discipline: string;
  type: string;
  doneIds: string[];
  board: Board;
  onboardingDone: boolean;
  setTab: (tab: TabKey) => void;
  setFilter: (key: "search" | "week" | "discipline" | "type", value: string) => void;
  toggleDone: (id: string) => void;
  resetProgress: () => void;
  setBoardField: (week: string, field: string, value: string) => void;
  fillBoardTemplate: (week: string) => void;
  finishOnboarding: () => void;
};

const days = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
const shifts = ["manha", "tarde", "noite"];

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
      onboardingDone: false,
      setTab: (tab) => set({ tab }),
      setFilter: (key, value) => set({ [key]: value }),
      toggleDone: (id) =>
        set((state) => ({
          doneIds: state.doneIds.includes(id) ? state.doneIds.filter((item) => item !== id) : [...state.doneIds, id]
        })),
      resetProgress: () => set({ doneIds: [] }),
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
