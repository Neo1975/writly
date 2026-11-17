import type { StructureTemplate } from "./structure";

/**
 * Strutture predefinite, in sola lettura (si clonano per personalizzarle).
 * I pesi sono indicativi e sommano a 100.
 */

const viaggioEroe: StructureTemplate = {
  id: "viaggio-eroe",
  nome: "Viaggio dell'eroe",
  descrizione: "Le 12 tappe di Christopher Vogler (da Campbell): l'eroe lascia il mondo ordinario, affronta la prova e torna trasformato.",
  origine: "",
  atti: [
    {
      id: "partenza",
      nome: "Atto I · Partenza",
      sezioni: [
        { id: "mondo-ordinario", nome: "Mondo ordinario", guida: "L'eroe nella sua vita di tutti i giorni: cosa gli manca, cosa ha da perdere.", peso: 5 },
        { id: "chiamata", nome: "Chiamata all'avventura", guida: "Un evento rompe l'equilibrio e propone una sfida.", peso: 5 },
        { id: "rifiuto", nome: "Rifiuto della chiamata", guida: "Paura, dubbio, obblighi: l'eroe esita.", peso: 5 },
        { id: "mentore", nome: "Incontro con il mentore", guida: "Qualcuno offre consiglio, un dono, il coraggio di partire.", peso: 5 },
        { id: "prima-soglia", nome: "Superamento della prima soglia", guida: "L'eroe si impegna ed entra nel mondo straordinario: non si torna indietro.", peso: 5 },
      ],
    },
    {
      id: "iniziazione",
      nome: "Atto II · Iniziazione",
      sezioni: [
        { id: "prove-alleati-nemici", nome: "Prove, alleati e nemici", guida: "Le regole del nuovo mondo; chi aiuta e chi ostacola.", peso: 15 },
        { id: "caverna", nome: "Avvicinamento alla caverna più profonda", guida: "Preparativi e tensione prima della prova decisiva.", peso: 10 },
        { id: "prova-centrale", nome: "Prova centrale", guida: "Il confronto con la paura più grande: una morte, reale o simbolica.", peso: 15 },
        { id: "ricompensa", nome: "Ricompensa", guida: "Sopravvissuto, l'eroe ottiene ciò che cercava (o lo capisce).", peso: 10 },
      ],
    },
    {
      id: "ritorno",
      nome: "Atto III · Ritorno",
      sezioni: [
        { id: "via-ritorno", nome: "La via del ritorno", guida: "Le conseguenze della prova lo inseguono; serve una scelta.", peso: 10 },
        { id: "resurrezione", nome: "Resurrezione", guida: "L'ultima prova, la più alta: l'eroe dimostra di essere cambiato.", peso: 10 },
        { id: "elisir", nome: "Ritorno con l'elisir", guida: "Torna a casa con qualcosa che cambia anche il mondo ordinario.", peso: 5 },
      ],
    },
  ],
};

const saveTheCat: StructureTemplate = {
  id: "save-the-cat",
  nome: "Save the Cat! (romanzo)",
  descrizione: "I 15 beat di Jessica Brody («Save the Cat! Writes a Novel»), dal metodo di Blake Snyder.",
  origine: "",
  atti: [
    {
      id: "atto-1",
      nome: "Atto 1 · Tesi",
      sezioni: [
        { id: "immagine-apertura", nome: "Immagine d'apertura", guida: "Un'istantanea del protagonista e del suo mondo prima del cambiamento.", peso: 1 },
        { id: "tema-enunciato", nome: "Tema enunciato", guida: "Qualcuno dice (o mostra) la lezione che il protagonista dovrà imparare.", peso: 1 },
        { id: "setup", nome: "Setup", guida: "Vita, difetti, desideri e ciò che va aggiustato.", peso: 8 },
        { id: "catalizzatore", nome: "Catalizzatore", guida: "L'evento che cambia tutto.", peso: 2 },
        { id: "dibattito", nome: "Dibattito", guida: "Il protagonista esita: cosa fare?", peso: 8 },
        { id: "secondo-atto", nome: "Passaggio al secondo atto", guida: "Sceglie di agire ed entra in un mondo capovolto.", peso: 2 },
      ],
    },
    {
      id: "atto-2a",
      nome: "Atto 2A · Antitesi",
      sezioni: [
        { id: "storia-b", nome: "Storia B", guida: "Un personaggio o una relazione che porta il tema.", peso: 2 },
        { id: "divertimento", nome: "Divertimento e giochi", guida: "La promessa della premessa: il protagonista nel nuovo mondo.", peso: 24 },
        { id: "punto-centrale", nome: "Punto centrale", guida: "Falsa vittoria o falsa sconfitta; la posta in gioco sale.", peso: 2 },
      ],
    },
    {
      id: "atto-2b",
      nome: "Atto 2B",
      sezioni: [
        { id: "cattivi", nome: "I cattivi si avvicinano", guida: "Nemici esterni e difetti interni stringono il cerchio.", peso: 23 },
        { id: "tutto-perduto", nome: "Tutto è perduto", guida: "Il punto più basso; spesso una perdita (il «sentore di morte»).", peso: 2 },
        { id: "notte-buia", nome: "Notte buia dell'anima", guida: "Il protagonista elabora la perdita e arriva all'intuizione.", peso: 5 },
      ],
    },
    {
      id: "atto-3",
      nome: "Atto 3 · Sintesi",
      sezioni: [
        { id: "terzo-atto", nome: "Passaggio al terzo atto", guida: "Ha capito cosa fare: unisce storia A e storia B.", peso: 2 },
        { id: "finale", nome: "Finale", guida: "Mette in pratica ciò che ha imparato e affronta la prova finale.", peso: 17 },
        { id: "immagine-finale", nome: "Immagine finale", guida: "Lo specchio dell'apertura: quanto è cambiato.", peso: 1 },
      ],
    },
  ],
};

const daraMarks: StructureTemplate = {
  id: "dara-marks",
  nome: "Arco trasformativo (Dara Marks)",
  descrizione:
    "Tre atti con punti di svolta, punto centrale e climax, letti insieme all'arco interiore del protagonista (da «Inside Story»): dal difetto fatale alla trasformazione. Sezioni proposte da Writly, da adattare.",
  origine: "",
  atti: [
    {
      id: "atto-1",
      nome: "Atto I",
      sezioni: [
        { id: "difetto-fatale", nome: "Mondo e difetto fatale", guida: "La vita del protagonista e la convinzione (il difetto) che lo protegge e lo limita.", peso: 10 },
        { id: "evento-scatenante", nome: "Evento scatenante", guida: "L'esterno mette in crisi l'equilibrio.", peso: 5 },
        { id: "resistenza", nome: "Resistenza al cambiamento", guida: "Il protagonista si aggrappa al vecchio modo di essere.", peso: 5 },
        { id: "primo-punto-svolta", nome: "Primo punto di svolta", guida: "Non può più tornare indietro: la storia esterna si mette in moto.", peso: 5 },
      ],
    },
    {
      id: "atto-2",
      nome: "Atto II",
      sezioni: [
        { id: "lotta", nome: "Lotta esteriore, resistenza interiore", guida: "Affronta gli ostacoli con le vecchie armi; il difetto gli costa caro.", peso: 15 },
        { id: "punto-centrale", nome: "Punto centrale: presa di coscienza", guida: "Intravede ciò che deve cambiare in sé.", peso: 5 },
        { id: "lasciare-andare", nome: "Lasciare andare", guida: "Comincia a staccarsi dal vecchio sé; il prezzo diventa concreto.", peso: 15 },
        { id: "crisi", nome: "Crisi", guida: "Il vecchio sé e il nuovo si scontrano.", peso: 10 },
        { id: "secondo-punto-svolta", nome: "Secondo punto di svolta", guida: "La scelta che porta al confronto finale.", peso: 5 },
      ],
    },
    {
      id: "atto-3",
      nome: "Atto III",
      sezioni: [
        { id: "climax", nome: "Climax: morte del vecchio sé", guida: "La prova esterna si vince solo con la trasformazione interiore.", peso: 15 },
        { id: "risoluzione", nome: "Risoluzione: il sé trasformato", guida: "Il nuovo equilibrio, interno ed esterno.", peso: 10 },
      ],
    },
  ],
};

const libero: StructureTemplate = {
  id: "libero",
  nome: "Libero",
  descrizione: "Un solo gruppo vuoto: aggiungi le tue sezioni.",
  origine: "",
  atti: [{ id: "parte-1", nome: "Parte 1", sezioni: [] }],
};

export const BUILTIN_TEMPLATES: readonly StructureTemplate[] = [viaggioEroe, saveTheCat, daraMarks, libero];

export function builtinTemplate(id: string): StructureTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
