
export type Side = 'A' | 'B';
export type ComponentType = 'IA' | 'IM';

export interface DefectEvent {
  type: string;
  timestamp: number;
}

export interface DefectCounts {
  faltante: number;
  malInsertado: number;
  equivocado: number;
  levantado: number;
  invertido: number;
}

export interface ComponentMarker {
  id: string;
  name: string;
  type: ComponentType;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  side: Side;
  counts: DefectCounts;
  history: DefectEvent[];
  scale?: number;
}

export interface GenericDefectMarker {
  id: string;
  type: 'Corto' | 'Inundado';
  x: number;
  y: number;
  side: Side;
  count: number;
  history: number[]; // timestamps
  scale?: number;
}

export interface Board {
  id: string;
  name: string;
  imageA: string | null;
  imageB: string | null;
  components: ComponentMarker[];
  genericMarkers: GenericDefectMarker[];
  createdAt: number;
}

export interface AppConfig {
  boards: Board[];
  activeBoardId: string | null;
}
