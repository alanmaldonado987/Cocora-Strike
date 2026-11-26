import { buildAssaultRifleModel } from './models/assaultRifle';
import { buildClassicRifleModel } from './models/classicRifle';
import { buildPistolModel } from './models/pistol';
import { buildRevolverModel } from './models/revolver';
import { buildShotgunModel } from './models/shotgun';
import { buildSmgModel } from './models/smg';
import { buildSniperRifleModel } from './models/sniperRifle';
import { WeaponDefinition } from './types';

export { createWeaponMaterialLibrary } from './materials';
export * from './types';

export const WEAPON_CATALOG: WeaponDefinition[] = [
  {
    id: 'pistol',
    name: 'Pistola Semiautomática 9mm',
    shortName: 'Pistola 9mm',
    category: 'Arma Corta',
    description:
      'Corredera biselada con estrías, cañón cromado con recámara visible, armazón ergonómico con riel inferior, cargador extraíble y miras de 3 puntos.',
    build: buildPistolModel,
  },
  {
    id: 'revolver',
    name: 'Revólver Clásico .357',
    shortName: 'Revólver .357',
    category: 'Arma Corta',
    description:
      'Cañón con banda superior ventilada y contrapeso, tambor estriado de 6 recámaras con cartuchos de latón, martillo expuesto y cachas de nogal.',
    build: buildRevolverModel,
  },
  {
    id: 'smg',
    name: 'Subfusil Compacto MP-9',
    shortName: 'Subfusil MP-9',
    category: 'Subfusil',
    description:
      'Cajón tubular con palanca de carga frontal inclinada, guardamanos ergonómico, cargador curvo estrecho, culata telescópica de doble varilla y óptica réflex.',
    build: buildSmgModel,
  },
  {
    id: 'assault-rifle',
    name: 'Rifle de Asalto M4-T',
    shortName: 'Rifle M4-T',
    category: 'Rifle de Asalto',
    description:
      'Cajón forjado con deflector y cerrojo visible, guardamanos flotante ventilado con riel Picatinny, bocacha A2, cargador curvo, culata SOPMOD y mira holográfica.',
    build: buildAssaultRifleModel,
  },
  {
    id: 'classic-rifle',
    name: 'Fusil Clásico AK-M',
    shortName: 'Fusil AK-M',
    category: 'Rifle de Asalto',
    description:
      'Cajón de acero estampado con selector lateral, culata y guardamanos de madera laminada, empuñadura de baquelita, bloque de gases, varilla y cargador curvo 7.62mm.',
    build: buildClassicRifleModel,
  },
  {
    id: 'shotgun',
    name: 'Escopeta de Corredera 12G',
    shortName: 'Escopeta 12G',
    category: 'Escopeta',
    description:
      'Cañón de gran ánima con disipador perforado, tubo cargador, corredera acanalada con barras cromadas, portacartuchos lateral con 5 cartuchos y miras Ghost-Ring.',
    build: buildShotgunModel,
  },
  {
    id: 'sniper-rifle',
    name: 'Rifle de Francotirador .338',
    shortName: 'Francotirador .338',
    category: 'Rifle de Precisión',
    description:
      'Cañón pesado acanalado con freno de boca de 3 cámaras, acción de cerrojo cromado, mira telescópica con lentes multicapa, culata esquelética regulable y bípode.',
    build: buildSniperRifleModel,
  },
];
