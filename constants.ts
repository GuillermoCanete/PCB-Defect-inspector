
export const DEFECT_TYPES = [
  { id: 'faltante', label: 'Faltante', color: 'bg-red-500' },
  { id: 'malInsertado', label: 'Mal Insertado', color: 'bg-orange-500' },
  { id: 'equivocado', label: 'Equivocado', color: 'bg-yellow-500' },
  { id: 'levantado', label: 'Levantado', color: 'bg-blue-500' },
  { id: 'invertido', label: 'Invertido', color: 'bg-purple-500' }
] as const;

export const GENERIC_DEFECTS = [
  { id: 'Corto', label: 'Corto', color: 'bg-emerald-600', icon: 'fa-bolt' },
  { id: 'Inundado', label: 'Inundado', color: 'bg-cyan-600', icon: 'fa-droplet' }
] as const;
