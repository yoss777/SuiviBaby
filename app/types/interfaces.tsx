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

