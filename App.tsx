
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
  const [newBoardData, setNewBoardData] = useState({ name: '', imageA: '', imageB: '' });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, imgX: number, imgY: number } | null>(null);
  const [showCompDialog, setShowCompDialog] = useState<{ imgX: number, imgY: number } | null>(null);
  const [newCompName, setNewCompName] = useState('');
  const [newCompType, setNewCompType] = useState<ComponentType>('IA');
  const [activeCompDetail, setActiveCompDetail] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memoized current board with robust safety
  const currentBoard = useMemo(() => {
    if (!activeBoardId || boards.length === 0) return null;
    return boards.find(b => b.id === activeBoardId) || null;
  }, [boards, activeBoardId]);

  // Sync with LocalStorage + Migration check
  useEffect(() => {
    const saved = localStorage.getItem('pcb_inspector_v11');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.boards && Array.isArray(parsed.boards)) {
          // Asegurar que los datos antiguos tengan la estructura nueva
          const migratedBoards = parsed.boards.map((b: Board) => ({
            ...b,
            components: (b.components || []).map(c => ({
              ...c,
              history: c.history || [],
              counts: c.counts || { faltante: 0, malInsertado: 0, equivocado: 0, levantado: 0, invertido: 0 }
            })),
            genericMarkers: (b.genericMarkers || []).map(m => ({
              ...m,
              history: m.history || []
            }))
          }));
          setBoards(migratedBoards);
          if (parsed.activeBoardId) setActiveBoardId(parsed.activeBoardId);
        }
      } catch (e) { console.error("Error al cargar datos locales", e); }
    }
  }, []);

  useEffect(() => {
    if (boards.length > 0 || activeBoardId === null) {
      localStorage.setItem('pcb_inspector_v11', JSON.stringify({ boards, activeBoardId }));
    }
  }, [boards, activeBoardId]);

  const updateBoard = useCallback((updatedBoard: Board) => {
    setBoards(prev => prev.map(b => b.id === updatedBoard.id ? { ...updatedBoard } : b));
  }, []);

  const handleBoardSwitch = (id: string) => {
    // Resetear estados locales antes de cambiar para evitar crasheos de renderizado
    setActiveCompDetail(null);
    setSelectedMarkerId(null);
    setContextMenu(null);
    setIsAddingComponent(false);
    setActiveBoardId(id);
    
    // Si la placa seleccionada no tiene el lado actual, volver al A
    const board = boards.find(b => b.id === id);
    if (board && currentSide === 'B' && !board.imageB) {
      setCurrentSide('A');
    }
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
    if (!newBoardData.name.trim()) return alert("Asigne un nombre a la placa");
    const newId = Math.random().toString(36).substr(2, 9);
    const newBoard: Board = {
      id: newId,
      name: newBoardData.name,
      imageA: newBoardData.imageA || null,
      imageB: newBoardData.imageB || null,
      components: [],
      genericMarkers: [],
      createdAt: Date.now()
    };
    
    setBoards(prev => [...prev, newBoard]);
    handleBoardSwitch(newId);
    setShowNewBoardModal(false);
    setNewBoardData({ name: '', imageA: '', imageB: '' });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!imageRef.current || !currentBoard || showHeatmap || isEditMode) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setContextMenu({ x: e.clientX, y: e.clientY, imgX: x, imgY: y });
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (!imageRef.current || !currentBoard || showHeatmap) return;
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
      counts: { faltante: 0, malInsertado: 0, equivocado: 0, levantado: 0, invertido: 0 },
      history: [],
      scale: 1
    };
    updateBoard({
      ...currentBoard,
      components: [...currentBoard.components, newComp]
    });
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
  };

  const handleMarkerResize = (id: string, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentBoard) return;
    const updatedComponents = currentBoard.components.map(c => 
      c.id === id ? { ...c, scale: Math.max(0.5, Math.min(3, (c.scale || 1) + delta)) } : c
    );
    const updatedGenerics = currentBoard.genericMarkers.map(m => 
      m.id === id ? { ...m, scale: Math.max(0.5, Math.min(3, (m.scale || 1) + delta)) } : m
    );
    updateBoard({ ...currentBoard, components: updatedComponents, genericMarkers: updatedGenerics });
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

  const addGenericMarker = (type: 'Corto' | 'Inundado', x: number, y: number) => {
    if (!currentBoard) return;
    const now = Date.now();
    const newMarker: GenericDefectMarker = {
      id: Math.random().toString(36).substr(2, 9),
      type, x, y, side: currentSide, count: 1, history: [now], scale: 1
    };
    updateBoard({
      ...currentBoard,
      genericMarkers: [...currentBoard.genericMarkers, newMarker]
    });
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

  const stats = useMemo(() => {
    if (!currentBoard) return [];
    const list = (currentBoard.components || []).map(c => ({
      name: c.name,
      total: (Object.values(c.counts || {}) as number[]).reduce((a, b) => a + b, 0),
      type: 'component'
    }));
    const generics = (currentBoard.genericMarkers || []).map(m => ({
      name: m.type,
      total: m.count,
      type: 'generic'
    }));
    return [...list, ...generics].sort((a, b) => b.total - a.total);
  }, [currentBoard]);

  const maxTotal = Math.max(...stats.map(s => s.total), 1);

  const getHeatColor = (count: number) => {
    if (count === 0) return 'rgba(71, 85, 105, 0.4)';
    const ratio = count / maxTotal;
    if (ratio > 0.7) return 'rgba(220, 38, 38, 0.9)';
    if (ratio > 0.4) return 'rgba(249, 115, 22, 0.8)';
    return 'rgba(34, 197, 94, 0.8)';
  };

  const exportToXLS = () => {
    if (!currentBoard) return;
    const headers = ["Fecha", "Hora", "Componente/Falla", "Tipo de Defecto", "Lado", "Categoría"];
    const rows: string[][] = [];

    currentBoard.components.forEach(comp => {
      (comp.history || []).forEach(event => {
        const d = new Date(event.timestamp);
        rows.push([
          d.toLocaleDateString(),
          d.toLocaleTimeString(),
          comp.name,
          event.type,
          comp.side,
          "Componente"
        ]);
      });
    });

    currentBoard.genericMarkers.forEach(mark => {
      (mark.history || []).forEach(timestamp => {
        const d = new Date(timestamp);
        rows.push([
          d.toLocaleDateString(),
          d.toLocaleTimeString(),
          mark.type,
          mark.type,
          mark.side,
          "Genérico"
        ]);
      });
    });

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    // Nombre del archivo coincidente con el nombre de la placa
    const fileName = currentBoard.name.trim().replace(/\s+/g, '_');
    link.download = `${fileName}_Reporte_Fallas.csv`;
    link.click();
  };

  const exportConfigJSON = () => {
    if (boards.length === 0) return alert("No hay placas para exportar.");
    const activeBoard = currentBoard || (boards.length > 0 ? boards[0] : null);
    const fileName = activeBoard ? activeBoard.name.trim().replace(/\s+/g, '_') : "PCB_PRO_Config";
    
    const config = {
      boards,
      activeBoardId,
      version: "11.0",
      exportDate: Date.now()
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    // Nombre del archivo coincidente con el nombre de la placa
    link.download = `${fileName}_Configuracion.json`;
    link.click();
  };

  const importConfigJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("Esta acción reemplazará todas las placas actuales por las del archivo. ¿Desea continuar?")) {
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = JSON.parse(event.target?.result as string);
        if (content.boards && Array.isArray(content.boards)) {
          setBoards(content.boards);
          if (content.activeBoardId) setActiveBoardId(content.activeBoardId);
          else if (content.boards.length > 0) setActiveBoardId(content.boards[0].id);
          alert("Configuración importada con éxito.");
        } else {
          alert("El archivo no tiene un formato de configuración válido.");
        }
      } catch (err) {
        console.error(err);
        alert("Error al leer el archivo JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const currentImg = useMemo(() => {
    if (!currentBoard) return null;
    return currentSide === 'A' ? currentBoard.imageA : currentBoard.imageB;
  }, [currentBoard, currentSide]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 z-50 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40">
                <i className="fa-solid fa-microchip text-white"></i>
            </div>
            <span className="font-black text-xl tracking-tighter uppercase hidden sm:inline">PCB<span className="text-blue-500">PRO</span></span>
          </div>
          <div className="flex items-center gap-2">
             <select 
                className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-[11px] font-bold outline-none cursor-pointer min-w-[140px] focus:ring-1 focus:ring-blue-500"
                value={activeBoardId || ''}
                onChange={(e) => handleBoardSwitch(e.target.value)}
            >
                <option value="" disabled>Seleccione Placa</option>
                {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button onClick={() => setShowNewBoardModal(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-2 shadow-lg active:scale-95">
                <i className="fa-solid fa-plus"></i> Cargar nueva placa
            </button>
          </div>
        </div>

        <div className="flex items-center bg-black/40 p-1.5 rounded-xl gap-1 border border-white/5">
            <button onClick={() => setCurrentSide('A')} className={`px-5 py-2 rounded-lg text-[10px] font-black transition-all ${currentSide === 'A' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>LADO A</button>
            <button onClick={() => setCurrentSide('B')} className={`px-5 py-2 rounded-lg text-[10px] font-black transition-all ${currentSide === 'B' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>LADO B</button>
            <div className="w-px h-4 bg-slate-700 mx-1"></div>
            <button onClick={() => {setIsAddingComponent(!isAddingComponent); setIsEditMode(false);}} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all flex items-center gap-2 ${isAddingComponent ? 'bg-orange-600 text-white animate-pulse' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
              <i className="fa-solid fa-plus-circle"></i> CREAR COMPONENTE
            </button>
            <div className="w-px h-4 bg-slate-700 mx-1"></div>
            <button onClick={() => setShowHeatmap(!showHeatmap)} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all flex items-center gap-2 ${showHeatmap ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
              <i className="fa-solid fa-fire"></i> HEATMAP
            </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800/50 rounded-md p-1 border border-slate-700 gap-1 mr-2">
             <button onClick={exportConfigJSON} className="px-2 py-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white flex items-center gap-2" title="Exportar Config JSON">
                <i className="fa-solid fa-file-export text-[10px]"></i>
                <span className="text-[9px] font-bold">EXP</span>
             </button>
             <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white flex items-center gap-2" title="Importar Config JSON">
                <i className="fa-solid fa-file-import text-[10px]"></i>
                <span className="text-[9px] font-bold">IMP</span>
                <input type="file" ref={fileInputRef} hidden accept=".json" onChange={importConfigJSON} />
             </button>
          </div>
          <button onClick={() => {setIsEditMode(!isEditMode); setIsAddingComponent(false);}} className={`px-3 py-1.5 rounded-md text-[10px] font-black border transition-all flex items-center gap-2 ${isEditMode ? 'bg-yellow-600 border-yellow-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}>
            <i className="fa-solid fa-screwdriver-wrench"></i> CONFIG
          </button>
          <button onClick={exportToXLS} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-2 shadow-lg active:scale-95">
            <i className="fa-solid fa-file-excel"></i> XLS
          </button>
          <button onClick={() => setShowStats(!showStats)} className={`w-9 h-9 rounded-md flex items-center justify-center transition-all ${showStats ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}>
            <i className="fa-solid fa-chart-simple text-sm"></i>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <main className={`flex-1 relative flex flex-col transition-all duration-300 ${showStats ? 'mr-72' : 'mr-0'}`}>
          {(isAddingComponent || isEditMode) && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-2 bg-yellow-600 text-white text-[11px] font-black rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
                <i className="fa-solid fa-info-circle"></i>
                {isAddingComponent ? "HAGA CLIC EN LA IMAGEN PARA UBICAR EL COMPONENTE" : "MODO CONFIGURACIÓN: REUBIQUE O AJUSTE ELEMENTOS"}
             </div>
          )}

          <div className="flex-1 relative flex items-center justify-center p-8 bg-black overflow-hidden" onClick={handleImageClick} onContextMenu={handleContextMenu}>
            {!currentBoard ? (
              <div className="flex flex-col items-center gap-6 opacity-40">
                <i className="fa-solid fa-microchip text-[120px] text-slate-800"></i>
                <h2 className="text-2xl font-black uppercase tracking-widest text-slate-700">Inicie cargando una placa</h2>
              </div>
            ) : !currentImg ? (
              <div className="bg-slate-900/50 border-4 border-dashed border-slate-800 p-16 rounded-[4rem] flex flex-col items-center gap-6 text-center shadow-2xl backdrop-blur-sm">
                <i className="fa-solid fa-image text-8xl text-slate-800 mb-2"></i>
                <h3 className="text-xl font-black text-slate-500 uppercase tracking-tighter">Sin imagen para Lado {currentSide}</h3>
                <p className="text-slate-600 text-[11px] font-bold max-w-xs mt-2">Cargue una imagen en la configuración de la placa.</p>
              </div>
            ) : (
              <div className="relative inline-block max-w-full max-h-full">
                <img ref={imageRef} src={currentImg} alt="PCB" className={`max-w-full max-h-[calc(100vh-140px)] object-contain shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-lg transition-all duration-700 ${showHeatmap ? 'brightness-[0.2] saturate-0 grayscale' : 'brightness-100'}`} draggable={false} />

                {currentBoard.components.filter(c => c.side === currentSide).map(comp => {
                  const total = (Object.values(comp.counts || {}) as number[]).reduce((a, b) => a + b, 0);
                  const isSelected = selectedMarkerId === comp.id;
                  const scale = comp.scale || 1;
                  const isFarRight = comp.x > 75;
                  const isFarBottom = comp.y > 75;

                  return (
                    <div key={comp.id} style={{ left: `${comp.x}%`, top: `${comp.y}%`, transform: `translate(-50%, -50%) scale(${scale})` }} className={`absolute z-20 ${activeCompDetail === comp.id || isSelected ? 'z-50' : ''}`} onClick={(e) => { e.stopPropagation(); if(isEditMode) setSelectedMarkerId(comp.id); else if(!showHeatmap) setActiveCompDetail(comp.id); }}>
                      <div className={`w-10 h-10 rounded-full border-2 flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl relative ${showHeatmap ? 'border-white opacity-100 scale-125' : (isSelected ? 'border-yellow-400 opacity-100 scale-110' : 'opacity-50 border-white/40 hover:opacity-100 hover:scale-110')} ${comp.type === 'IA' ? 'bg-blue-600' : 'bg-purple-600'}`} style={showHeatmap ? { backgroundColor: getHeatColor(total) } : {}}>
                        {showHeatmap ? <span className="text-xs font-black text-white">{total}</span> : <><span className="text-[9px] font-black text-white leading-none mb-0.5">{comp.name.substring(0,4).toUpperCase()}</span><span className="text-[7px] font-bold text-white/60 leading-none">{comp.type}</span></>}
                        
                        {isEditMode && isSelected && (
                           <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-1 shadow-2xl scale-[0.8]">
                              <button onClick={(e) => handleMarkerResize(comp.id, 0.1, e)} className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center" title="Aumentar tamaño"><i className="fa-solid fa-plus text-xs"></i></button>
                              <button onClick={(e) => handleMarkerResize(comp.id, -0.1, e)} className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center" title="Disminuir tamaño"><i className="fa-solid fa-minus text-xs"></i></button>
                              <button onClick={(e) => deleteMarker(comp.id, e)} className="w-8 h-8 bg-red-600 hover:bg-red-500 rounded flex items-center justify-center" title="Eliminar"><i className="fa-solid fa-trash text-xs"></i></button>
                           </div>
                        )}
                        {total > 0 && !showHeatmap && !isEditMode && <div className="absolute -top-2 -right-2 bg-red-600 text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg">{total}</div>}
                      </div>

                      {activeCompDetail === comp.id && !showHeatmap && !isEditMode && (
                        <div className={`absolute bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl w-56 z-[60] animate-in fade-in zoom-in duration-200 ${isFarRight ? 'right-full mr-4' : 'left-full ml-4'} ${isFarBottom ? 'bottom-0' : 'top-0'}`} onClick={e => e.stopPropagation()}>
                          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider">{comp.name}</span>
                            <span className="text-[10px] font-black bg-slate-800 px-2 py-0.5 rounded text-slate-400">{total} FALLAS</span>
                          </div>
                          <div className="grid gap-1.5">
                            {DEFECT_TYPES.map(d => (
                              <button key={d.id} onClick={(e) => updateDefect(comp.id, d.id as any, e)} className={`flex justify-between items-center ${d.color} hover:brightness-110 px-3 py-2 rounded-xl text-[9px] font-black shadow-lg transition-transform active:scale-95`}>
                                <span>{d.label}</span>
                                <span className="bg-black/40 min-w-[24px] rounded px-1.5 py-0.5 text-center text-[10px]">{comp.counts[d.id as keyof DefectCounts]}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {currentBoard.genericMarkers.filter(m => m.side === currentSide).map(mark => {
                  const isSelected = selectedMarkerId === mark.id;
                  const scale = mark.scale || 1;
                  return (
                    <div key={mark.id} style={{ left: `${mark.x}%`, top: `${mark.y}%`, transform: `translate(-50%, -50%) scale(${scale})` }} className="absolute group z-20" onClick={(e) => { e.stopPropagation(); if(isEditMode) setSelectedMarkerId(mark.id); else incrementGeneric(mark.id, e); }}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xl border-2 cursor-pointer transition-all ${showHeatmap ? 'border-white opacity-100 scale-125' : (isSelected ? 'border-yellow-400 opacity-100 scale-110' : 'border-white/20 hover:scale-110 opacity-100')} ${mark.type === 'Corto' ? 'bg-emerald-600' : 'bg-cyan-600'}`} style={showHeatmap ? { backgroundColor: getHeatColor(mark.count) } : {}}>
                        {showHeatmap ? <span className="text-xs font-black text-white">{mark.count}</span> : <i className={`fa-solid ${mark.type === 'Corto' ? 'fa-bolt' : 'fa-droplet'} text-sm text-white`}></i>}
                        {isEditMode && isSelected && (
                           <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-1 shadow-2xl scale-[0.8]">
                              <button onClick={(e) => handleMarkerResize(mark.id, 0.1, e)} className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center"><i className="fa-solid fa-plus text-xs"></i></button>
                              <button onClick={(e) => handleMarkerResize(mark.id, -0.1, e)} className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center"><i className="fa-solid fa-minus text-xs"></i></button>
                              <button onClick={(e) => deleteMarker(mark.id, e)} className="w-8 h-8 bg-red-600 hover:bg-red-500 rounded flex items-center justify-center"><i className="fa-solid fa-trash text-xs"></i></button>
                           </div>
                        )}
                      </div>
                      {!showHeatmap && !isEditMode && <div className="absolute -bottom-1.5 -right-1.5 bg-black text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-700 min-w-[20px] text-center shadow-xl">{mark.count}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        <aside className={`fixed right-0 top-16 bottom-0 bg-slate-900 border-l border-slate-800 transition-all duration-500 z-30 flex flex-col ${showStats ? 'w-72 shadow-2xl' : 'w-0 overflow-hidden opacity-0'}`}>
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur-md">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><i className="fa-solid fa-ranking-star text-blue-500"></i> Ranking de Fallas</h3>
            <button onClick={() => setShowStats(false)} className="text-slate-600 hover:text-white transition-colors"><i className="fa-solid fa-xmark"></i></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-slate-950/20">
            {stats.length === 0 ? (
                <div className="text-center py-10 opacity-20"><i className="fa-solid fa-clipboard-check text-4xl mb-2"></i><p className="text-[10px] font-bold">Sin fallas registradas</p></div>
            ) : stats.map((s, idx) => (
              <div key={idx} className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/30 flex justify-between items-center hover:bg-slate-800/80 transition-all group animate-in slide-in-from-right-10 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[9px] shadow-lg ${s.type === 'generic' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/20' : 'bg-blue-600/20 text-blue-400 border border-blue-500/20'}`}>{s.name.substring(0, 3).toUpperCase()}</div>
                  <span className="text-[11px] font-bold text-slate-300 truncate max-w-[120px]">{s.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-white leading-none">{s.total}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {showNewBoardModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl w-full max-w-2xl ring-1 ring-white/10">
            <h2 className="text-3xl font-black text-blue-500 mb-8 tracking-tighter uppercase flex items-center gap-4"><i className="fa-solid fa-folder-plus"></i> Configurar Nueva Placa</h2>
            <div className="space-y-6">
              <input autoFocus type="text" value={newBoardData.name} onChange={e => setNewBoardData(prev => ({ ...prev, name: e.target.value }))} placeholder="Nombre del Proyecto / Modelo" className="w-full bg-slate-800/50 border-2 border-slate-700 rounded-[1.5rem] p-5 text-xl font-bold outline-none focus:border-blue-500 transition-all shadow-inner" />
              <div className="grid grid-cols-2 gap-6">
                {['A', 'B'].map((s) => (
                  <label key={s} className="flex flex-col items-center justify-center aspect-video bg-slate-800 border-2 border-dashed border-slate-700 rounded-2xl hover:border-blue-500 cursor-pointer overflow-hidden relative group transition-all">
                    {newBoardData[`image${s}` as 'imageA'|'imageB'] ? (
                        <div className="w-full h-full relative">
                            <img src={newBoardData[`image${s}` as 'imageA'|'imageB']} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><i className="fa-solid fa-refresh text-white text-2xl"></i></div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                            <i className="fa-solid fa-cloud-arrow-up text-3xl mb-1"></i>
                            <span className="text-[10px] font-black uppercase">Imagen Lado {s}</span>
                        </div>
                    )}
                    <input type="file" hidden accept="image/*" onChange={(e) => handleImageUpload(e, s as 'A'|'B')} />
                  </label>
                ))}
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowNewBoardModal(false)} className="flex-1 p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-xs uppercase transition-colors">Cancelar</button>
                <button onClick={saveNewBoard} className="flex-1 p-4 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xs shadow-xl shadow-blue-900/40 uppercase tracking-widest active:scale-95 transition-all">Guardar Placa</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompDialog && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in duration-200">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-sm ring-1 ring-white/10">
            <h2 className="text-xl font-black text-blue-500 mb-6 flex items-center gap-3 uppercase tracking-tighter"><i className="fa-solid fa-microchip"></i> Crear Componente</h2>
            <div className="space-y-5">
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Identificador</label>
                    <input autoFocus type="text" value={newCompName} onChange={e => setNewCompName(e.target.value)} placeholder="Ej: R12, IC4, C101..." className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl p-3 text-sm font-bold outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setNewCompType('IA')} className={`p-4 rounded-xl font-black text-[10px] border-2 transition-all flex flex-col items-center gap-1 ${newCompType === 'IA' ? 'bg-blue-600 border-blue-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                        <i className="fa-solid fa-robot text-xs mb-1"></i>
                        AUTO (IA)
                    </button>
                    <button onClick={() => setNewCompType('IM')} className={`p-4 rounded-xl font-black text-[10px] border-2 transition-all flex flex-col items-center gap-1 ${newCompType === 'IM' ? 'bg-purple-600 border-purple-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                        <i className="fa-solid fa-hand text-xs mb-1"></i>
                        MANUAL (IM)
                    </button>
                </div>
                <div className="flex gap-3 pt-4">
                    <button onClick={() => setShowCompDialog(null)} className="flex-1 p-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 transition-colors">CANCELAR</button>
                    <button onClick={createComponent} className="flex-1 p-3 bg-blue-600 rounded-xl font-black text-xs shadow-xl shadow-blue-900/40 active:scale-95 transition-all">CREAR</button>
                </div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="fixed bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1 z-[150] w-48 flex flex-col gap-1 ring-1 ring-white/10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1 bg-black/20">Registrar Falla Rápida</div>
            {GENERIC_DEFECTS.map(def => (
                <button key={def.id} onClick={() => addGenericMarker(def.id as any, contextMenu.imgX, contextMenu.imgY)} className="flex items-center gap-3 p-2.5 hover:bg-slate-800 rounded-lg transition-all group">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${def.color} text-[11px] shadow-lg group-hover:scale-110 transition-all`}><i className={`fa-solid ${def.icon}`}></i></div>
                    <span className="text-[10px] font-bold text-slate-300 group-hover:text-white">{def.label}</span>
                </button>
            ))}
        </div>
      )}

      <footer className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-6 text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] shrink-0">
        <div className="flex gap-8">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_#3b82f6]"></div> PLACA: {currentBoard?.name || 'N/A'}</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> LADO: {currentSide}</span>
            <span>TOTAL FALLAS: {stats.reduce((acc, curr) => acc + curr.total, 0)}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className={isAddingComponent ? "text-orange-500" : (isEditMode ? "text-yellow-500" : "text-slate-600")}>
             {isAddingComponent ? "UBICANDO NUEVO COMPONENTE" : (isEditMode ? "MODO CONFIGURACIÓN ACTIVO" : "SISTEMA OPERATIVO PCB PRO")}
          </span>
          <div className="h-3 w-px bg-slate-800"></div>
          <span>INDUSTRIAL QUALITY INSPECTOR V11.1</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
