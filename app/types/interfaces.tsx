export interface Tetee {
  id: string;
  type?: "seins" | "biberons"; // Optionnel pour éviter les erreurs sur anciennes données
  quantite?: number | null; // Optionnel pour compatibilité
  date: { seconds: number };
  createdAt: { seconds: number };
}

export interface TeteeGroup {
  date: string;
  dateFormatted: string;
  tetees: Tetee[];
  totalQuantity: number;
  lastTetee: Tetee;
}


export interface Miction {
  id: string;
  date: { seconds: number };
  createdAt: { seconds: number };
}

export interface MictionGroup {
  date: string;
  dateFormatted: string;
  mictions: Miction[];
  lastMiction: Miction;
}

export interface Selle {
  id: string;
  date: { seconds: number };
  createdAt: { seconds: number };
}

export interface SelleGroup {
  date: string;
  dateFormatted: string;
  selles: Selle[];
  lastSelle: Selle;
}

export interface Vitamine {
  id: string;
  date: { seconds: number };
  createdAt: { seconds: number };
}

export interface VitamineGroup {
  date: string;
  dateFormatted: string;
  vitamines: Vitamine[];
  lastVitamine: Vitamine;
}

export interface Vaccin {
  id: string;
  lib: string;
  date: { seconds: number };
  createdAt: { seconds: number };
}

export interface VaccinGroup {
  date: string;
  dateFormatted: string;
  vaccins: Vaccin[];
  lastVaccin: Vaccin;
}

