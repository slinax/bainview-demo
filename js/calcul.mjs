/* Bainview — règles métier.
 *
 * Ce module ne dépend d'aucune bibliothèque graphique : il décrit le catalogue,
 * les règles de dimensionnement, le métré et le chiffrage. Le moteur 3D les
 * consomme pour placer la géométrie, et les tests les vérifient sans navigateur.
 * Toute règle de conception a sa place ici, pas dans le code de rendu.
 */

/* =======================================================================
   1. CATALOGUE
   ======================================================================= */
export const FAIENCES = {
  emeraude:   { nom: 'Vert émeraude',  h: 163, s: 72, l: 20, hex: '#0e6b52', format: '10 × 10 zellige', prix: 89 },
  sauge:      { nom: 'Vert sauge',     h: 120, s: 20, l: 42, hex: '#6d8a63', format: '10 × 10 zellige', prix: 82 },
  bleucanard: { nom: 'Bleu canard',    h: 191, s: 62, l: 24, hex: '#176b7a', format: '10 × 10 zellige', prix: 89 },
  terracotta: { nom: 'Terracotta',     h: 14,  s: 52, l: 42, hex: '#a35a3a', format: '10 × 10 terre cuite', prix: 74 },
  sable:      { nom: 'Sable mat',      h: 34,  s: 22, l: 62, hex: '#bda683', format: '10 × 10 mat', prix: 58 },
  blanc:      { nom: 'Blanc craie',    h: 40,  s: 8,  l: 84, hex: '#dedad2', format: '10 × 10 mat', prix: 42 },
  anthracite: { nom: 'Anthracite',     h: 205, s: 8,  l: 20, hex: '#2f353a', format: '10 × 10 mat', prix: 66 }
};
export const METAUX = {
  laiton: { nom: 'Laiton brossé', hex: 0xc9a15a, rug: 0.21, css: '#c9a15a', coef: 1.35 },
  inox:   { nom: 'Inox brossé',   hex: 0xc4c9cb, rug: 0.33, css: '#c4c9cb', coef: 1.15 },
  noir:   { nom: 'Noir mat',      hex: 0x2a2e30, rug: 0.48, css: '#2a2e30', coef: 1.25 },
  chrome: { nom: 'Chromé',        hex: 0xe2e6e8, rug: 0.08, css: '#e2e6e8', coef: 1 }
};
export const BOIS = {
  chene: { nom: 'Chêne clair', rgb: [138, 96, 58],  css: '#8a603a' },
  teck:  { nom: 'Teck',        rgb: [126, 82, 46],  css: '#7e522e' },
  noyer: { nom: 'Noyer',       rgb: [86, 56, 38],   css: '#563826' },
  frene: { nom: 'Frêne blanc', rgb: [178, 152, 116], css: '#b29874' }
};
export const PARTIS = {
  spa:         { nom: 'Douche + baignoire', desc: 'Douche à l’italienne d’angle, baignoire îlot si la place le permet' },
  traversante: { nom: 'Douche traversante', desc: 'Douche sur toute la largeur, banc maçonné, double vasque' },
  wetroom:     { nom: 'Wetroom & bain japonais', desc: 'Aucune paroi, sol en pente, ofuro encastré' }
};

/* Tarifs indicatifs de référence, en euros HT. Chaque entreprise saisit les
   siens dans ses réglages : ceux-ci ne servent que de point de départ. */
export const TARIFS = {
  faience: null,      // null = prix du catalogue selon la teinte choisie
  sol: 62,            // fourniture du revêtement de sol, au m²
  poseM2: 78,         // pose carrelage mur et sol, au m²
  etancheite: 34,     // système d'étanchéité liquide sous carrelage, au m²
  douche: 1450,       // receveur de plain-pied, paroi, robinetterie
  baignoire: 1900,
  vasque: 1150,       // meuble, plan, vasque, mitigeur
  wc: 780,
  ofuro: 3400,
  claustra: 620,
  verriere: 890,
  depose: 950         // dépose de l'existant et évacuation
};

/* Bornes de saisie, partagées par l'interface et par la validation serveur. */
export const BORNES = {
  L: [1.6, 6], P: [1.6, 6], H: [2.1, 4.5]
};

export function configParDefaut() {
  return {
    piece: { L: 3, P: 3, H: 2.5 },
    porte: { mur: 'avant', position: 0.5 },
    parti: 'spa',
    materiaux: { faience: 'emeraude', metal: 'laiton', bois: 'chene' },
    options: { baignoire: true, wc: true, plantes: true, verriere: true }
  };
}

/* =======================================================================
   2. RÈGLES DE DIMENSIONNEMENT
   Chaque règle porte une contrainte de métier, pas un choix esthétique.
   ======================================================================= */
const borner = (v, min, max) => Math.min(max, Math.max(min, v));

export const REGLES = {
  /* Hauteur de faïence : toute hauteur sous 3 m, sinon un bandeau et de
     l'enduit au-dessus — au-delà, carreler jusqu'au plafond coûte sans servir. */
  bandeau: (H) => (H >= 3 ? 2.6 : Math.max(1.9, H - 0.35)),

  /* Douche d'angle : 46 % du plus petit côté, jamais moins de 85 cm (sinon on
     ne s'y retourne pas), jamais plus de 1,50 m (au-delà l'eau gicle hors zone). */
  douche: (W, D) => borner(Math.min(W, D) * 0.46, 0.85, 1.5),

  /* Douche traversante : bande au fond, 36 % de la profondeur. */
  doucheTraversante: (D) => borner(D * 0.36, 0.9, 1.35),
  entreeDouche: (W) => Math.min(0.95, W * 0.34),

  /* Meuble vasque : limité par le linéaire disponible, 60 cm minimum utile. */
  vasque: (disponible) => (disponible < 0.6 ? 0 : Math.min(1.6, disponible)),

  /* Baignoire îlot : il faut le dégagement pour entrer dedans et tourner
     autour, et une pièce d'au moins 5 m². */
  baignoireTient: (W, D, largeurLibre, profLibre) =>
    largeurLibre >= 1.5 && profLibre >= 0.95 && W * D >= 5,
  baignoire: (largeurLibre, profLibre) => ({
    longueur: Math.min(1.7, largeurLibre - 0.12),
    largeur: Math.min(0.78, profLibre - 0.1)
  }),

  /* Ofuro : estrade limitée par la pièce, cuve de 1,20 m dedans. */
  estrade: (W, D) => ({ longueur: Math.min(1.8, W * 0.6), profondeur: Math.min(1.3, D * 0.45), hauteur: 0.55 }),

  /* Sous 4 m², la circulation devant chaque appareil devient le sujet. */
  circulationTendue: (W, D) => W * D < 4
};

/* =======================================================================
   3. MÉTRÉ
   Déduit de la géométrie réellement construite, pas d'un ratio approché.
   ======================================================================= */
export function metrer({ W, D, H, bandeau, ouverturesM2 = 0, parti = 'spa' }) {
  const perimetre = 2 * (W + D);
  const solM2 = W * D;
  const faienceM2 = Math.max(0, perimetre * bandeau - ouverturesM2);
  const enduitM2 = Math.max(0, perimetre * (H - bandeau));
  /* zone humide : tout le sol en wetroom, sinon l'emprise de la douche */
  const zoneHumide = parti === 'wetroom' ? solM2 : Math.min(solM2, 2.2);
  return {
    solM2, faienceM2, enduitM2, perimetre, bandeau,
    volumeM3: solM2 * H,
    carrelageM2: faienceM2 + solM2,
    /* 8 % de chute : recoupes et casse, usage courant du métier */
    carreaux: Math.ceil((faienceM2 + zoneHumide) * 100 * 1.08),
    etancheiteM2: parti === 'wetroom'
      ? solM2 + perimetre * 2
      : zoneHumide + Math.sqrt(zoneHumide) * 2 * 2,
    ouverturesM2
  };
}

/* =======================================================================
   4. CHIFFRAGE
   Fourchette indicative de fournitures et de pose, jamais un devis.
   ======================================================================= */
const LIBELLES = {
  douche: 'Douche : receveur de plain-pied, paroi, robinetterie',
  baignoire: 'Baignoire îlot et robinetterie',
  vasque: 'Meuble vasque, plan, mitigeur, miroir',
  wc: 'WC suspendu, bâti-support, plaque',
  ofuro: 'Bain japonais encastré et estrade',
  claustra: 'Claustra bois',
  verriere: 'Fenêtre haute / verrière',
  depose: 'Dépose de l’existant et évacuation'
};
const arr = (v) => v.toFixed(1).replace('.', ',');

export function estimer(resume, cfg, tarifs = {}) {
  const t = { ...TARIFS, ...tarifs };
  const m = resume.metre;
  const f = FAIENCES[cfg.materiaux.faience] ?? FAIENCES.emeraude;
  const metal = METAUX[cfg.materiaux.metal] ?? METAUX.chrome;
  const prixFaience = Number(t.faience) > 0 ? Number(t.faience) : f.prix;
  const lignes = [];
  const ligne = (libelle, detail, montant) =>
    lignes.push({ libelle, detail, montant: Math.round(montant) });

  ligne('Faïence murale', `${arr(m.faienceM2)} m² × ${prixFaience} € (${f.nom.toLowerCase()}, ${f.format})`,
    m.faienceM2 * prixFaience);
  ligne('Revêtement de sol', `${arr(m.solM2)} m² × ${t.sol} €`, m.solM2 * t.sol);
  ligne('Étanchéité sous carrelage', `${arr(m.etancheiteM2)} m² × ${t.etancheite} €`,
    m.etancheiteM2 * t.etancheite);
  ligne('Pose du carrelage', `${arr(m.carrelageM2)} m² × ${t.poseM2} €`, m.carrelageM2 * t.poseM2);

  const vus = new Set();
  for (const p of resume.postes) {
    if (vus.has(p) || !t[p]) continue;
    vus.add(p);
    /* la finition de robinetterie renchérit les postes qui en portent une */
    const majore = (p === 'douche' || p === 'baignoire' || p === 'vasque') ? metal.coef : 1;
    ligne(LIBELLES[p] ?? p,
      majore > 1 ? `robinetterie ${metal.nom.toLowerCase()}` : '',
      t[p] * majore);
  }
  const total = lignes.reduce((a, l) => a + l.montant, 0);
  return {
    lignes, total,
    bas: Math.round(total * 0.88 / 50) * 50,
    haut: Math.round(total * 1.18 / 50) * 50
  };
}

export const euros = (v) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
