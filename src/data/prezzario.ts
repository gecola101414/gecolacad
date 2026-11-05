import { PrezzarioItem } from '../types';

export const PREZZARIO_GECOLA: PrezzarioItem[] = [
  {
    codice: 'INT.01',
    descrizione: 'Intonaco civile per interni ed esterni, spessore 1.5cm',
    unita: 'mq',
    prezzo: 18.50,
    categoria: 'Intonaci',
    incidenzaManodopera: 70
  },
  {
    codice: 'PIT.01',
    descrizione: 'Tinteggiatura con pittura lavabile bianca, due mani',
    unita: 'mq',
    prezzo: 12.00,
    categoria: 'Pitturazioni',
    incidenzaManodopera: 80
  },
  {
    codice: 'ISO.01',
    descrizione: 'Isolamento a cappotto in EPS, spessore 10cm',
    unita: 'mq',
    prezzo: 45.00,
    categoria: 'Isolamenti',
    incidenzaManodopera: 50
  },
  {
    codice: 'DEM.01',
    descrizione: 'Demolizione di muratura in mattoni pieni',
    unita: 'mc',
    prezzo: 120.00,
    categoria: 'Demolizioni',
    incidenzaManodopera: 90
  },
  {
    codice: 'MUR.01',
    descrizione: 'Costruzione di muratura portante in blocchi termici',
    unita: 'mc',
    prezzo: 210.00,
    categoria: 'Murature',
    incidenzaManodopera: 40
  }
];
