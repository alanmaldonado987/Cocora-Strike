import { AIRCRAFT_CATALOG } from "./models";
import type { PartCategory } from "./models/types";

const labels: Record<string, [string, string, string]> = {
  "ac130-gunship": [
    "Ghostrider",
    "Cañonero táctico",
    "Ala alta · Cuatro turbohélices",
  ],
  "f22-raptor": [
    "Raptor",
    "Caza de superioridad aérea",
    "Ala trapezoidal · Doble turbofán",
  ],
  "a10-warthog": [
    "Thunderbolt II",
    "Avión de apoyo cercano",
    "Ala recta · Doble turbofán",
  ],
  "biplane-scout": [
    "Grumman",
    "Biplano de reconocimiento",
    "Doble plano · Motor radial",
  ],
  "ah64-apache": [
    "Apache",
    "Helicóptero de ataque",
    "Cabina en tándem · Rotor de cuatro palas",
  ],
  "ka52-alligator": [
    "Alligator",
    "Helicóptero coaxial",
    "Doble rotor · Cabina lado a lado",
  ],
  "ch47-chinook": [
    "Chinook",
    "Helicóptero de transporte",
    "Rotor en tándem · Doble turboeje",
  ],
  "ah6-littlebird": [
    "Little Bird",
    "Helicóptero ligero",
    "Cabina panorámica · Rotor de cinco palas",
  ],
};
export const LIBRARY = [
  "ac130-gunship",
  "f22-raptor",
  "a10-warthog",
  "biplane-scout",
  "ah64-apache",
  "ka52-alligator",
  "ch47-chinook",
  "ah6-littlebird",
].map((id) => {
  const def = AIRCRAFT_CATALOG.find((a) => a.id === id)!;
  return {
    ...def,
    nickname: labels[id][0],
    role: labels[id][1],
    description: labels[id][2],
  };
});
export const COMPONENTS: { id: PartCategory; label: string; detail: string }[] =
  [
    {
      id: "airframe",
      label: "Fuselaje",
      detail: "Piel exterior, superficies aerodinámicas y cabina acristalada.",
    },
    {
      id: "thrusters",
      label: "Propulsión",
      detail: "Motores, carenados y elementos de propulsión.",
    },
    {
      id: "cannon",
      label: "Armamento",
      detail: "Elementos exteriores y soportes integrados en la estructura.",
    },
    {
      id: "magazine",
      label: "Cargadores",
      detail: "Volúmenes de los depósitos y sus carcasas.",
    },
    {
      id: "sight",
      label: "Óptica y sensores",
      detail:
        "Cristales ópticos, carcasas de sensores e indicadores de cabina.",
    },
    {
      id: "mechanisms",
      label: "Mecanismos",
      detail: "Trenes de aterrizaje, articulaciones y superficies móviles.",
    },
  ];
