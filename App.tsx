
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

  useEffect(() => {
    if (boards.length > 0 || activeBoardId === null) {
      localStorage.setItem('pcb_inspector_v11', JSON.stringify({ boards, activeBoardId }));
    }
  }, [boards, activeBoardId]);

  const updateBoard = useCallback((updatedBoard: Board) => {
    setBoards(prev => prev.map(b => b.id === updatedBoard.id ? { ...updatedBoard } : b));
  }, []);

  const toggleSide = () => {
    const nextSide = currentSide === 'A' ? 'B' : 'A';
    setCurrentSide(nextSide);
    setActiveCompDetail(null);
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
    const newBoard: Board = {
      id: Math.random().toString(36).substr(2, 9),
      name: newBoardData.name,
      imageA: newBoardData.imageA || null,
      imageB: newBoardData.imageB || null,
      components: [],
      genericMarkers: [],
      createdAt: Date.now()
    };
    setBoards(prev => [...prev, newBoard]);
    handleBoardSwitch(newBoard.id);
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
      history: []
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
  };

  const handleMarkerResize = (id: string, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentBoard) return;
    const update = (list: any[]) => list.map(item => item.id === id ? { ...item, scale: Math.max(0.5, Math.min(3, (item.scale || 1) + delta)) } : item);
    updateBoard({ ...currentBoard, components: update(currentBoard.components), genericMarkers: update(currentBoard.genericMarkers) });
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

  const stats = useMemo(() => {
    if (!currentBoard) return [];
    const list = currentBoard.components.map(c => ({ name: c.name, total: Object.values(c.counts).reduce((a, b) => a + b, 0), type: 'component' }));
    const generics = currentBoard.genericMarkers.map(m => ({ name: m.type, total: m.count, type: 'generic' }));
    return [...list, ...generics].sort((a, b) => b.total - a.total);
  }, [currentBoard]);

  const maxTotal = Math.max(...stats.map(s => s.total), 1);
  const getHeatColor = (count: number) => {
    const ratio = count / maxTotal;
    if (ratio > 0.7) return 'rgba(220, 38, 38, 0.9)';
    if (ratio > 0.4) return 'rgba(249, 115, 22, 0.8)';
    return 'rgba(34, 197, 94, 0.8)';
  };

  const exportToXLS = () => {
    if (!currentBoard) return;
    const headers = ["Fecha", "Hora", "Componente", "Tipo", "Lado", "Categoría"];
    const rows: string[][] = [];
    currentBoard.components.forEach(comp => comp.history.forEach(ev => rows.push([new Date(ev.timestamp).toLocaleDateString(), new Date(ev.timestamp).toLocaleTimeString(), comp.name, ev.type, comp.side, "Componente"])));
    currentBoard.genericMarkers.forEach(mark => mark.history.forEach(ts => rows.push([new Date(ts).toLocaleDateString(), new Date(ts).toLocaleTimeString(), mark.type, mark.type, mark.side, "Genérico"])));
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    link.download = `${currentBoard.name.replace(/\s+/g, '_')}_Reporte.csv`;
    link.click();
  };

  const currentImg = useMemo(() => {
    if (!currentBoard) return null;
    return currentSide === 'A' ? currentBoard.imageA : currentBoard.imageB;
  }, [currentBoard, currentSide]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 z-50 shrink-0 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                <i className="fa-solid fa-microchip text-white"></i>
            </div>
            <span className="font-black text-xl tracking-tighter uppercase">PCB<span className="text-blue-500">PRO</span></span>
          </div>
          <select 
              className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-[11px] font-bold outline-none cursor-pointer min-w-[140px]"
              value={activeBoardId || ''}
              onChange={(e) => handleBoardSwitch(e.target.value)}
          >
              <option value="" disabled>Seleccionar Placa</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={() => setShowNewBoardModal(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-2 shadow-lg">
              <i className="fa-solid fa-plus"></i> NUEVA
          </button>
        </div>

        <div className="flex items-center bg-black/40 p-1 rounded-xl gap-2 border border-white/5">
            <button 
              onClick={toggleSide} 
              className={`flex items-center gap-3 px-6 py-2.5 rounded-lg text-xs font-black transition-all shadow-lg ${currentSide === 'A' ? 'bg-indigo-600' : 'bg-purple-600'}`}
            >
              <i className="fa-solid fa-rotate"></i>
              <span>VER LADO {currentSide === 'A' ? 'B' : 'A'}</span>
              <span className="bg-black/30 px-2 py-0.5 rounded text-[10px]">LADO {currentSide} ACTIVO</span>
            </button>
            <div className="w-px h-6 bg-slate-800"></div>
            <button onClick={() => {setIsAddingComponent(!isAddingComponent); setIsEditMode(false);}} className={`px-4 py-2.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-2 ${isAddingComponent ? 'bg-orange-600 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
              <i className="fa-solid fa-plus-circle"></i> COMPONENTE
            </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => {setIsEditMode(!isEditMode); setIsAddingComponent(false);}} className={`px-3 py-1.5 rounded-md text-[10px] font-black border transition-all flex items-center gap-2 ${isEditMode ? 'bg-yellow-600 border-yellow-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
            <i className="fa-solid fa-screwdriver-wrench"></i> EDITAR
          </button>
          <button onClick={exportToXLS} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-2 shadow-lg">
            <i className="fa-solid fa-file-excel"></i> XLS
          </button>
          <button onClick={() => setShowStats(!showStats)} className={`w-9 h-9 rounded-md flex items-center justify-center transition-all ${showStats ? 'bg-blue-600' : 'bg-slate-800 border border-slate-700'}`}>
            <i className="fa-solid fa-chart-simple text-sm"></i>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <main className={`flex-1 relative flex flex-col transition-all duration-300 ${showStats ? 'mr-72' : 'mr-0'}`}>
          {(isAddingComponent || isEditMode) && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-2 bg-yellow-600 text-white text-[11px] font-black rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
                <i className="fa-solid fa-info-circle"></i>
                {isAddingComponent ? "HAGA CLIC PARA UBICAR COMPONENTE" : "MODO CONFIGURACIÓN: REUBIQUE ELEMENTOS"}
             </div>
          )}

          <div className="flex-1 relative flex items-center justify-center p-8 bg-black overflow-hidden" onClick={handleImageClick} onContextMenu={handleContextMenu}>
            {!currentBoard ? (
              <div className="flex flex-col items-center gap-6 opacity-30">
                <i className="fa-solid fa-microchip text-[120px]"></i>
                <h2 className="text-2xl font-black uppercase tracking-widest">Cargue una placa para empezar</h2>
              </div>
            ) : !currentImg ? (
              <div className="bg-slate-900/50 border-4 border-dashed border-slate-800 p-16 rounded-[4rem] flex flex-col items-center gap-6 text-center">
                <i className="fa-solid fa-image text-8xl text-slate-800"></i>
                <h3 className="text-xl font-black text-slate-500 uppercase">Sin foto para el LADO {currentSide}</h3>
                <p className="text-slate-600 text-[11px] font-bold">Añada la imagen en la configuración de la placa.</p>
              </div>
            ) : (
              <div className="relative inline-block max-w-full max-h-full">
                <img ref={imageRef} src={currentImg} alt="PCB" className="max-w-full max-h-[calc(100vh-140px)] object-contain rounded-lg shadow-2xl" draggable={false} />

                {currentBoard.components.filter(c => c.side === currentSide).map(comp => {
                  const total = Object.values(comp.counts).reduce((a, b) => a + b, 0);
                  const isSelected = selectedMarkerId === comp.id;
                  return (
                    <div key={comp.id} style={{ left: `${comp.x}%`, top: `${comp.y}%`, transform: `translate(-50%, -50%) scale(${comp.scale || 1})` }} className="absolute z-20" onClick={(e) => { e.stopPropagation(); if(isEditMode) setSelectedMarkerId(comp.id); else setActiveCompDetail(comp.id); }}>
                      <div className={`w-10 h-10 rounded-full border-2 flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl ${isSelected ? 'border-yellow-400 scale-110' : 'border-white/40'} ${comp.type === 'IA' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                        <span className="text-[9px] font-black text-white leading-none mb-0.5">{comp.name.substring(0,4)}</span>
                        {total > 0 && <div className="absolute -top-2 -right-2 bg-red-600 text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900">{total}</div>}
                      </div>

                      {activeCompDetail === comp.id && (
                        <div className="absolute left-full ml-4 top-0 bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl w-56 z-[60]" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                            <span className="text-[10px] font-black text-blue-400 uppercase">{comp.name}</span>
                            <button onClick={() => setActiveCompDetail(null)} className="text-slate-500 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
                          </div>
                          <div className="grid gap-1.5">
                            {DEFECT_TYPES.map(d => (
                              <button key={d.id} onClick={(e) => updateDefect(comp.id, d.id as any, e)} className={`flex justify-between items-center ${d.color} hover:brightness-110 px-3 py-2 rounded-xl text-[9px] font-black`}>
                                <span>{d.label}</span>
                                <span className="bg-black/40 px-1.5 py-0.5 rounded">{comp.counts[d.id as keyof DefectCounts]}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {currentBoard.genericMarkers.filter(m => m.side === currentSide).map(mark => (
                    <div key={mark.id} style={{ left: `${mark.x}%`, top: `${mark.y}%`, transform: `translate(-50%, -50%) scale(${mark.scale || 1})` }} className="absolute z-20" onClick={(e) => { e.stopPropagation(); if(isEditMode) setSelectedMarkerId(mark.id); else incrementGeneric(mark.id, e); }}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xl border-2 ${selectedMarkerId === mark.id ? 'border-yellow-400 scale-110' : 'border-white/20'} ${mark.type === 'Corto' ? 'bg-emerald-600' : 'bg-cyan-600'}`}>
                        <i className={`fa-solid ${mark.type === 'Corto' ? 'fa-bolt' : 'fa-droplet'} text-sm text-white`}></i>
                        <div className="absolute -bottom-1.5 -right-1.5 bg-black text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-700">{mark.count}</div>
                      </div>
                    </div>
                ))}
              </div>
            )}
          </div>
        </main>

        <aside className={`fixed right-0 top-16 bottom-0 bg-slate-900 border-l border-slate-800 transition-all duration-500 z-30 flex flex-col ${showStats ? 'w-72 shadow-2xl' : 'w-0 overflow-hidden'}`}>
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><i className="fa-solid fa-ranking-star text-blue-500"></i> Ranking de Fallas</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {stats.map((s, idx) => (
              <div key={idx} className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/30 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[9px] ${s.type === 'generic' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-blue-600/20 text-blue-400'}`}>{s.name.substring(0, 3).toUpperCase()}</div>
                  <span className="text-[11px] font-bold text-slate-300">{s.name}</span>
                </div>
                <div className="text-sm font-black text-white">{s.total}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {showNewBoardModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl w-full max-w-2xl">
            <h2 className="text-3xl font-black text-blue-500 mb-8 tracking-tighter uppercase flex items-center gap-4"><i className="fa-solid fa-folder-plus"></i> Nueva Placa</h2>
            <div className="space-y-6">
              <input type="text" value={newBoardData.name} onChange={e => setNewBoardData(prev => ({ ...prev, name: e.target.value }))} placeholder="Nombre del Modelo" className="w-full bg-slate-800 border-2 border-slate-700 rounded-[1.5rem] p-5 text-xl font-bold outline-none focus:border-blue-500 shadow-inner" />
              <div className="grid grid-cols-2 gap-6">
                {['A', 'B'].map((s) => (
                  <label key={s} className="flex flex-col items-center justify-center aspect-video bg-slate-800 border-2 border-dashed border-slate-700 rounded-2xl hover:border-blue-500 cursor-pointer overflow-hidden relative group">
                    {newBoardData[`image${s}` as 'imageA'|'imageB'] ? (
                        <img src={newBoardData[`image${s}` as 'imageA'|'imageB']} className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex flex-col items-center gap-2 opacity-40 group-hover:opacity-100">
                            <i className="fa-solid fa-cloud-arrow-up text-3xl"></i>
                            <span className="text-[10px] font-black uppercase">Foto Lado {s}</span>
                        </div>
                    )}
                    <input type="file" hidden accept="image/*" onChange={(e) => handleImageUpload(e, s as 'A'|'B')} />
                  </label>
                ))}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowNewBoardModal(false)} className="flex-1 p-4 bg-slate-800 rounded-2xl font-bold uppercase">Cerrar</button>
                <button onClick={saveNewBoard} className="flex-1 p-4 bg-blue-600 rounded-2xl font-black uppercase shadow-xl shadow-blue-900/40">Crear Proyecto</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompDialog && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-sm">
            <h2 className="text-xl font-black text-blue-500 mb-6 flex items-center gap-3 uppercase"><i className="fa-solid fa-microchip"></i> Identificador</h2>
            <div className="space-y-5">
                <input autoFocus type="text" value={newCompName} onChange={e => setNewCompName(e.target.value)} placeholder="Ej: R12, IC4..." className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl p-3 text-sm font-bold outline-none focus:border-blue-500" />
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setNewCompType('IA')} className={`p-4 rounded-xl font-black text-[10px] border-2 ${newCompType === 'IA' ? 'bg-blue-600 border-blue-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>AUTO (IA)</button>
                    <button onClick={() => setNewCompType('IM')} className={`p-4 rounded-xl font-black text-[10px] border-2 ${newCompType === 'IM' ? 'bg-purple-600 border-purple-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>MANUAL (IM)</button>
                </div>
                <div className="flex gap-3 pt-4">
                    <button onClick={() => setShowCompDialog(null)} className="flex-1 p-3 bg-slate-800 rounded-xl font-bold">VOLVER</button>
                    <button onClick={createComponent} className="flex-1 p-3 bg-blue-600 rounded-xl font-black shadow-xl">LISTO</button>
                </div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="fixed bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1 z-[150] w-48 flex flex-col gap-1 ring-1 ring-white/10" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
            {GENERIC_DEFECTS.map(def => (
                <button key={def.id} onClick={() => addGenericMarker(def.id as any, contextMenu.imgX, contextMenu.imgY)} className="flex items-center gap-3 p-2.5 hover:bg-slate-800 rounded-lg transition-all group">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${def.color} text-[11px]`}><i className={`fa-solid ${def.icon}`}></i></div>
                    <span className="text-[10px] font-bold text-slate-300">{def.label}</span>
                </button>
            ))}
        </div>
      )}

      <footer className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-6 text-[8px] font-black text-slate-500 uppercase tracking-widest shrink-0">
        <div className="flex gap-8">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> PLACA: {currentBoard?.name || '---'}</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> LADO ACTUAL: {currentSide}</span>
        </div>
        <span>INDUSTRIAL PCB INSPECTOR v11.1.3 - BUILT FOR PRECISION</span>
      </footer>
    </div>
  );
};

export default App;
