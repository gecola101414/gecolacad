
export interface BIMFamily {
  id: string;
  name: string;
  description: string;
  defaultColor: string;
  category: 'struttura' | 'architettura' | 'impianti' | 'finiture' | 'esterno';
  defaultPrice?: number;
  defaultUnit?: string;
}

export const BIM_FAMILIES: BIMFamily[] = [
  { id: 'fondazioni', name: 'Fondazioni', description: 'Plinti, travi rovesce, platee', defaultColor: '#4b5563', category: 'struttura', defaultPrice: 450, defaultUnit: 'mc' },
  { id: 'pilastri_ca', name: 'Strutture in C.A.', description: 'Pilastri e travi in cemento armato', defaultColor: '#6b7280', category: 'struttura', defaultPrice: 550, defaultUnit: 'mc' },
  { id: 'massetti', name: 'Massetti', description: 'Massetti di sottofondo e pendenze', defaultColor: '#9ca3af', category: 'finiture', defaultPrice: 25, defaultUnit: 'mq' },
  { id: 'murature_portanti', name: 'Murature Portanti', description: 'Muri maestri in mattoni o blocchi', defaultColor: '#b91c1c', category: 'architettura', defaultPrice: 65, defaultUnit: 'mq' },
  { id: 'tramezzature', name: 'Tramezzature', description: 'Pareti divisorie interne in laterizio', defaultColor: '#ef4444', category: 'architettura', defaultPrice: 45, defaultUnit: 'mq' },
  { id: 'cartongesso', name: 'Pareti in Cartongesso', description: 'Sistemi a secco e contropareti', defaultColor: '#fbbf24', category: 'architettura', defaultPrice: 55, defaultUnit: 'mq' },
  { id: 'intonaco_completo', name: 'Intonaco completo', description: 'Intonaco di fondo e finitura (civile)', defaultColor: '#f3f4f6', category: 'finiture', defaultPrice: 32, defaultUnit: 'mq' },
  { id: 'intonaco_rustico', name: 'Intonaco rustico', description: 'Intonaco grezzo a superficie irregolare', defaultColor: '#b0aca8', category: 'finiture', defaultPrice: 18, defaultUnit: 'mq' },
  { id: 'pitture', name: 'Opere da Pittore', description: 'Tinteggiature, smalti e decorazioni', defaultColor: '#60a5fa', category: 'finiture', defaultPrice: 12, defaultUnit: 'mq' },
  { id: 'rivestimenti', name: 'Rivestimenti', description: 'Piastrelle ceramiche e pietre a parete', defaultColor: '#34d399', category: 'finiture', defaultPrice: 85, defaultUnit: 'mq' },
  { id: 'pavimenti', name: 'Pavimenti', description: 'Gres, parquet, marmi e resine', defaultColor: '#d97706', category: 'finiture', defaultPrice: 75, defaultUnit: 'mq' },
  { id: 'impermeabilizzazioni', name: 'Impermeabilizzazioni', description: 'Guaine e trattamenti anti-umidità', defaultColor: '#1e3a8a', category: 'struttura', defaultPrice: 15, defaultUnit: 'mq' },
  { id: 'isolamenti_termici', name: 'Isolamenti Termici', description: 'Cappotti e pannelli isolanti', defaultColor: '#10b981', category: 'architettura', defaultPrice: 110, defaultUnit: 'mq' },
  { id: 'serramenti_esterni', name: 'Serramenti Esterni', description: 'Finestre e portafinestre', defaultColor: '#0ea5e9', category: 'architettura', defaultPrice: 850, defaultUnit: 'cad' },
  { id: 'porte_interne', name: 'Porte Interne', description: 'Porte a battente, scorrevoli e a scomparsa', defaultColor: '#8b5cf6', category: 'architettura', defaultPrice: 450, defaultUnit: 'cad' },
  { id: 'impianto_idrico', name: 'Impianto Idrico-Sanitario', description: 'Tubazioni e scarichi', defaultColor: '#2563eb', category: 'impianti', defaultPrice: 1200, defaultUnit: 'cad' },
  { id: 'impianto_elettrico', name: 'Impianto Elettrico', description: 'Punti luce, prese e quadri', defaultColor: '#eab308', category: 'impianti', defaultPrice: 85, defaultUnit: 'cad' },
  { id: 'termico_clima', name: 'Riscaldamento e Clima', description: 'Radiatori, split e fancoil', defaultColor: '#f97316', category: 'impianti', defaultPrice: 650, defaultUnit: 'cad' },
  { id: 'controsoffitti', name: 'Controsoffitti', description: 'Soffittature tecniche e decorative', defaultColor: '#fde047', category: 'architettura', defaultPrice: 48, defaultUnit: 'mq' },
  { id: 'scale_parapetti', name: 'Scale e Parapetti', description: 'Strutture di collegamento verticale', defaultColor: '#475569', category: 'architettura', defaultPrice: 2500, defaultUnit: 'cad' },
  { id: 'arredo_bagno', name: 'Arredo Bagno', description: 'Sanitari e rubinetterie', defaultColor: '#6ee7b7', category: 'architettura', defaultPrice: 1500, defaultUnit: 'cad' },
  { id: 'solaio_interpiano', name: 'Solaio Interpiano', description: 'Solai in laterocemento o legno', defaultColor: '#1f2937', category: 'struttura', defaultPrice: 180, defaultUnit: 'mq' },
  { id: 'coperture', name: 'Coperture', description: 'Tetti a falde o piani', defaultColor: '#065f46', category: 'architettura', defaultPrice: 220, defaultUnit: 'mq' },
  { id: 'casseri_ca', name: 'Casseri C.A.', description: 'Casseri per cemento armato con tiranti', defaultColor: '#854d0e', category: 'struttura', defaultPrice: 25, defaultUnit: 'mq' },
  { id: 'pavimenti_50x100', name: 'Pavimenti 50x100', description: 'Gres porcellanato formato 50x100 cm', defaultColor: '#92400e', category: 'finiture', defaultPrice: 95, defaultUnit: 'mq' },
  { id: 'ponteggio', name: 'Ponteggio', description: 'Ponteggio metallico fisso a telai prefabbricati', defaultColor: '#ea580c', category: 'esterno', defaultPrice: 15, defaultUnit: 'mq' },
  { id: 'mantovana', name: 'Mantovana di Sicurezza', description: 'Mantovana di sicurezza in lamiera metallica per ponteggi', defaultColor: '#1e293b', category: 'esterno', defaultPrice: 85, defaultUnit: 'm' }
];
