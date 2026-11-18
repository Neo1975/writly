# Fruibilità da cellulare — analisi (18 novembre 2026)

Stato: **da valutare più avanti**. Nessuna modifica fatta: questo documento
raccoglie l'analisi e le proposte.

## Metodo

- iPhone 13 emulato (390×844, schermo touch, Chromium con Playwright) contro
  un GitHub finto, con tre progetti realistici: struttura e scene, personaggi
  e relazioni, mondo con mappa, storia e regole, appunti, glossario, commenti.
- Misure automatiche su 15 pagine: scorrimento orizzontale, tasti sotto i
  32 px, campi con carattere sotto i 16 px (su iPhone fanno ingrandire la
  pagina al tocco), elementi fuori schermo.
- Prove a mano delle azioni principali: scrivere e salvare, toccare un
  commento, storico, aprire una scheda, modificare una scena, segnaposto sulla
  mappa, esportare.
- Limite: browser emulato, non un iPhone vero. Tastiera virtuale e barre di
  Safari possono cambiare qualcosa: serve una prova su un dispositivo reale.

## Giudizio

Funziona tutto, ma è pensata per il computer. Sul telefono va bene per
consultare, rileggere e fare piccole modifiche; per scrivere a lungo e per
organizzare il lavoro è faticosa.

## Cosa va bene

- Nessuna pagina scorre in orizzontale (tabelle, mappa e bacheca comprese).
- Le finestre (Salva versione, Storico, Scena) stanno nello schermo e i
  pulsanti si raggiungono.
- Export: il PDF si genera, si vede in anteprima e si scarica; idem EPUB e
  DOCX.
- Il testo del capitolo è leggibile (carattere grande, giustezza adatta).
- Scrittura, bozza locale, salvataggio, storico e commenti funzionano.
- La barra di formattazione resta in alto mentre si scorre il testo.

## Problemi, dal più grave

| # | Problema | Dove | Misura |
|---|---|---|---|
| 1 | Zoom automatico di Safari al tocco dei campi (carattere a 15 px, serve almeno 16) | 12 pagine su 15: personaggi (19 campi), mondo (9), appunti, esporta, stato del capitolo nell'editor | — |
| 2 | Il testo del capitolo parte troppo in basso; «Salva versione» sparisce appena si scorre | Editor | testo a 508 px dall'alto su 844 |
| 3 | Il pannello laterale finisce sotto tutto il testo: toccando un passaggio commentato la pagina salta in fondo e la frase sparisce | Editor | salto di ~580 px |
| 4 | Elenco sopra, scheda sotto: toccando un elemento la scheda si apre fuori schermo e sembra che non succeda nulla | Personaggi, Mondo, Appunti | campo Nome a 686 px su 664 visibili |
| 5 | Troppo spazio prima del contenuto: menu in alto su due righe, schede del progetto su due righe, titolo e descrizione | Tutte | bacheca: prima scena a 1.015 px |
| 6 | Tasti piccoli per un dito (minimo comodo ~44 px) | Bacheca ↑↓ 29×26; segnaposti mappa 25×25; caselle di stile 13 px; link «← Libreria» alti 16 px | — |
| 7 | Funzioni poco adatte al telefono | Trascinamento delle scene (non funziona col tocco; restano ↑↓ e il campo «Sezione»); confronto affiancato e in colonne nello storico (illeggibile su 390 px) | — |

## Proposte, in ordine

1. **Subito, poco lavoro**
   - campi a 16 px sotto i 600 px di larghezza;
   - tasti e segnaposti di almeno 44 px;
   - storico in modalità «in linea» sul telefono.
2. **Editor sul telefono**
   - intestazione compatta su una riga (parole e stato);
   - «Salva versione» nella barra che resta in alto;
   - pannello come cassetto dal basso, aperto da «Pannello» o toccando un
     commento, che si chiude tornando al punto del testo.
3. **Navigazione**
   - menu in alto su una riga;
   - schede del progetto in una riga che scorre di lato;
   - elenco e scheda come due schermate, con «← Elenco» per tornare
     (Personaggi, Mondo, Appunti).
4. **Bacheca**: sezioni richiudibili, per leggere la struttura in un colpo
   d'occhio.

## Come rifare la verifica

Gli script usati (non nel repository) misuravano, per ogni pagina,
`scrollWidth - innerWidth`, i tasti visibili sotto 32 px, i campi con
`font-size` sotto 16 px e la posizione verticale degli elementi chiave dopo le
azioni. Si possono ricreare come test end-to-end con Playwright e il profilo
`devices["iPhone 13"]`.

## iPad (verifica dello stesso giorno)

iPad emulati (iPad 7ª generazione e iPad Pro 11, nei due orientamenti),
editor di un capitolo con commenti.

| Dispositivo | Area | Pannello | Scorre solo il testo | Scorrimento orizzontale | Campi con zoom |
|---|---|---|---|---|---|
| iPad, orizzontale | 1080×810 | a destra | sì | no | 2 |
| iPad Pro 11, orizzontale | 1194×834 | a destra | sì | no | 2 |
| iPad, verticale | 810×1080 | sotto il testo | no | no | 2 |
| iPad Pro 11, verticale | 834×1194 | sotto il testo | no | no | 2 |

- In orizzontale l'esperienza è quella del computer: buona, anche con una
  tastiera esterna.
- In verticale (sotto i 1000 px) prende la disposizione del telefono, con il
  pannello sotto il testo. Fra 768 e 1000 px c'è spazio per un pannello
  laterale più stretto (circa 260 px): da valutare insieme alle proposte sopra.
- I due campi con zoom sono lo stato del capitolo e l'obiettivo della sessione
  (vedi punto 1).
