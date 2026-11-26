import {
  buildA10Warthog,
  buildAC130Gunship,
  buildBiplaneScout,
  buildF22Raptor,
} from './airplanes';
import {
  buildAH64Apache,
  buildAH6LittleBird,
  buildCH47Chinook,
  buildKa52Alligator,
} from './helicopters';
import { AircraftDefinition } from './types';

export const AIRCRAFT_CATALOG: AircraftDefinition[] = [
  {
    id: 'f22-raptor',
    code: 'F-22X',
    name: 'Caza Supersónico Furtivo',
    categoryLabel: 'Avión Jet de Superioridad Aérea',
    vehicleClass: 'airplane',
    scaleNote: 'Ala trapezoidal furtiva · Doble deriva inclinada',
    cameraDistance: 7.4,
    cameraElevation: 2.5,
    build: buildF22Raptor,
    subsystems: [
      {
        category: 'cannon',
        name: 'Cañón M61A2 Vulcan 20mm + AIM-120C',
        detail: 'Cañón rotatorio séxtuple en raíz alar derecha y 4 misiles internos.',
      },
      {
        category: 'magazine',
        name: 'Tambor Helicoidal sin Eslabones + Bahía Ventral',
        detail: 'Tambor de 480 proyectiles con conducto curvo de alimentación.',
      },
      {
        category: 'thrusters',
        name: 'Doble Turbofán F119 con Tobera Vectorial 2D',
        detail: 'Pétalos de titanio móviles y núcleo postquemador incandescente.',
      },
      {
        category: 'sight',
        name: 'HUD Holográfico + Prisma EOTS Ventral',
        detail: 'Combinador óptico verde en cabina y sensor electro-óptico facetado.',
      },
      {
        category: 'mechanisms',
        name: 'Tren Triciclo, Flaperones y Compuertas',
        detail: 'Amortiguadores oleoneumáticos, estabilizadores y compuertas furtivas.',
      },
    ],
  },
  {
    id: 'a10-warthog',
    code: 'A-10C',
    name: 'Avión de Ataque Pesado CAS',
    categoryLabel: 'Avión Bimotor Turbofán Blindado',
    vehicleClass: 'airplane',
    scaleNote: 'Ala recta baja · Góndolas traseras · Cola en H',
    cameraDistance: 7.8,
    cameraElevation: 2.6,
    build: buildA10Warthog,
    subsystems: [
      {
        category: 'cannon',
        name: 'Cañón Rotatorio GAU-8/A Avenger 30mm',
        detail: '7 tubos en el morro con abrazaderas, más cohetes Hydra y AGM-65.',
      },
      {
        category: 'magazine',
        name: 'Tambor Cilíndrico de 1.174 Proyectiles',
        detail: 'Gran tambor ventral expuesto con conducto flexible de cartuchos de latón.',
      },
      {
        category: 'thrusters',
        name: 'Doble Turbofán GE TF34 de Alto Bypass',
        detail: 'Góndolas traseras elevadas con rotores frontales de 14 álabes.',
      },
      {
        category: 'sight',
        name: 'Pod Láser/FLIR AN/AAQ-28 LITENING + HUD',
        detail: 'Barquilla subalar con cabezal óptico giroestabilizado y HUD blindado.',
      },
      {
        category: 'mechanisms',
        name: 'Aerofrenos Partidos, Pilones y Tren Semirretraído',
        detail: 'Carenados subalares, timones dobles y tren desplazado.',
      },
    ],
  },
  {
    id: 'ac130-gunship',
    code: 'AC-130J',
    name: 'Cañonero Táctico Cuatrimotor',
    categoryLabel: 'Avión Pesado Turbohélice de Ala Alta',
    vehicleClass: 'airplane',
    scaleNote: 'Ala alta de gran envergadura · Artillería a babor',
    cameraDistance: 8.8,
    cameraElevation: 2.9,
    build: buildAC130Gunship,
    subsystems: [
      {
        category: 'cannon',
        name: 'Obús M102 105mm + Cañón GAU-23 30mm',
        detail: 'Batería lateral a babor con frenos de boca y misiles subalares.',
      },
      {
        category: 'magazine',
        name: 'Rack de Obuses de Latón + Tambor de 30mm',
        detail: 'Estiba lateral de proyectiles de 105mm y tolva alimentadora.',
      },
      {
        category: 'thrusters',
        name: '4 Motores Turbohélice AE 2100D3 (6 Palas)',
        detail: 'Cuatro góndolas con toma inferior de radiador y hélices cimitarra.',
      },
      {
        category: 'sight',
        name: 'Doble Torreta Multiespectral MX-20 + HUD Dual',
        detail: ' Esferas FLIR/láser bajo morro y pómulo babor más doble HUD en puente.',
      },
      {
        category: 'mechanisms',
        name: 'Rampa Hidráulica Trasera, Flaps y Tren Tándem',
        detail: 'Compuerta trasera con cilindros cromados y tren cuádruple en góndolas.',
      },
    ],
  },
  {
    id: 'biplane-scout',
    code: 'F3F-B',
    name: 'Biplano Táctico de Motor Radial',
    categoryLabel: 'Avión Biplano Clásico de Caza',
    vehicleClass: 'airplane',
    scaleNote: 'Doble plano arriostrado · Motor radial descubierto',
    cameraDistance: 6.8,
    cameraElevation: 2.3,
    build: buildBiplaneScout,
    subsystems: [
      {
        category: 'cannon',
        name: 'Doble Ametralladora Sincronizada sobre Capó',
        detail: 'Cañones gemelos con camisas perforadas de refrigeración y apagallamas.',
      },
      {
        category: 'magazine',
        name: 'Tambores Circulares Superiores (Pan Drums)',
        detail: 'Doble cargador circular de plato con núcleo de munición en latón.',
      },
      {
        category: 'thrusters',
        name: 'Motor Radial de 9 Cilindros + Hélice de Caoba',
        detail: 'Cilindros aleteados, colector de escape y hélice bipala con punteras de latón.',
      },
      {
        category: 'sight',
        name: 'Mira Telescópica Tubular Aldis + Alza Anular',
        detail: 'Tubo óptico de latón con lente esmeralda y anillo colimador frontal.',
      },
      {
        category: 'mechanisms',
        name: 'Montantes en N, Cables Tensores y Tren Fijo en V',
        detail: 'Arriostramiento interplanar completo, varillas de empuje y rueda de cola.',
      },
    ],
  },
  {
    id: 'ah64-apache',
    code: 'AH-64D',
    name: 'Helicóptero de Ataque en Tándem',
    categoryLabel: 'Helicóptero Pesado Anticarro',
    vehicleClass: 'helicopter',
    scaleNote: 'Cabina escalonada blindada · Radar de mástil',
    cameraDistance: 7.5,
    cameraElevation: 2.6,
    build: buildAH64Apache,
    subsystems: [
      {
        category: 'cannon',
        name: 'Cañón Articulado M230 30mm + Cohetes/Hellfire',
        detail: 'Torreta ventral móvil de 30mm, pods Hydra-70 y racks cuádruples AGM-114.',
      },
      {
        category: 'magazine',
        name: 'Tolva Central de 1.200 Cartuchos + Cinta Flexible',
        detail: 'Depósito ventral de 30mm conectado por guía flexible a la torreta.',
      },
      {
        category: 'thrusters',
        name: 'Doble Turboeje GE T700 con Supresor IR',
        detail: 'Góndolas laterales con separador de partículas y escape Black Hole.',
      },
      {
        category: 'sight',
        name: 'Torreta Frontal TADS/PNVS + Radar Longbow',
        detail: 'Doble sensor electro-óptico en morro, HUD y domo milimétrico en mástil.',
      },
      {
        category: 'mechanisms',
        name: 'Plato Cíclico de 4 Palas y Rotor de Cola en X',
        detail: 'Servos hidráulicos, bieletas de paso, amortiguadores y rotor asimétrico.',
      },
    ],
  },
  {
    id: 'ka52-alligator',
    code: 'KA-52',
    name: 'Helicóptero de Ataque Coaxial',
    categoryLabel: 'Helicóptero Contrarrotatorio sin Rotor de Cola',
    vehicleClass: 'helicopter',
    scaleNote: 'Doble rotor coaxial · Cabina lado a lado · Morro plano',
    cameraDistance: 7.6,
    cameraElevation: 2.8,
    build: buildKa52Alligator,
    subsystems: [
      {
        category: 'cannon',
        name: 'Cañón Lateral Shipunov 2A42 30mm + Misiles Vikhr',
        detail: 'Cañón pesado en costado estribor con freno de boca, cohetes y ATGM.',
      },
      {
        category: 'magazine',
        name: 'Doble Caja Selectora de Munición AP / HE',
        detail: 'Dos cajones alimentadores independientes con cintas visibles de latón.',
      },
      {
        category: 'thrusters',
        name: 'Doble Turboeje Klimov VK-2500',
        detail: 'Cúpulas antipartículas delanteras y toberas de escape divergentes.',
      },
      {
        category: 'sight',
        name: 'Doble Esfera Óptica GOES-451 + HUD Gemelo',
        detail: 'Torretas giroestabilizadas bajo morro y vientre con lentes multicapa.',
      },
      {
        category: 'mechanisms',
        name: 'Doble Cabezal Coaxial Contrarrotatorio + Tren Triciclo',
        detail: 'Dos rotores superpuestos de 3 palas con platos cíclicos acoplados.',
      },
    ],
  },
  {
    id: 'ch47-chinook',
    code: 'CH-47F',
    name: 'Helicóptero Pesado Rotor en Tándem',
    categoryLabel: 'Helicóptero Bimotor de Transporte y Asalto',
    vehicleClass: 'helicopter',
    scaleNote: 'Doble rotor longitudinal sincronizado · Rampa trasera',
    cameraDistance: 8.2,
    cameraElevation: 2.9,
    build: buildCH47Chinook,
    subsystems: [
      {
        category: 'cannon',
        name: 'Doble Minigun M134 7.62mm en Troneras Laterales',
        detail: 'Ametralladoras rotatorias de 6 tubos en ventanillas delanteras.',
      },
      {
        category: 'magazine',
        name: 'Tolvas Internas de 4.000 Cartuchos con Guías',
        detail: 'Tambores de gran capacidad en cabina con conductos flexibles de cinta.',
      },
      {
        category: 'thrusters',
        name: 'Doble Turboeje Honeywell T55 en Pilón Trasero',
        detail: 'Motores externos con rejilla frontal de admisión y toberas de titanio.',
      },
      {
        category: 'sight',
        name: 'Domo Radar de Morro + Torreta FLIR Ventral',
        detail: 'Sensor meteorológico/terreno en proa, bola FLIR y doble HUD.',
      },
      {
        category: 'mechanisms',
        name: 'Doble Rotor Longitudinal Contrarrotatorio + Rampa',
        detail: 'Rotores desfasados sincronizados, rampa trasera abatible y 6 ruedas.',
      },
    ],
  },
  {
    id: 'ah6-littlebird',
    code: 'AH-6J',
    name: 'Helicóptero Ligero de Asalto',
    categoryLabel: 'Helicóptero Compacto de Operaciones Especiales',
    vehicleClass: 'helicopter',
    scaleNote: 'Cabina burbuja ovoidal · Patines · Bancada de armas',
    cameraDistance: 6.4,
    cameraElevation: 2.2,
    build: buildAH6LittleBird,
    subsystems: [
      {
        category: 'cannon',
        name: 'Doble Minigun M134 + Lanzacohetes M260',
        detail: 'Dos cañones rotatorios de 6 tubos y dos pods Hydra sobre bancada.',
      },
      {
        category: 'magazine',
        name: 'Depósito Central de 6.000 Cartuchos + Doble Conducto',
        detail: 'Tambor transversal en cabina trasera con guías flexibles hacia ambos lados.',
      },
      {
        category: 'thrusters',
        name: 'Turboeje Rolls-Royce T63 con Escape Oblicuo',
        detail: 'Tomas dorsales dobles y tubo de escape inclinado incandescente.',
      },
      {
        category: 'sight',
        name: 'Torreta FLIR AN/AAQ-22 bajo Barbilla + HUD',
        detail: 'Esfera electro-óptica bajo la burbuja frontal y mira reflectora.',
      },
      {
        category: 'mechanisms',
        name: 'Rotor Principal de 5 Palas, Patines y Cola en T',
        detail: 'Cabeza articulada pentapala, rotor antipar cuatripala y patines tubulares.',
      },
    ],
  },
];
