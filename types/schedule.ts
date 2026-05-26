export type ScheduleLesson = {
  id: string;
  data: string;
  dataBR: string;
  diaSemana: string;
  semana: string;
  horario: string;
  disciplina: string;
  aula: string;
};

export type ScheduleReview = {
  id: string;
  tipoRevisao: string;
  disciplina: string;
  aula: string;
  dataOriginal: string;
  semanaOriginal: string;
};

export type ScheduleRow = {
  row: number;
  semana: string;
  data: string;
  dataBR: string;
  diaSemana: string;
  horario: string;
  disciplina: string;
  assunto: string;
  tipo: "aula" | "revisao" | "simulado" | "livre";
  domingo: boolean;
  aulas: ScheduleLesson[];
  revisoesDoDia: ScheduleReview[];
};

export type ScheduleData = {
  rows: ScheduleRow[];
  disciplinas: string[];
  semanas: string[];
  stats: {
    totalDias: number;
    totalAulas: number;
    totalRevisoes: number;
    inicio: string;
    fim: string;
  };
};

export type TabKey = "dashboard" | "cronograma" | "simulados" | "caderno";
