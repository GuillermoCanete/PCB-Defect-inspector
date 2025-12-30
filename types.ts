
export type Side = 'A' | 'B';
export type ComponentType = 'IA' | 'IM';

export interface DefectEvent {
  type: string;
  timestamp: number;
  serialNumber?: string;
  confirmed?: boolean;
}

export interface DefectCounts {
  faltante: number;
  malInsertado: number;
  equivocado: number;
  levantado: number;
  invertido: number;
  corto: number;
  ict: number;
}

export interface ComponentMarker {
  id: string;
  name: string;
  type: ComponentType;
  x: number; 
  y: number; 
  side: Side;
  counts: DefectCounts;
  history: DefectEvent[];
  scale?: number;
  /* threshold for visual inspection sensitivity */
  threshold?: number;
}

export interface GenericDefectMarker {
  id: string;
  type: 'Corto' | 'Inundado' | 'Fisura' | 'HotMelt';
  x: number;
  y: number;
  side: Side;
  count: number;
  history: (number | DefectEvent)[];
  scale?: number;
}

export interface Board {
  id: string;
  name: string;
  imageA: string | null;
  imageB: string | null;
  goldenA?: string | null; // Imagen de referencia perfecta
  goldenB?: string | null;
  components: ComponentMarker[];
  genericMarkers: GenericDefectMarker[];
  createdAt: number;
}
