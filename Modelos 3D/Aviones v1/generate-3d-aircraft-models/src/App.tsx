import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  Aperture,
  Box,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Cog,
  Crosshair,
  Cuboid,
  Eye,
  Fan,
  Focus,
  Grid2X2,
  Hand,
  Layers3,
  Maximize2,
  Minus,
  Mouse,
  MousePointer2,
  Orbit,
  Plane,
  Plus,
  SlidersHorizontal,
  Triangle,
  X,
} from "lucide-react";
import {
  ModelViewer3D,
  type CameraView,
  type GeometryStats,
  type ViewerHandle,
  type ViewMode,
} from "./components/ModelViewer3D";
import { COMPONENTS, LIBRARY } from "./appPresentation";
import type { PartCategory } from "./models/types";

const partIcons = {
  airframe: Cuboid,
  thrusters: Fan,
  cannon: Crosshair,
  magazine: Layers3,
  sight: Aperture,
  mechanisms: Cog,
};
const pad = (n: number) => String(n).padStart(2, "0");
const format = (n: number) => n.toLocaleString("es-ES");

function Brand() {
  return (
    <div className="brand" aria-label="Aeroforge Model Studio">
      <svg
        className="brand-symbol"
        viewBox="0 0 43 40"
        fill="none"
        aria-hidden="true"
      >
        <path d="M1 32.5 18.1 3h10.1L11.1 32.5H1Z" fill="currentColor" />
        <path
          d="m17.5 24.3 8.3-14.2 13.1 22.4H28.5l-5.4-9.1-2 3.4h6.2l3.7 6.3H12.5l5-8.8Z"
          fill="currentColor"
        />
      </svg>
      <span className="brand-type">
        AEROFORGE<span>MODEL STUDIO</span>
      </span>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      className="switch-row"
      onClick={onChange}
    >
      <span>{label}</span>
      <span className={`switch ${value ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}

export default function App() {
  const [id, setId] = useState(LIBRARY[0].id),
    [mode, setMode] = useState<ViewMode>("single");
  const [category, setCategory] = useState<PartCategory | null>(null),
    [wire, setWire] = useState(false);
  const [animate, setAnimate] = useState(
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [orbit, setOrbit] = useState(false);
  const [filter, setFilter] = useState("Todos"),
    [view, setView] = useState<CameraView>("Perspectiva"),
    [menu, setMenu] = useState(false);
  const [pan, setPan] = useState(false),
    [expanded, setExpanded] = useState(false),
    [inspector, setInspector] = useState(false);
  const [online, setOnline] = useState(false),
    [initialized, setInitialized] = useState(false);
  const [stats, setStats] = useState<GeometryStats>({
    triangleCount: 0,
    meshCount: 0,
    materialCount: 0,
    interactive: false,
  });
  const [throttle, setThrottle] = useState(0.65),
    [doors, setDoors] = useState(false),
    [firing, setFiring] = useState(false);
  const viewer = useRef<ViewerHandle>(null),
    gallery = useRef<HTMLDivElement>(null),
    menuRef = useRef<HTMLDivElement>(null);
  const item = LIBRARY.find((a) => a.id === id)!,
    index = LIBRARY.indexOf(item) + 1;
  const visible = LIBRARY.filter(
    (a) =>
      filter === "Todos" ||
      a.vehicleClass === (filter === "Aviones" ? "airplane" : "helicopter"),
  );
  const select = (next: string) => {
    setId(next);
    setMode("single");
    setCategory(null);
    setView("Perspectiva");
    setMenu(false);
  };
  const reset = () => {
    setView("Perspectiva");
    setPan(false);
    setOrbit(false);
    setCategory(null);
    viewer.current?.reset();
  };
  const cycle = (n: number) => {
    const i = visible.findIndex((a) => a.id === id);
    select(
      visible[
        i < 0
          ? n > 0
            ? 0
            : visible.length - 1
          : (i + n + visible.length) % visible.length
      ].id,
    );
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setExpanded(false);
        setInspector(false);
        return;
      }
      if (
        (e.target as HTMLElement).matches("input,textarea,select") ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        cycle(e.key === "ArrowRight" ? 1 : -1);
      }
      if (e.key.toLowerCase() === "f") reset();
      if (e.key === "+" || e.key === "=") viewer.current?.zoom(0.84);
      if (e.key === "-") viewer.current?.zoom(1.19);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  useEffect(() => {
    const el = gallery.current?.querySelector<HTMLElement>(
      `[data-model="${id}"]`,
    );
    if (
      el &&
      gallery.current &&
      gallery.current.scrollWidth > gallery.current.clientWidth
    )
      gallery.current.scrollTo({
        left:
          el.offsetLeft -
          gallery.current.offsetLeft -
          gallery.current.clientWidth / 2 +
          el.offsetWidth / 2,
        behavior: "smooth",
      });
  }, [id, filter]);

  return (
    <div className={`studio-app ${expanded ? "expanded" : ""}`}>
      <header className="topbar">
        <Brand />
        <div className="brand-divider" />
        <nav className="workspace-tabs" aria-label="Modo de escena">
          <button
            className={mode === "single" ? "selected" : ""}
            aria-pressed={mode === "single"}
            onClick={() => {
              setMode("single");
              setCategory(null);
            }}
          >
            <Box size={16} />
            Visor 3D
          </button>
          <button
            className={mode === "fleet" ? "selected" : ""}
            aria-pressed={mode === "fleet"}
            onClick={() => {
              setMode("fleet");
              setCategory(null);
              setView("Perspectiva");
            }}
          >
            <Grid2X2 size={15} />
            Vista de flota
          </button>
        </nav>
        <div className="engine-status">
          <i className={online ? "live-dot" : "standby-dot"} />
          <span>
            {online
              ? "Motor en línea"
              : initialized
                ? "Vista previa"
                : "Inicializando"}
          </span>
          <span className="engine-tag">Three.js</span>
        </div>
      </header>

      <main className="workspace">
        <section className="viewport" aria-label="Visor de aeronaves">
          <ModelViewer3D
            ref={viewer}
            selectedId={id}
            viewMode={mode}
            activeCategory={category}
            wireframe={wire}
            animateParts={animate}
            autoRotate={orbit}
            cameraView={view}
            pan={pan}
            throttle={throttle}
            doorsOpen={doors}
            firing={firing}
            onSelectFromScene={select}
            onStatsUpdate={setStats}
            onReady={(ok) => {
              setOnline(ok);
              setInitialized(true);
            }}
          />
          <div className="model-heading" key={mode === "fleet" ? "fleet" : id}>
            <div className="eyebrow">
              <span className="accent-rule" />
              {mode === "single" ? "MODELO ACTIVO" : "VISTA GENERAL"}
              <span className="eyebrow-slash">/</span>
              <span className="model-index">
                {mode === "single" ? `${pad(index)} DE 08` : "08 UNIDADES"}
              </span>
            </div>
            <h1>
              {mode === "single" ? (
                <>
                  {item.code} <span>{item.nickname}</span>
                </>
              ) : (
                <>
                  Flota <span>completa</span>
                </>
              )}
            </h1>
            <p>
              <span className="vehicle-class">
                {mode === "fleet" ? (
                  <Boxes size={13} />
                ) : item.vehicleClass === "airplane" ? (
                  <Plane size={13} />
                ) : (
                  <Fan size={13} />
                )}{" "}
                {mode === "fleet"
                  ? "Colección"
                  : item.vehicleClass === "airplane"
                    ? "Avión"
                    : "Helicóptero"}
              </span>
              <i />
              {mode === "fleet"
                ? "Selecciona una aeronave para inspeccionarla"
                : item.role}
            </p>
          </div>
          <div className="viewport-actions">
            <div className="camera-selection" ref={menuRef}>
              <button
                className={`camera-button ${menu ? "is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
                disabled={mode === "fleet"}
              >
                <Box size={13} />
                <span>{view}</span>
                <ChevronDown size={12} />
              </button>
              {menu && (
                <div className="view-menu" role="menu">
                  {(
                    [
                      "Perspectiva",
                      "Frontal",
                      "Lateral",
                      "Superior",
                    ] as CameraView[]
                  ).map((v) => (
                    <button
                      role="menuitemradio"
                      aria-checked={v === view}
                      key={v}
                      onClick={() => {
                        setView(v);
                        setOrbit(false);
                        setMenu(false);
                      }}
                    >
                      {v}
                      {v === view && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="square-btn expand-btn"
              title={expanded ? "Salir del visor ampliado" : "Ampliar visor"}
              aria-label={
                expanded ? "Salir del visor ampliado" : "Ampliar visor"
              }
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <X size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              className="square-btn mobile-inspect"
              aria-label="Abrir inspector"
              onClick={() => setInspector(!inspector)}
            >
              <SlidersHorizontal size={15} />
            </button>
          </div>
          <div className="viewport-cross cross-left" />
          <div className="viewport-cross cross-right" />
          <div className="view-tools" aria-label="Controles de cámara">
            <button
              className={!pan ? "active" : ""}
              onClick={() => setPan(false)}
              title="Orbitar"
              aria-label="Orbitar"
              aria-pressed={!pan}
            >
              <Orbit size={17} />
            </button>
            <button
              className={pan ? "active" : ""}
              onClick={() => setPan(true)}
              title="Desplazar"
              aria-label="Desplazar"
              aria-pressed={pan}
            >
              <Hand size={16} />
            </button>
            <span className="tool-sep" />
            <button
              onClick={() => viewer.current?.zoom(0.83)}
              title="Acercar (+)"
              aria-label="Acercar"
            >
              <Plus size={17} />
            </button>
            <button
              onClick={() => viewer.current?.zoom(1.2)}
              title="Alejar (-)"
              aria-label="Alejar"
            >
              <Minus size={17} />
            </button>
            <span className="tool-sep" />
            <button
              onClick={reset}
              title="Restablecer encuadre (F)"
              aria-label="Restablecer encuadre"
            >
              <Focus size={16} />
            </button>
          </div>
          <div className="view-help">
            <Mouse size={12} />
            <span>Arrastra para {pan ? "desplazar" : "orbitar"}</span>
            <b>·</b>
            <span>Rueda para zoom</span>
          </div>
          {category && (
            <button
              className="isolation-note"
              onClick={() => setCategory(null)}
            >
              <Focus size={12} />
              {COMPONENTS.find((c) => c.id === category)?.label} aislado
              <X size={12} />
            </button>
          )}
        </section>

        {inspector && (
          <button
            className="inspector-backdrop"
            aria-label="Cerrar inspector"
            onClick={() => setInspector(false)}
          />
        )}
        <aside
          className={`inspector ${inspector ? "open" : ""}`}
          aria-label="Inspector del modelo"
        >
          <div className="inspector-title">
            <SlidersHorizontal size={17} />
            <h2>Inspector</h2>
            <span className="inspector-tag">PROPIEDADES</span>
            <button
              className="close-inspector"
              aria-label="Cerrar inspector"
              onClick={() => setInspector(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="inspector-content">
            <section className="inspector-section render-section">
              <h3>VISUALIZACIÓN</h3>
              <div className="render-options">
                <button
                  className={!wire ? "chosen" : ""}
                  onClick={() => setWire(false)}
                  aria-pressed={!wire}
                >
                  <Box size={14} />
                  Sólido
                </button>
                <button
                  className={wire ? "chosen" : ""}
                  onClick={() => setWire(true)}
                  aria-pressed={wire}
                >
                  <Boxes size={15} />
                  Malla
                </button>
              </div>
            </section>
            <section className="inspector-section component-section">
              <div className="section-label">
                <h3>COMPONENTES</h3>
                <span>06</span>
              </div>
              <div className="component-list">
                {COMPONENTS.map((c) => {
                  const Icon = partIcons[c.id];
                  return (
                    <div key={c.id}>
                      <button
                        className={`component-row ${category === c.id ? "chosen" : ""}`}
                        aria-pressed={category === c.id}
                        title={`Aislar ${c.label.toLowerCase()}`}
                        onClick={() =>
                          setCategory(category === c.id ? null : c.id)
                        }
                      >
                        <Icon size={15} />
                        <span>{c.label}</span>
                        {category === c.id ? (
                          <Focus size={13} />
                        ) : (
                          <Eye size={13} />
                        )}
                      </button>
                      {category === c.id && (
                        <p className="component-description">
                          {mode === "single"
                            ? (item.subsystems.find((s) => s.category === c.id)
                                ?.detail ?? c.detail)
                            : c.detail}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            {stats.interactive && mode === "single" && (
              <section className="inspector-section mechanics-section">
                <div className="section-label">
                  <h3>MECÁNICA</h3>
                  <span className="live-tag">EN VIVO</span>
                </div>
                <label className="range-row">
                  <span>Empuje</span>
                  <output>{Math.round(throttle * 100)}%</output>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={throttle}
                    aria-label="Empuje de los motores"
                    style={{ "--fill": `${throttle * 100}%` } as React.CSSProperties}
                    onChange={(e) => setThrottle(Number(e.target.value))}
                  />
                </label>
                <Toggle
                  label="Rampa y compuerta"
                  value={doors}
                  onChange={() => setDoors(!doors)}
                />
                <Toggle
                  label="Fuego de artillería"
                  value={firing}
                  onChange={() => setFiring(!firing)}
                />
                <p className="mechanics-hint">
                  <Crosshair size={11} />
                  Mueve el cursor sobre el suelo para apuntar las armas.
                </p>
              </section>
            )}
            <section className="inspector-section">
              <h3>ANIMACIÓN</h3>
              <Toggle
                label="Mecanismos activos"
                value={animate}
                onChange={() => setAnimate(!animate)}
              />
              <Toggle
                label="Órbita automática"
                value={orbit}
                onChange={() => setOrbit(!orbit)}
              />
            </section>
            <section className="inspector-section geometry-section">
              <div className="section-label">
                <h3>GEOMETRÍA</h3>
                <span className="mid-poly">MID-POLY</span>
              </div>
              <div className="geometry-values">
                <div>
                  <strong>
                    {stats.triangleCount ? format(stats.triangleCount) : "..."}
                  </strong>
                  <span>
                    <Triangle size={10} />
                    Triángulos
                  </span>
                </div>
                <div>
                  <strong>{stats.meshCount || "..."}</strong>
                  <span>
                    <Box size={11} />
                    Mallas
                  </span>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </main>

      <section className="library" aria-label="Biblioteca de modelos">
        <div className="library-heading">
          <div className="library-title">
            <Layers3 size={18} />
            <h2>Biblioteca de modelos</h2>
            <span>{pad(visible.length)}</span>
          </div>
          <div className="library-filters" aria-label="Filtrar modelos">
            {["Todos", "Aviones", "Helicópteros"].map((f) => (
              <button
                key={f}
                className={filter === f ? "chosen" : ""}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="library-arrows">
            <button
              aria-label="Modelo anterior"
              title="Modelo anterior"
              onClick={() => cycle(-1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              aria-label="Modelo siguiente"
              title="Modelo siguiente"
              onClick={() => cycle(1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <div className="library-track" ref={gallery}>
          {visible.map((a) => {
            const selected = mode === "single" && id === a.id;
            return (
              <button
                key={a.id}
                data-model={a.id}
                className={`model-tile ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                aria-label={`Ver ${a.code} ${a.nickname}`}
                onClick={() => select(a.id)}
              >
                <span className="tile-index">
                  {pad(LIBRARY.indexOf(a) + 1)}
                </span>
                {selected && (
                  <span className="tile-check">
                    <Check size={9} strokeWidth={3} />
                  </span>
                )}
                <img src={`/previews/${a.id}.webp`} alt="" draggable={false} />
                <span className="tile-title">{a.code}</span>
                <span className="tile-name">{a.nickname}</span>
              </button>
            );
          })}
        </div>
      </section>
      <footer className="statusbar">
        <span className="footer-state">
          <i className={online ? "live-dot" : "standby-dot"} />
          {online
            ? "Renderizado en tiempo real"
            : initialized
              ? "Vista previa estática"
              : "Preparando escena"}
        </span>
        <i className="footer-divider" />
        <span>WebGL 2.0</span>
        <div className="footer-right">
          <span>
            <CircleDot size={10} />
            Materiales PBR
          </span>
          <i className="footer-divider" />
          <span>
            <MousePointer2 size={10} />
            Escena interactiva
          </span>
        </div>
      </footer>
    </div>
  );
}
