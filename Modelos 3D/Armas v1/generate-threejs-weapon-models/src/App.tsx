import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Layers,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { WeaponStatsSummary, WeaponViewport } from './components/WeaponViewport';
import { WEAPON_CATALOG, WeaponId } from './weapons';

export default function App() {
  const [selectedId, setSelectedId] = useState<WeaponId>('assault-rifle');
  const [exploded, setExploded] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const [resetCounter, setResetCounter] = useState(0);
  const [stats, setStats] = useState<WeaponStatsSummary | null>(null);
  const [showPartsMobile, setShowPartsMobile] = useState(false);

  const currentIndex = WEAPON_CATALOG.findIndex((w) => w.id === selectedId);
  const activeWeapon = WEAPON_CATALOG[currentIndex] ?? WEAPON_CATALOG[0];

  const handleSelectWeapon = useCallback((id: WeaponId) => {
    setSelectedId(id);
    setHoveredPartId(null);
  }, []);

  const handleStep = useCallback(
    (delta: number) => {
      const nextIdx =
        (currentIndex + delta + WEAPON_CATALOG.length) % WEAPON_CATALOG.length;
      handleSelectWeapon(WEAPON_CATALOG[nextIdx].id);
    },
    [currentIndex, handleSelectWeapon]
  );

  const handleModelLoaded = useCallback((summary: WeaponStatsSummary) => {
    setStats(summary);
  }, []);

  // Keyboard navigation (Left / Right arrows to browse models)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleStep(1);
      else if (e.key === 'ArrowLeft') handleStep(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStep]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(ellipse 80% 70% at 50% 46%, #262c38 0%, #171b23 55%, #0e1117 100%)',
      }}
    >
      {/* Full-bleed Three.js Interactive Viewport */}
      <WeaponViewport
        weaponId={selectedId}
        exploded={exploded}
        wireframe={wireframe}
        autoRotate={autoRotate}
        hoveredPartId={hoveredPartId}
        resetCounter={resetCounter}
        onModelLoaded={handleModelLoaded}
      />

      {/* Top-Left Minimal Model Plaque */}
      <header className="pointer-events-none absolute top-5 left-5 z-10 max-w-md sm:top-6 sm:left-6">
        <div className="pointer-events-auto rounded-xl border border-white/10 bg-[#12161f]/75 px-4 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.16em] text-sky-400/90 uppercase">
            <span>{activeWeapon.category}</span>
            <span className="text-white/20">•</span>
            <span className="text-slate-400">
              {currentIndex + 1} / {WEAPON_CATALOG.length}
            </span>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">
            {activeWeapon.name}
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-300/85">
            {activeWeapon.description}
          </p>

          {stats && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/8 pt-2 font-mono text-[11px] text-slate-400">
              <span>{stats.triangleCount.toLocaleString('es-ES')} triángulos</span>
              <span className="text-white/20">·</span>
              <span>{stats.meshCount} mallas</span>
              <span className="text-white/20">·</span>
              <span>{stats.parts.length} subgrupos</span>
              <span className="text-white/20">·</span>
              <span>{stats.lengthCm} cm</span>
            </div>
          )}
        </div>
      </header>

      {/* Top-Right Compact 3D Inspection Controls */}
      <div className="absolute top-5 right-5 z-10 flex items-center gap-1.5 sm:top-6 sm:right-6">
        <button
          type="button"
          onClick={() => setExploded((v) => !v)}
          title="Despiece de componentes"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium backdrop-blur-md transition ${
            exploded
              ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
              : 'border-white/10 bg-[#12161f]/75 text-slate-200 hover:border-white/20 hover:bg-[#191f2b]/85'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Despiece</span>
        </button>

        <button
          type="button"
          onClick={() => setWireframe((v) => !v)}
          title="Ver malla geométrica"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium backdrop-blur-md transition ${
            wireframe
              ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
              : 'border-white/10 bg-[#12161f]/75 text-slate-200 hover:border-white/20 hover:bg-[#191f2b]/85'
          }`}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Malla</span>
        </button>

        <button
          type="button"
          onClick={() => setAutoRotate((v) => !v)}
          title="Rotación automática"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium backdrop-blur-md transition ${
            autoRotate
              ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
              : 'border-white/10 bg-[#12161f]/75 text-slate-200 hover:border-white/20 hover:bg-[#191f2b]/85'
          }`}
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setResetCounter((c) => c + 1)}
          title="Restablecer cámara"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#12161f]/75 px-2.5 py-2 text-xs font-medium text-slate-200 backdrop-blur-md transition hover:border-white/20 hover:bg-[#191f2b]/85"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setShowPartsMobile((v) => !v)}
          title="Mostrar partes del modelo"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium backdrop-blur-md transition md:hidden ${
            showPartsMobile
              ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
              : 'border-white/10 bg-[#12161f]/75 text-slate-200'
          }`}
        >
          <Box className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Right-Side Compact Differentiated 3D Parts Legend (Hover to highlight on model) */}
      {stats && (
        <aside
          className={`absolute top-20 right-5 z-10 w-60 sm:right-6 ${
            showPartsMobile ? 'block' : 'hidden md:block'
          }`}
        >
          <div className="rounded-xl border border-white/10 bg-[#12161f]/75 p-3 backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
                Partes del Modelo
              </span>
              <span className="text-[10px] text-slate-500">Resaltar</span>
            </div>
            <ul className="space-y-1">
              {stats.parts.map((part) => {
                const isActive = hoveredPartId === part.id;
                return (
                  <li key={part.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredPartId(part.id)}
                      onMouseLeave={() => setHoveredPartId(null)}
                      onClick={() =>
                        setHoveredPartId((prev) => (prev === part.id ? null : part.id))
                      }
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                        isActive
                          ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40'
                          : 'text-slate-300 hover:bg-white/6 hover:text-white'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full transition ${
                          isActive ? 'bg-sky-400 shadow-[0_0_8px_#38bdf8]' : 'bg-slate-500'
                        }`}
                      />
                      <span className="truncate">{part.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      )}

      {/* Bottom Dock: Weapon Model Selector */}
      <nav
        aria-label="Selector de modelos de armas 3D"
        className="pointer-events-none absolute right-0 bottom-5 left-0 z-10 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-2xl border border-white/10 bg-[#12161f]/80 p-1.5 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            aria-label="Modelo anterior"
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/8 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {WEAPON_CATALOG.map((weapon) => {
              const selected = weapon.id === selectedId;
              return (
                <button
                  key={weapon.id}
                  type="button"
                  onClick={() => handleSelectWeapon(weapon.id)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap transition ${
                    selected
                      ? 'bg-sky-500/22 text-white ring-1 ring-sky-400/50'
                      : 'text-slate-300 hover:bg-white/7 hover:text-white'
                  }`}
                >
                  {weapon.shortName}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => handleStep(1)}
            aria-label="Modelo siguiente"
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/8 hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[11px] tracking-wide text-slate-400/75">
          Arrastra para orbitar · Rueda para acercar · Clic derecho para desplazar
        </p>
      </nav>
    </div>
  );
}
