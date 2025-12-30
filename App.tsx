
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Side, ComponentMarker, GenericDefectMarker, ComponentType, DefectCounts, Board, DefectEvent } from './types';
import { GENERIC_DEFECTS, DEFECT_TYPES } from './constants';

const App: React.FC = () => {
  // Persistence state
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  
  // UI state
  const [currentSide, setCurrentSide] = useState<Side>('A');
  const [isAddingComponent, setIsAddingComponent] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  
  // Modals / State
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [showConfirmDeleteHistory, setShowConfirmDeleteHistory] = useState(false);
  const [newBoardData, setNewBoardData] = useState({ name: '', imageA: '', imageB: '' });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, imgX: number, imgY: number } | null>(null);
  const [showCompDialog, setShowCompDialog] = useState<{ imgX: number, imgY: number } | null>(null);
  const [newCompName, setNewCompName] = useState('');
  const [newCompType, setNewCompType] = useState<ComponentType>('IA');
  const [activeCompDetail, setActiveCompDetail] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const currentBoard = useMemo(() => {
    if (!activeBoardId || boards.length === 0) return null;
    return boards.find(b => b.id === activeBoardId) || null;
  }, [boards, activeBoardId]);

  useEffect(() => {
    const saved = localStorage.getItem('pcb_inspector_v11');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.boards && Array.isArray(parsed.boards)) {
          setBoards(parsed.boards);
          if (parsed.activeBoardId) setActiveBoardId(parsed.activeBoardId);
        }
      } catch (e) { console.error("Error al cargar datos", e); }
    }
  }, []);

  // Fix: Wrap localStorage in try/catch to prevent crashes with large base64 images
  useEffect(() => {
    if (boards.length > 0 || activeBoardId === null) {
      try {
        localStorage.setItem('pcb_inspector_v11', JSON.stringify({ boards, activeBoardId }));
      } catch (e) {
        // QuotaExceededError is common with large images
        console.error("Storage Limit Exceeded", e);
        // We don't alert constantly, but this prevents the app from crashing (white/blue screen)
      }
    }
  }, [boards, activeBoardId]);

  const updateBoard = useCallback((updatedBoard: Board) => {
    setBoards(prev => prev.map(b => b.id === updatedBoard.id ? { ...updatedBoard } : b));
  }, []);

  const toggleSide = () => {
    const nextSide = currentSide === 'A' ? 'B' : 'A';
    setCurrentSide(nextSide);
    setActiveCompDetail(null);
    setContextMenu(null);
    setSelectedMarkerId(null);
  };

  const handleBoardSwitch = (id: string) => {
    setActiveCompDetail(null);
    setSelectedMarkerId(null);
    setContextMenu(null);
    setIsAddingComponent(false);
    setActiveBoardId(id);
    setCurrentSide('A');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        setNewBoardData(prev => ({ ...prev, [side === 'A' ? 'imageA' : 'imageB']: data }));
      };
      reader.readAsDataURL(file);
    }
  };

  const saveNewBoard = () => {
    if (!newBoardData.name.trim()) return alert("Nombre obligatorio");
    
    // Safety check for huge images impacting performance
    if ((newBoardData.imageA && newBoardData.imageA.length > 4000000) || (newBoardData.imageB && newBoardData.imageB.length > 4000000)) {
        alert("Advertencia: Las imágenes son muy grandes. Es posible que no se guarden si recarga la página debido a límites del navegador.");
    }

    const newBoard: Board = {
      id: Math.random().toString(36).substr(2, 9),
      name: newBoardData.name,
      imageA: newBoardData.imageA || null,
      imageB: newBoardData.imageB || null,
      components: [],
      genericMarkers: [],
      createdAt: Date.now()
    };
    
    // Critical fix: Ensure state update happens before closing modal
    setBoards(prev => [...prev, newBoard]);
    setActiveBoardId(newBoard.id); // Set ID directly
    setCurrentSide('A');
    setShowNewBoardModal(false);
    setNewBoardData({ name: '', imageA: '', imageB: '' });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!imageRef.current || !currentBoard || isEditMode) return;
    
    setActiveCompDetail(null);
    setSelectedMarkerId(null);

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setContextMenu({ x: e.clientX, y: e.clientY, imgX: x, imgY: y });
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (!imageRef.current || !currentBoard) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    if (isAddingComponent) {
      setShowCompDialog({ imgX: x, imgY: y });
      setIsAddingComponent(false);
    } else if (isEditMode && selectedMarkerId) {
      const updatedComponents = currentBoard.components.map(c => 
        c.id === selectedMarkerId ? { ...c, x, y } : c
      );
      const updatedGenerics = currentBoard.genericMarkers.map(m => 
        m.id === selectedMarkerId ? { ...m, x, y } : m
      );
      updateBoard({ ...currentBoard, components: updatedComponents, genericMarkers: updatedGenerics });
    } else {
      setContextMenu(null);
      setActiveCompDetail(null);
      setSelectedMarkerId(null);
    }
  };

  const createComponent = () => {
    if (!showCompDialog || !newCompName.trim() || !currentBoard) return;
    const newComp: ComponentMarker = {
      id: Math.random().toString(36).substr(2, 9),
      name: newCompName,
      type: newCompType,
      x: showCompDialog.imgX,
      y: showCompDialog.imgY,
      side: currentSide,
      counts: { faltante: 0, malInsertado: 0, equivocado: 0, levantado: 0, invertido: 0, corto: 0, ict: 0 },
      history: [],
      scale: 1
    };
    updateBoard({ ...currentBoard, components: [...currentBoard.components, newComp] });
    setShowCompDialog(null);
    setNewCompName('');
  };

  const updateDefect = (compId: string, key: keyof DefectCounts, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentBoard) return;
    const now = Date.now();
    updateBoard({
      ...currentBoard,
      components: currentBoard.components.map(c => 
        c.id === compId ? { 
          ...c, 
          counts: { ...c.counts, [key]: c.counts[key] + 1 },
          history: [...c.history, { type: key, timestamp: now }]
        } : c
      )
    });
    setActiveCompDetail(null);
  };

  const handleMarkerResize = (id: string, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentBoard) return;
    const updateComp = currentBoard.components.map(c => 
      c.id === id ? { ...c, scale: Math.max(0.5, Math.min(3, (c.scale || 1) + delta)) } : c
    );
    const updateGen = currentBoard.genericMarkers.map(m => 
      m.id === id ? { ...m, scale: Math.max(0.5, Math.min(3, (m.scale || 1) + delta)) } : m
    );
    updateBoard({ ...currentBoard, components: updateComp, genericMarkers: updateGen });
  };

  const deleteMarker = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentBoard) return;
    updateBoard({
      ...currentBoard,
      components: currentBoard.components.filter(c => c.id !== id),
      genericMarkers: currentBoard.genericMarkers.filter(m => m.id !== id)
    });
    setSelectedMarkerId(null);
  };

  const addGenericMarker = (type: 'Corto' | 'Inundado' | 'HotMelt', x: number, y: number) => {
    if (!currentBoard) return;
    const now = Date.now();
    const newMarker: GenericDefectMarker = {
      id: Math.random().toString(36).substr(2, 9),
      type, x, y, side: currentSide, count: 1, history: [now], scale: 1
    };
    updateBoard({ ...currentBoard, genericMarkers: [...currentBoard.genericMarkers, newMarker] });
    setContextMenu(null);
  };

  const incrementGeneric = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentBoard || showHeatmap || isEditMode) return;
    const now = Date.now();
    updateBoard({
      ...currentBoard,
      genericMarkers: currentBoard.genericMarkers.map(m => m.id === id ? { ...m, count: m.count + 1, history: [...m.history, now] } : m)
    });
  };

  const clearVisualCounters = () => {
    if (!currentBoard) return;
    updateBoard({
      ...currentBoard,
      components: currentBoard.components.map(c => ({
        ...c,
        counts: { faltante: 0, malInsertado: 0, equivocado: 0, levantado: 0, invertido: 0, corto: 0, ict: 0 }
      })),
      genericMarkers: currentBoard.genericMarkers.map(m => ({ ...m, count: 0 }))
    });
    setActiveCompDetail(null);
  };

  const deleteFullHistory = () => {
    if (!currentBoard) return;
    updateBoard({
      ...currentBoard,
      components: currentBoard.components.map(c => ({
        ...c,
        counts: { faltante: 0, malInsertado: 0, equivocado: 0, levantado: 0, invertido: 0, corto: 0, ict: 0 },
        history: []
      })),
      genericMarkers: currentBoard.genericMarkers.map(m => ({
        ...m,
        count: 0,
        history: []
      }))
    });
    setShowConfirmDeleteHistory(false);
    setActiveCompDetail(null);
  };

  // Modified stats to include detail breakdown
  const stats = useMemo(() => {
    if (!currentBoard) return [];
    const list = currentBoard.components
      .filter(c => c.side === currentSide)
      .map(c => ({ 
          name: c.name, 
          total: Object.values(c.counts).reduce((a, b) => a + b, 0), 
          counts: c.counts, // We need individual counts for the breakdown
          type: 'component' 
      }));
    const generics = currentBoard.genericMarkers
      .filter(m => m.side === currentSide)
      .map(m => ({ name: m.type, total: m.count, type: 'generic' }));
    return [...list, ...generics].filter(s => s.total > 0).sort((a, b) => b.total - a.total);
  }, [currentBoard, currentSide]);

  const maxFailsSide = useMemo(() => {
    const totalFails = stats.map(s => s.total);
    return totalFails.length > 0 ? Math.max(...totalFails) : 1;
  }, [stats]);

  const getHeatColor = (count: number) => {
    if (count <= 0) return '';
    if (count === 1) return 'rgb(34, 197, 94)';
    const ratio = Math.min(1, (count - 1) / Math.max(1, maxFailsSide - 1));
    const red = Math.round(34 + (239 - 34) * ratio);
    const green = Math.round(197 + (68 - 197) * ratio);
    const blue = Math.round(94 + (68 - 94) * ratio);
    return `rgb(${red}, ${green}, ${blue})`;
  };

  const getAbbreviation = (id: string) => {
    const map: Record<string, string> = {
        faltante: 'FAL',
        malInsertado: 'MAL',
        equivocado: 'EQU',
        levantado: 'LEV',
        invertido: 'INV',
        corto: 'CRT',
        ict: 'ICT'
    };
    return map[id] || id.substring(0,3).toUpperCase();
  };

  const currentImg = useMemo(() => {
    if (!currentBoard) return null;
    return currentSide === 'A' ? currentBoard.imageA : currentBoard.imageB;
  }, [currentBoard, currentSide]);

  const exportBoardConfig = () => {
    if (!currentBoard) return alert("Seleccione una placa para exportar.");
    const configOnly: Board = {
      ...currentBoard,
      components: currentBoard.components.map(c => ({
        ...c,
        counts: { faltante: 0, malInsertado: 0, equivocado: 0, levantado: 0, invertido: 0, corto: 0, ict: 0 },
        history: []
      })),
      genericMarkers: currentBoard.genericMarkers.map(m => ({ ...m, count: 0, history: [] }))
    };
    const now = new Date();
    const dateStr = now.toLocaleDateString().replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString().replace(/:/g, '-');
    const filename = `CONFIG_${currentBoard.name.replace(/\s+/g, '_')}_${dateStr}_${timeStr}.json`;
    const dataStr = JSON.stringify(configOnly, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    if (!currentBoard) return alert("Seleccione una placa para exportar.");
    const now = new Date();
    const dateStr = now.toLocaleDateString().replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString().replace(/:/g, '-');
    const filename = `LOG_${currentBoard.name.replace(/\s+/g, '_')}_${dateStr}_${timeStr}.csv`;
    const headers = ['Fecha', 'Hora', 'Nombre de Placa', 'Elemento', 'Lado', 'Tipo de Defecto'];
    const eventRows: string[][] = [];
    currentBoard.components.forEach(c => {
      c.history.forEach(event => {
        const d = new Date(event.timestamp);
        // Fix: Use 24h format
        eventRows.push([d.toLocaleDateString(), d.toLocaleTimeString('es-ES', { hour12: false }), currentBoard.name, c.name, c.side, event.type.toUpperCase()]);
      });
    });
    currentBoard.genericMarkers.forEach(m => {
      m.history.forEach(ts => {
        const d = new Date(typeof ts === 'number' ? ts : ts.timestamp);
        // Fix: Use 24h format and specific generic defect name
        eventRows.push([d.toLocaleDateString(), d.toLocaleTimeString('es-ES', { hour12: false }), currentBoard.name, m.type, m.side, m.type.toUpperCase()]);
      });
    });
    const csvContent = "\ufeff" + [headers.join(';'), ...eventRows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedBoard = JSON.parse(event.target?.result as string) as Board;
        if (!importedBoard.name || !Array.isArray(importedBoard.components)) throw new Error("Invalido");
        const newBoard: Board = { ...importedBoard, id: Math.random().toString(36).substr(2, 9), createdAt: Date.now() };
        setBoards(prev => [...prev, newBoard]);
        setActiveBoardId(newBoard.id);
      } catch (err) { alert("Error al importar JSON."); }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 z-50 shrink-0 shadow-xl">
        <div className="flex items-center gap-4">
          <button onClick={() => setShowStats(!showStats)} title="Estadísticas" className={`w-9 h-9 rounded-md flex items-center justify-center transition-all ${showStats ? 'bg-blue-600' : 'bg-slate-800 border border-slate-700'}`}>
            <i className="fa-solid fa-chart-simple text-sm"></i>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                <i className="fa-solid fa-microchip text-white"></i>
            </div>
            <span className="font-black text-xl tracking-tighter uppercase">PCB<span className="text-blue-500">PRO</span></span>
            {/* Version indicator V1.2 */}
            <span className="ml-1 text-[10px] text-slate-500 font-bold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">V1.2</span>
          </div>
          <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-md border border-slate-700">
            <select 
                className="bg-transparent px-3 py-1 text-[11px] font-bold outline-none cursor-pointer min-w-[140px]"
                value={activeBoardId || ''}
                onChange={(e) => handleBoardSwitch(e.target.value)}
            >
                <option value="" disabled>Seleccionar Placa</option>
                {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div className="w-px h-4 bg-slate-700 mx-1"></div>
            <button onClick={exportToExcel} title="Exportar Reporte Excel" className="p-2 hover:text-green-400 transition-colors"><i className="fa-solid fa-file-excel text-xs"></i></button>
            <button onClick={exportBoardConfig} title="Exportar Configuración JSON" className="p-2 hover:text-blue-400 transition-colors"><i className="fa-solid fa-download text-xs"></i></button>
            <button onClick={() => importFileRef.current?.click()} title="Importar Configuración" className="p-2 hover:text-blue-400 transition-colors"><i className="fa-solid fa-upload text-xs"></i></button>
            <input type="file" hidden ref={importFileRef} accept=".json" onChange={handleImportConfig} />
          </div>
          <button onClick={() => setShowNewBoardModal(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-2 shadow-lg">
              <i className="fa-solid fa-plus"></i> NUEVA
          </button>
        </div>

        <div className="flex items-center bg-black/40 p-1 rounded-xl gap-2 border border-white/5">
            <button onClick={toggleSide} className={`flex items-center gap-3 px-6 py-2.5 rounded-lg text-xs font-black transition-all shadow-lg ${currentSide === 'A' ? 'bg-indigo-600' : 'bg-purple-600'}`}>
              <i className="fa-solid fa-rotate"></i>
              <span>LADO {currentSide}</span>
            </button>
            <div className="w-px h-6 bg-slate-800"></div>
            <button onClick={() => {setIsAddingComponent(!isAddingComponent); setIsEditMode(false); setContextMenu(null); setActiveCompDetail(null);}} className={`px-4 py-2.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-2 ${isAddingComponent ? 'bg-orange-600 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
              <i className="fa-solid fa-plus-circle"></i> COMPONENTE
            </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={clearVisualCounters} title="Limpiar conteos visuales (Mantiene historial)" className="px-3 py-1.5 rounded-md text-[10px] font-black bg-slate-800 border border-slate-700 hover:border-yellow-500 transition-all flex items-center gap-2">
            <i className="fa-solid fa-broom text-yellow-500"></i> LIMPIAR VISTA
          </button>
          <button onClick={() => setShowConfirmDeleteHistory(true)} title="Eliminar todo el historial de fallas" className="px-3 py-1.5 rounded-md text-[10px] font-black bg-slate-800 border border-slate-700 hover:border-red-500 transition-all flex items-center gap-2">
            <i className="fa-solid fa-trash-can text-red-500"></i> RESET LOG
          </button>
          <button onClick={() => setShowHeatmap(!showHeatmap)} className={`px-3 py-1.5 rounded-md text-[10px] font-black border transition-all flex items-center gap-2 ${showHeatmap ? 'bg-red-600 border-red-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
            <i className={`fa-solid fa-fire ${showHeatmap ? 'text-white' : 'text-orange-500'}`}></i> CALOR
          </button>
          <button onClick={() => {setIsEditMode(!isEditMode); setIsAddingComponent(false); setContextMenu(null); setActiveCompDetail(null);}} className={`px-3 py-1.5 rounded-md text-[10px] font-black border transition-all flex items-center gap-2 ${isEditMode ? 'bg-yellow-600 border-yellow-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
            <i className={`fa-solid fa-screwdriver-wrench ${isEditMode ? 'text-white' : 'text-yellow-400'}`}></i> EDITAR
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <aside className={`fixed left-0 top-16 bottom-0 bg-slate-900 border-r border-slate-800 transition-all duration-500 z-30 flex flex-col ${showStats ? 'w-72 shadow-2xl' : 'w-0 overflow-hidden'}`}>
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><i className="fa-solid fa-ranking-star text-blue-500"></i> Ranking Lado {currentSide}</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {stats.length === 0 ? <div className="flex flex-col items-center justify-center h-full opacity-20 text-center px-4"><p className="text-[10px] font-black uppercase tracking-widest">Placa Limpia</p></div> : stats.map((s, idx) => (
              <div key={idx} className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/30 flex justify-between items-start animate-in">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[9px] shrink-0 mt-0.5 ${s.type === 'generic' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-blue-600/20 text-blue-400'}`}>{s.name.substring(0, 3).toUpperCase()}</div>
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex justify-between items-center w-full">
                        <span className="text-[11px] font-bold text-slate-300">{s.name}</span>
                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getHeatColor(s.total) }}></div><span className="text-xs font-black text-white">{s.total}</span></div>
                    </div>
                    {/* Detailed Stats Breakdown */}
                    {s.type === 'component' && (
                         <div className="text-[9px] text-slate-500 font-mono tracking-tight flex flex-wrap gap-x-2 gap-y-0.5 leading-tight">
                            {Object.entries((s as any).counts).map(([key, val]) => {
                                const v = val as number;
                                if (v > 0) return <span key={key}><span className="text-slate-400 font-bold">{getAbbreviation(key)}:</span> {v}</span>
                                return null;
                            })}
                         </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className={`flex-1 relative flex flex-col transition-all duration-300 ${showStats ? 'ml-72' : 'ml-0'}`}>
          <div className="flex-1 relative flex items-center justify-center p-8 bg-black overflow-hidden" onClick={handleImageClick} onContextMenu={handleContextMenu}>
            {!currentBoard ? (
              <div className="flex flex-col items-center gap-6 opacity-30 animate-pulse"><i className="fa-solid fa-microchip text-[120px]"></i><h2 className="text-2xl font-black uppercase tracking-widest">Seleccione Proyecto</h2></div>
            ) : !currentImg ? (
              <div className="bg-slate-900/50 border-4 border-dashed border-slate-800 p-16 rounded-[4rem] flex flex-col items-center gap-6 text-center"><h3 className="text-xl font-black text-slate-500 uppercase">Falta Imagen Lado {currentSide}</h3></div>
            ) : (
              <div className="relative inline-block max-w-full max-h-full select-none">
                <img ref={imageRef} src={currentImg} alt="PCB" className={`max-w-full max-h-[calc(100vh-140px)] object-contain rounded-lg shadow-2xl transition-all duration-700 ${showHeatmap ? 'grayscale saturate-[0.15] brightness-[1.1]' : ''}`} draggable={false} />

                {currentBoard.components.filter(c => c.side === currentSide).map(comp => {
                  const total = Object.values(comp.counts).reduce((a, b) => a + b, 0);
                  const isSelected = selectedMarkerId === comp.id;
                  const isActive = activeCompDetail === comp.id;
                  const heatColor = getHeatColor(total);

                  // Flicker fix: Deterministic positioning based on X coordinate
                  // If component is on the right half (x > 50), show menu on left.
                  const detailSide = comp.x > 50 ? 'left' : 'right';
                  // Fix: if component is near bottom (y > 50), show menu upwards (bottom-0)
                  const detailVertical = comp.y > 50 ? 'bottom' : 'top';

                  return (
                    <div key={comp.id} style={{ left: `${comp.x}%`, top: `${comp.y}%`, transform: `translate(-50%, -50%) scale(${comp.scale || 1})` }} className={`absolute ${isActive || isSelected ? 'z-40' : 'z-20'}`} onClick={(e) => { e.stopPropagation(); if(isEditMode) setSelectedMarkerId(comp.id); else { setActiveCompDetail(comp.id); setContextMenu(null); } }}>
                      {showHeatmap && total > 0 && <div className="absolute inset-0 -m-10 rounded-full blur-3xl opacity-70 animate-pulse" style={{ background: `radial-gradient(circle, ${heatColor} 0%, transparent 70%)` }} />}
                      <div className={`relative w-10 h-10 rounded-full border-2 flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl ${isSelected ? 'border-yellow-400 scale-125 ring-2 ring-yellow-400/30' : 'border-white/40'} ${comp.type === 'IA' ? 'bg-blue-600' : 'bg-purple-600'} ${showHeatmap ? 'bg-opacity-100' : 'bg-opacity-50'} backdrop-blur-[1px]`} style={showHeatmap && total > 0 ? { backgroundColor: heatColor } : {}}>
                        <span className="text-[9px] font-black text-white leading-none mb-0.5 drop-shadow-md">{comp.name.substring(0,4)}</span>
                        {total > 0 && <div className="absolute -top-2.5 -right-2.5 bg-red-600 text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg">{total}</div>}
                      </div>

                      {isActive && (
                        <div ref={detailRef} className={`absolute ${detailSide === 'left' ? 'right-full mr-3' : 'left-full ml-3'} ${detailVertical === 'bottom' ? 'bottom-0' : 'top-0'} bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-[0_10px_50px_rgba(0,0,0,0.6)] w-56 z-[70] animate-in ring-1 ring-white/10`} onClick={e => e.stopPropagation()}>
                          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2"><span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{comp.name}</span><button onClick={() => setActiveCompDetail(null)} className="text-slate-500 hover:text-white"><i className="fa-solid fa-xmark"></i></button></div>
                          <div className="grid gap-2">{DEFECT_TYPES.map(d => (
                              <button key={d.id} onClick={(e) => updateDefect(comp.id, d.id as any, e)} className={`flex justify-between items-center ${d.color} hover:brightness-125 px-3 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 shadow-md`}><span>{d.label}</span><span className="bg-black/40 px-2 py-0.5 rounded-lg">{comp.counts[d.id as keyof DefectCounts]}</span></button>
                            ))}</div>
                        </div>
                      )}
                      
                      {isEditMode && isSelected && (
                        <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex gap-1.5 bg-slate-900 rounded-full p-1.5 border border-white/20 shadow-2xl animate-in">
                          <button onClick={(e) => handleMarkerResize(comp.id, -0.1, e)} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-red-500 rounded-full text-xs"><i className="fa-solid fa-minus"></i></button>
                          <button onClick={(e) => handleMarkerResize(comp.id, 0.1, e)} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-green-500 rounded-full text-xs"><i className="fa-solid fa-plus"></i></button>
                          <button onClick={(e) => deleteMarker(comp.id, e)} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-red-600 rounded-full text-xs"><i className="fa-solid fa-trash"></i></button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {currentBoard.genericMarkers.filter(m => m.side === currentSide).map(mark => {
                    const isSelected = selectedMarkerId === mark.id;
                    const heatColor = getHeatColor(mark.count);
                    return (
                        <div key={mark.id} style={{ left: `${mark.x}%`, top: `${mark.y}%`, transform: `translate(-50%, -50%) scale(${mark.scale || 1})` }} className={`absolute ${isSelected ? 'z-40' : 'z-20'}`} onClick={(e) => { e.stopPropagation(); if(isEditMode) setSelectedMarkerId(mark.id); else { incrementGeneric(mark.id, e); setContextMenu(null); setActiveCompDetail(null); } }}>
                          {showHeatmap && mark.count > 0 && <div className="absolute inset-0 -m-10 rounded-full blur-3xl opacity-70 animate-pulse" style={{ background: `radial-gradient(circle, ${heatColor} 0%, transparent 70%)` }} />}
                          <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center shadow-2xl border-2 ${isSelected ? 'border-yellow-400 scale-125 ring-2 ring-yellow-400/30' : 'border-white/20'} ${mark.type === 'Corto' ? 'bg-emerald-600' : 'bg-cyan-600'} ${showHeatmap ? 'bg-opacity-100' : 'bg-opacity-50'} backdrop-blur-[1px]`} style={showHeatmap && mark.count > 0 ? { backgroundColor: heatColor } : {}}><i className={`fa-solid ${mark.type === 'Corto' ? 'fa-bolt' : mark.type === 'HotMelt' ? 'fa-fill-drip' : 'fa-droplet'} text-sm text-white drop-shadow-md`}></i><div className="absolute -bottom-2 -right-2 bg-black text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-700 shadow-md">{mark.count}</div></div>
                          {isEditMode && isSelected && (
                            <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex gap-1.5 bg-slate-900 rounded-full p-1.5 border border-white/20 shadow-2xl animate-in">
                                <button onClick={(e) => handleMarkerResize(mark.id, -0.1, e)} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-red-500 rounded-full text-xs"><i className="fa-solid fa-minus"></i></button>
                                <button onClick={(e) => handleMarkerResize(mark.id, 0.1, e)} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-green-500 rounded-full text-xs"><i className="fa-solid fa-plus"></i></button>
                                <button onClick={(e) => deleteMarker(mark.id, e)} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-red-600 rounded-full text-xs"><i className="fa-solid fa-trash"></i></button>
                            </div>
                          )}
                        </div>
                    );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {showNewBoardModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowNewBoardModal(false)}>
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl w-full max-w-2xl animate-in" onClick={e => e.stopPropagation()}>
            <h2 className="text-3xl font-black text-blue-500 mb-8 tracking-tighter uppercase flex items-center gap-4"><i className="fa-solid fa-folder-plus"></i> Nueva Placa</h2>
            <div className="space-y-6">
              <input type="text" value={newBoardData.name} onChange={e => setNewBoardData(prev => ({ ...prev, name: e.target.value }))} placeholder="Nombre del Modelo" className="w-full bg-slate-800 border-2 border-slate-700 rounded-[1.5rem] p-5 text-xl font-bold outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-6">{['A', 'B'].map((s) => (
                  <label key={s} className="flex flex-col items-center justify-center aspect-video bg-slate-800 border-2 border-dashed border-slate-700 rounded-2xl hover:border-blue-500 cursor-pointer overflow-hidden group transition-all">{newBoardData[`image${s}` as 'imageA'|'imageB'] ? (
                        <img src={newBoardData[`image${s}` as 'imageA'|'imageB']} className="w-full h-full object-cover" />
                    ) : (<div className="flex flex-col items-center gap-2 opacity-40"><i className="fa-solid fa-cloud-arrow-up text-3xl"></i><span className="text-[10px] font-black uppercase">Foto Lado {s}</span></div>)}<input type="file" hidden accept="image/*" onChange={(e) => handleImageUpload(e, s as 'A'|'B')} /></label>
                ))}</div>
              <div className="flex gap-4"><button onClick={() => setShowNewBoardModal(false)} className="flex-1 p-4 bg-slate-800 rounded-2xl font-bold uppercase hover:bg-slate-700">Cerrar</button><button onClick={saveNewBoard} className="flex-1 p-4 bg-blue-600 rounded-2xl font-black uppercase shadow-xl hover:bg-blue-500 active:scale-95">Crear</button></div>
            </div>
          </div>
        </div>
      )}

      {showConfirmDeleteHistory && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowConfirmDeleteHistory(false)}>
          <div className="bg-slate-900 border border-red-500/30 p-8 rounded-[2rem] shadow-2xl w-full max-w-md animate-in" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 text-2xl animate-pulse"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <h2 className="text-xl font-black uppercase tracking-widest text-white">¿Borrar Historial Completo?</h2>
              <p className="text-xs text-slate-400 font-medium">Esta acción eliminará permanentemente todos los registros de fallas y datos de Excel de la placa <span className="text-white font-black">{currentBoard?.name}</span>. No se puede deshacer.</p>
              <div className="flex gap-4 w-full mt-4">
                <button onClick={() => setShowConfirmDeleteHistory(false)} className="flex-1 p-3 bg-slate-800 rounded-xl font-bold hover:bg-slate-700 transition-all uppercase text-[10px]">Cancelar</button>
                <button onClick={deleteFullHistory} className="flex-1 p-3 bg-red-600 rounded-xl font-black hover:bg-red-500 transition-all uppercase text-[10px] shadow-lg shadow-red-600/20">ELIMINAR TODO</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompDialog && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-sm animate-in">
            <h2 className="text-xl font-black text-blue-500 mb-6 flex items-center gap-3 uppercase"><i className="fa-solid fa-microchip"></i> Marcador</h2>
            <div className="space-y-5">
                <input autoFocus type="text" value={newCompName} onChange={e => setNewCompName(e.target.value)} placeholder="Ej: R12, IC4..." className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl p-3 text-sm font-bold outline-none focus:border-blue-500" />
                <div className="grid grid-cols-2 gap-3"><button onClick={() => setNewCompType('IA')} className={`p-4 rounded-xl font-black text-[10px] border-2 transition-all ${newCompType === 'IA' ? 'bg-blue-600 border-blue-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>AUTO (IA)</button><button onClick={() => setNewCompType('IM')} className={`p-4 rounded-xl font-black text-[10px] border-2 transition-all ${newCompType === 'IM' ? 'bg-purple-600 border-purple-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>MANUAL (IM)</button></div>
                <div className="flex gap-3 pt-4"><button onClick={() => setShowCompDialog(null)} className="flex-1 p-3 bg-slate-800 rounded-xl font-bold hover:bg-slate-700">VOLVER</button><button onClick={createComponent} className="flex-1 p-3 bg-blue-600 rounded-xl font-black hover:bg-blue-500">GUARDAR</button></div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="fixed bg-slate-900 border border-slate-700 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] p-1.5 z-[150] w-48 flex flex-col gap-1 ring-1 ring-white/20 animate-in" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
             {/* Replaced Corto with Create Component */}
            <button onClick={() => { setShowCompDialog({ imgX: contextMenu.imgX, imgY: contextMenu.imgY }); setContextMenu(null); }} className="flex items-center gap-3 p-2.5 hover:bg-slate-800 rounded-lg group transition-all">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-600 text-[12px] bg-opacity-70 transition-transform group-hover:scale-110 shadow-sm"><i className="fa-solid fa-microchip text-white"></i></div>
                <span className="text-[11px] font-bold text-slate-300">Nuevo Componente</span>
            </button>
            
            {GENERIC_DEFECTS.map(def => (
                <button key={def.id} onClick={() => addGenericMarker(def.id as any, contextMenu.imgX, contextMenu.imgY)} className="flex items-center gap-3 p-2.5 hover:bg-slate-800 rounded-lg group transition-all"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${def.color} text-[12px] bg-opacity-70 transition-transform group-hover:scale-110 shadow-sm`}><i className={`fa-solid ${def.icon} text-white`}></i></div><span className="text-[11px] font-bold text-slate-300">{def.label}</span></button>
            ))}
        </div>
      )}

      <footer className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-6 text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0">
        <div className="flex gap-8">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> PLACA: {currentBoard?.name || '---'}</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> LADO ACTUAL: {currentSide}</span>
            <span className="flex items-center gap-2"><div className={`w-1.5 h-1.5 rounded-full ${showHeatmap ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}></div> HEATMAP: {showHeatmap ? 'ON' : 'OFF'}</span>
        </div>
        <span className="opacity-40">INDUSTRIAL QUALITY CONTROL - PCB INSPECTOR v11.1.12</span>
      </footer>
    </div>
  );
};

export default App;
