import type React from 'react'
import type { Bg } from '../../store'
import { WaxPalm } from './WaxPalm'
import { ColonialHouse } from './ColonialHouse'
import { Helicopter } from './Helicopter'
import { AK47 } from './AK47'
import { Character, CHAR_VARIANTS } from './Character'
import { Bear } from './Bear'
import { StoneBridge } from './StoneBridge'
import { Condor, Tapir } from './Fauna'
import { CoffeeBush, Rock, Fence, Medkit, CocoraSign } from './Props'
import { FullScene } from './FullScene'

export interface ModelDef {
  id: string
  name: string
  icon: string
  category: string
  desc: string
  variants: string[]
  Component: React.FC<{ variant?: number }>
  ownGround?: boolean
  fitScale?: number
  defaultBg?: Bg
}

export const MODELS: ModelDef[] = [
  { id: 'personaje', name: 'Campesino armado', icon: '🧑‍🌾', category: 'Personajes', desc: 'Protagonista cel-shaded de 1,80 m: sombrero vueltiao trenzado, ruana con franjas y flecos, mochila táctica oliva y botas de montaña. Rig jerárquico con IK de manos sobre el fusil y 11 animaciones.', variants: CHAR_VARIANTS.map((v) => v.label), Component: Character },
  { id: 'ak47', name: 'Fusil Andino AK-47', icon: '🔫', category: 'Armas', desc: 'Fusil de asalto con culata y guardamanos de madera, cargador curvo extruido, alza, punto de mira y freno de boca.', variants: ['Estático', 'Disparando'], Component: AK47 },
  { id: 'helicoptero', name: 'Helicóptero Huey', icon: '🚁', category: 'Vehículos', desc: 'UH-1 militar siniestrado: fuselaje inclinado, pala doblada, cola partida, fuego y columna de humo animados.', variants: ['Estrellado', 'Intacto'], Component: Helicopter },
  { id: 'casa', name: 'Casa colonial', icon: '🏠', category: 'Arquitectura', desc: 'Casa de pueblo cafetero: zócalo de piedra, muros blancos, balcón de madera verde, tejas de barro y carpintería de colores.', variants: ['Dos pisos', 'Un piso'], Component: ColonialHouse },
  { id: 'puente', name: 'Puente de piedra', icon: '🌉', category: 'Arquitectura', desc: 'Puente de arco en mampostería con dovelas, pretiles, estribos y piedras en relieve.', variants: ['Solo puente', 'Con río'], Component: StoneBridge },
  { id: 'letrero', name: 'Letrero COCORA', icon: '🔤', category: 'Arquitectura', desc: 'Letras monumentales en texto 3D biselado sobre estructura metálica, sendero empedrado y escultura de cóndor con alas desplegadas sobre la R.', variants: ['Letrero', 'Sobre la colina'], Component: CocoraSign },
  { id: 'palma', name: 'Palma de cera', icon: '🌴', category: 'Naturaleza', desc: 'Ceroxylon quindiuense, árbol nacional de Colombia: tronco anillado, copa de frondas con foliolos y racimos de frutos.', variants: ['Adulta', 'Joven'], Component: WaxPalm },
  { id: 'cafeto', name: 'Cafeto', icon: '☕', category: 'Naturaleza', desc: 'Arbusto de café con ramas, hojas y cerezas rojas y verdes.', variants: ['Individual', 'Grupo'], Component: CoffeeBush },
  { id: 'roca', name: 'Rocas', icon: '🪨', category: 'Naturaleza', desc: 'Rocas facetadas con desplazamiento procedural y musgo por vértice.', variants: ['Roca grande', 'Grupo de rocas'], Component: Rock },
  { id: 'condor', name: 'Cóndor andino', icon: '🦅', category: 'Fauna', desc: 'Cóndor con collar blanco, cresta, plumas primarias articuladas y aleteo animado.', variants: ['Planeando', 'Aleteando'], Component: Condor },
  { id: 'oso', name: 'Oso de anteojos', icon: '🐻', category: 'Fauna', desc: 'Oso andino de pelaje negro con las marcas crema alrededor de los ojos y el pecho. Caminar, cargar, atacar (se levanta y da zarpazos) y reposo.', variants: ['Caminando', 'Cargando', 'Atacando', 'Reposo'], Component: Bear },
  { id: 'danta', name: 'Danta de montaña', icon: '🐾', category: 'Fauna', desc: 'Tapir andino de pelaje oscuro con trompa, labios y orejas de borde blanco. Ciclo de marcha.', variants: ['Caminando', 'Pastando'], Component: Tapir },
  { id: 'botiquin', name: 'Botiquín', icon: '🧪', category: 'Objetos', desc: 'Cápsula de salud luminosa con burbujas, haz de luz y rotación flotante. Variante de caja clásica.', variants: ['Cápsula', 'Caja clásica'], Component: Medkit },
  { id: 'cerca', name: 'Cerca de madera', icon: '🪵', category: 'Objetos', desc: 'Cerca rústica de postes y travesaños con pilares de piedra apilada y pasto.', variants: ['Corta', 'Larga'], Component: Fence },
  { id: 'escena', name: 'Escena completa', icon: '🗺️', category: 'Escena', desc: 'Diorama del Valle del Cocora: terreno, río, pueblo paisa, monumento, helicóptero y cráter, personaje, puente, oso, cóndores y palmas instanciadas.', variants: ['Diorama'], Component: FullScene, ownGround: true, fitScale: 0.55, defaultBg: 'cielo' },
]

export const CATEGORIES = Array.from(new Set(MODELS.map((m) => m.category)))
