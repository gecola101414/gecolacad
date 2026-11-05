export interface HatchPattern {
  id: string;
  name: string;
  description: string;
}

export const BIM_HATCH_PATTERNS: HatchPattern[] = [
  { id: 'SOLID', name: 'Solido (Pieno)', description: 'Riempimento colore uniforme' },
  { id: 'NONE', name: 'Nessuno', description: 'Solo contorno dell\'elemento' },
  { id: 'ANSI31', name: 'Tratteggio 45°', description: 'Tratteggio diagonale standard' },
  { id: 'CROSS', name: 'Reticolo 90°', description: 'Griglia quadrata standard' },
  { id: 'TILE_50X40', name: 'Piastrelle 50x40', description: 'Pavimentazione rettangolare 50x40cm' },
  { id: 'TILE_60X60', name: 'Piastrelle 60x60', description: 'Pavimentazione quadrata 60x60cm' },
  { id: 'TILE_30X30', name: 'Piastrelle 30x30', description: 'Pavimentazione quadrata 30x30cm' },
  { id: 'TILE_10X10', name: 'Mosaico 10x10', description: 'Rivestimento mosaico 10x10cm' },
  { id: 'PARQUET_STRIP', name: 'Parquet a Correre', description: 'Doghe di legno longitudinali' },
  { id: 'PARQUET_HERRINGBONE', name: 'Parquet Spina Pesce', description: 'Posa a spina di pesce classica' },
  { id: 'BRICK_STRETCHER', name: 'Mattoni a Cortina', description: 'Tessitura muraria a mattoni sfalsati' },
  { id: 'BRICK_BOND', name: 'Mattoni in Quarta', description: 'Tessitura muraria classica' },
  { id: 'STONE_RANDOM', name: 'Pietra Irregolare', description: 'Opus incertum / Pietrame' },
  { id: 'CONCRETE', name: 'Calcestruzzo', description: 'Puntinato per getti in cls' },
  { id: 'GRAVEL', name: 'Ghiaia / Inerti', description: 'Riempimento per vespai o esterni' },
  { id: 'SAND', name: 'Sabbia', description: 'Puntinato fine per strati di sabbia' },
  { id: 'INSULATION', name: 'Isolante Termico', description: 'Andamento a zig-zag per coibentazioni' },
  { id: 'WOOD_VENEER', name: 'Venatura Legno', description: 'Texture decorativa legno' },
  { id: 'MARBLE', name: 'Marmo / Venato', description: 'Texture decorativa marmo' },
  { id: 'METAL_DECK', name: 'Lamiera Grecata', description: 'Profilo per solai collaboranti' },
  { id: 'DOTS', name: 'Puntinato Medio', description: 'Texture generica puntinata' },
  { id: 'HEXAGON', name: 'Esagonale', description: 'Pavimentazione a nido d\'ape' },
];
