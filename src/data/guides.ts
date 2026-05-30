export interface GuideItem {
  title: string;
  description: string;
  tip?: string;
  hotkey?: string;
}

export const GUIDE_DATABASE: Record<string, GuideItem> = {
  "Select": {
    title: "Seleziona & Ispeziona",
    description: "Scegli e modifica gli elementi geometrici disegnati. Fai clic su linee, cerchi o raccordi per regolarne colore, spessore o parametri. Puoi trascinare i cerchietti blu (maniglie) per allungarli o ruotarli.",
    tip: "Seleziona un elemento e premi il tasto CANC o DELETE sulla tua tastiera per eliminarlo all'istante.",
    hotkey: "Clic sinistro / CANC"
  },
  "Line": {
    title: "Segmento di Linea",
    description: "Traccia una linea retta millimetrica tra due punti nel piano. Clicca sul foglio per posizionare il punto di partenza, sposta il mouse e clicca di nuovo per il punto finale.",
    tip: "Se il MODO ORTO è attivo, traccia solo rette orizzontali e verticali fisse. Tieni premuto SHIFT per disattivarlo temporaneamente.",
    hotkey: "L"
  },
  "Circle": {
    title: "Arco e Cerchio CAD",
    description: "Disegna un cerchio perfetto specificandone prima il centro geometrico (primo clic) e poi definendone il raggio con lo spostamento del mouse (secondo clic).",
    tip: "Puoi regolare con precisione millimetrica il raggio digitando il valore numerico esatto nel pannello delle proprietà a destra.",
    hotkey: "C"
  },
  "Arc": {
    title: "Arco a 3 Punti",
    description: "Crea una spline ad arco perfettamente definita passante esattamente per tre coordinate nello spazio. Consente di definire archi di raccordo ampi o scanalature strutturali.",
    tip: "Fai clic per l'inizio, poi posiziona la curvatura intermedia, e infine clicca sul punto terminale.",
    hotkey: "A"
  },
  "Rectangle": {
    title: "Rettangolo Vettoriale",
    description: "Genera quattro linee adiacenti e ortonormali collegate tra loro partendo dall'angolo iniziale fino all'angolo diametralmente opposto. Verranno salvate come singoli vettori unibili.",
    tip: "Ottimo per creare muri perimetrali, piastre di base, cartigli personalizzati, o contorni esterni.",
    hotkey: "R"
  },
  "Point": {
    title: "Punto di Riferimento",
    description: "Lascia una coordinata marcata sul piano cartesiano. È estremamente comodo per pianificare agganci, distanze cumulative o punti d'appoggio per quote parametriche.",
    tip: "I punti non compaiono nelle stampe finali ed agiscono puramente da snap e linee guida.",
    hotkey: "P"
  },
  "Testo": {
    title: "Scrittura Testi & Quote",
    description: "Piazza un testo descrittivo direttamente sul foglio di lavoro. Clicca su un'area del foglio per inserire la prima riga, adatta l'orientamento, la dimensione e il font dal menu di destra.",
    tip: "Consigliato l'uso del font 'JetBrains Mono' per quote ingegneristiche e note d'officina.",
    hotkey: "T"
  },
  "Trim": {
    title: "Taglia Segmenti (Trim)",
    description: "Accorcia e tronca l'eccedenza di una linea o di un arco che si interseca con altri elementi. Supporta anche il taglio massivo: clicca e trascina per aprire una finestra di selezione e tagliare istantaneamente tutte le linee al suo interno come se fosse una fustella!",
    tip: "Oltre al click singolo, puoi tenere premuto il tasto sinistro in un'area vuota e trascinare per tagliare in blocco tutti i segmenti racchiusi dalla finestra.",
    hotkey: "X"
  },
  "Eraser": {
    title: "Gomma di Precisione",
    description: "Cancella elementi di disegno semplicemente scorrendo il cursore sopra di essi o premendo un singolo clic sopra il tracciato da eliminare.",
    tip: "Se vuoi eliminare in blocco o per layer, usa il pulsante della tastiera associato a 'Canc'.",
    hotkey: "E"
  },
  "Parallel": {
    title: "Parallelismo & Offset",
    description: "Genera una copia equidistante e traslata di una linea retta o curva ad una precisa distanza inserita a tastiera. Perfetto per realizzare spessori o bordi simmetrici.",
    tip: "Indica sul foglio da quale lato della linea originaria intendi collocare il segmento parallelo.",
    hotkey: "O"
  },
  "Join": {
    title: "Unisci Elementi (Join)",
    description: "Prende segmenti scollegati ma coincidenti nei loro estremi e li fonde in un unico tracciato continuo, ideale prima di eseguire lavorazioni CNC o raccordi complessi.",
    tip: "Fai clic sui segmenti adiacenti in sequenza per unirli ed evitare buchi di tolleranza.",
    hotkey: "J"
  },
  "Raccordo": {
    title: "Raccordo & Smusso CAD",
    description: "Arrotonda o smussa l'intersezione tra due linee non parallele. Supporta raccordi curvi (raggio costante) o smussi rettilinei bidimensionali di distanziamento regolabile.",
    tip: "I parametri possono essere modificati in diretta trascinando la finestra di dialogo e guardando i vettori aggiornarsi!",
    hotkey: "F"
  },
  "Move": {
    title: "Sposta Componenti",
    description: "Sposta uno o più elementi selezionati da una posizione iniziale sorgente ad un'altra meta. Fornisce precisione assoluta basata su vettori di spostamento o coordinate.",
    tip: "Seleziona gli oggetti, clicca su Sposta, scegli un punto d'origine base e clicca sulla sua nuova collocazione.",
    hotkey: "M"
  },
  "Copy": {
    title: "Duplicazione Vettoriale",
    description: "Crea una o più copie esatte degli oggetti selezionati salvando i duplicati a distanze relative desiderate dal punto origine indicato.",
    tip: "Utile per disporre elementi foranti, scanalature, pilastri o fori a distanze cadenzate.",
    hotkey: "Y"
  },
  "Dimension": {
    title: "Quotatura & Misure",
    description: "Rileva e annota sul cartiglio della tavola la distanza esatta in centimetri tra due punti qualsiasi agganciati con snap automatico.",
    tip: "La quota generata si aggiornerà in base allo stile impostato nella barra in alto.",
    hotkey: "D"
  },
  "Cancella": {
    title: "Elimina Elementi",
    description: "Rimuove l'elemento attualmente selezionato. Adatto sia per linee che per testi, blocchi, o punti singoli agganciati.",
    tip: "In alternativa puoi fare clic su Select, selezionare l'oggetto e premere CANC sulla tastiera.",
    hotkey: "Canc / Delete"
  },
  "Apri": {
    title: "Apri File CAD",
    description: "Importa un file in formato DXF o un salvataggio GECOLA CAD salvato precedentemente sul tuo hard disk esterno o locale.",
    tip: "Puoi trascinare il file .dxf direttamente sulla tela principale per importarlo al volo!",
    hotkey: "Ctrl + O"
  },
  "Salva": {
    title: "Salva Disegno",
    description: "Esporta e scarica il disegno corrente in formato .DXF o in pacchetto proprietario leggibile da GECOLA CAD per conservarlo.",
    tip: "I file .DXF esportati sono pronti per essere importati in AutoCAD, Illustrator, Inkscape o macchine taglio laser/CNC.",
    hotkey: "Ctrl + S"
  },
  "Importa": {
    title: "Importatore File DXF/DWG",
    description: "Importa disegni esterni AutoCAD conservandone la scala e i layers geometrici originali con estrema fedeltà.",
    tip: "Per compatibilità ottimale, esporta da AutoCAD in formato DXF R12 o AutoCAD 2000.",
    hotkey: "Click"
  },
  "Lettore DXF": {
    title: "Interprete Codice DXF ASCII",
    description: "Una finestra magico-interattiva dove puoi incollare il listato di righe in formato DXF per rigenerare immediatamente il disegno vettoriale.",
    tip: "Puoi usare uno dei 3 preset pronti per sperimentare o testare porzioni di disegno complesse.",
    hotkey: "Click"
  },
  "Tavole CAD": {
    title: "Gestore Tavole & Cartigli",
    description: "Accedi al pannello per configurare le tavole tecniche (A0, A1, A2, A3, A4), ruotare l'inquadratura, applicare cartigli normati UNI e descrizioni del progetto.",
    tip: "Fai doppio clic sul titolo di una tavola nell'elenco a sinistra per ricaricare la sua vista.",
    hotkey: "Click"
  },
  "Gemini AI": {
    title: "Assistente Intelligenza Artificiale",
    description: "Interagisci con l'Intelligenza Artificiale Gemini integrata per generare interi disegni complessi scrivendo indicazioni testuali libere.",
    tip: "Esempio: 'Disegnami una piastra rettangolare spessore 12 con quattro cerchi negli angoli'.",
    hotkey: "Click"
  },
  "Incrocio CAD": {
    title: "Mirino CAD (Crosshair)",
    description: "Ingrandisce le guide del mouse in assi ortogonali infiniti che tagliano verticalmente e orizzontalmente tutto lo schermo per un perfetto riscontro d'assi.",
    tip: "Molto raccomandato per allineare geometrie distanti senza tracciare linee fittizie.",
    hotkey: "Click"
  },
  "Classico (Tecnigrafo)": {
    title: "Reticolo Tecnigrafo",
    description: "Attiva le guide graduate solidali al cursore simulate secondo l'iconografia storica dei tecnigrafi professionali da disegno tecnico di precisione.",
    tip: "Combina il tecnigrafo con il MODO ORTO per non commettere errori di parallasse.",
    hotkey: "Click"
  },
  "Modo Orto": {
    title: "Modo Ortogonale (Modo Orto)",
    description: "Forza il puntatore delle linee e delle figure a muoversi rigorosamente lungo angoli fissi e perpendicolari di 0° e 90°.",
    tip: "Mentre disegni, tieni premuto SHIFT sulla tastiera per disattivare temporaneamente il vincolo ortogonale.",
    hotkey: "Ortho"
  },
  "Penne": {
    title: "Spessore Tratti",
    description: "Imposta lo spessore corrente del tratto (0.1 mm, 0.2 mm, 0.35 mm, etc.) simulando l'utilizzo delle diverse chine professionali in fase di tracciamento.",
    tip: "I tratti più spessi sono particolarmente indicati per le sagome esterne degli oggetti, i più sottili per la quotatura.",
    hotkey: "Click"
  },
  "Layers": {
    title: "Gestione dei Layer",
    description: "Consente di organizzare il disegno CAD dividendo gli elementi in livelli logici sovrapponibili (es. Quote, Assi, Struttura). Puoi accendere/spegnere la visibilità, congelare elementi o creare nuovi layer.",
    tip: "Utilizza i colori dei layer per differenziare a colpo d'occhio i vari elementi sul foglio elettronico.",
    hotkey: "F2"
  },
  "Maschere": {
    title: "Libreria Maschere CAD",
    description: "Espande una galleria di sagome geometriche pronte all'uso e blocchi parametrici da importare. Include elementi normati per impianti, sanitari, frecce, profilati d'acciaio o forature.",
    tip: "Usa il clic destro sul foglio mentre trascini una maschera per ruotarla di 45° prima di posizionarla!",
    hotkey: "M"
  },
  "Specchio": {
    title: "Specchio (Mirror)",
    description: "Crea una copia speculare di uno o più elementi rispetto a un asse di simmetria definito da due punti. Ideale per progettazione meccanica simmetrica.",
    tip: "Seleziona gli oggetti, clicca sull'asse di simmetria: il sistema genererà automaticamente la riflessione speculare.",
    hotkey: "S"
  },
  "Hatch": {
    title: "Tratteggio (Hatch)",
    description: "Applica un riempimento o un motivo di tratteggio all'interno di una forma chiusa delimitata da segmenti. Utile per evidenziare sezioni di taglio o materiali.",
    tip: "Seleziona l'area chiusa, scegli il tipo di tratteggio, la scala e l'angolo nel pannello delle proprietà.",
    hotkey: "H"
  },
  "Annulla": {
    title: "Annulla Ultima Azione (Undo)",
    description: "Ripristina lo stato del disegno ad una modifica precedente, annullando l'ultimo tracciato, cancellazione o modifica effettuata.",
    tip: "È possibile annullare all'infinito fino all'apertura iniziale della sessione.",
    hotkey: "Ctrl + Z"
  },
  "Ripristina": {
    title: "Ripristina Azione (Redo)",
    description: "Riapplica l'azione precedentemente annullata tramite il comando Annulla, ripristinando le modifiche vettoriali.",
    tip: "Disponibile solo subito dopo aver usato Annulla prima di tracciare nuovi elementi.",
    hotkey: "Ctrl + Y"
  }
};
