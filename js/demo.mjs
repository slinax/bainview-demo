/* Bainview — démonstration publique.
   Aucun serveur : la configuration vit dans le navigateur du visiteur. */
import { creerVue, configParDefaut, estimer, euros, FAIENCES, METAUX, BOIS, PARTIS } from './engine.mjs';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const CLE = 'bainview.demo.v1';

const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arrondi = (v) => v.toFixed(1).replace('.', ',');
const dim = (v) => v.toFixed(2).replace('.', ',');

/* ---------------------------------------------------------------- état -- */
function etatParDefaut() {
  return {
    entreprise: { nom: '', telephone: '', couleur: '#0e6b52' },
    projet: { nom: 'Salle de bain', client: '' },
    config: configParDefaut()
  };
}
function fusionner(base, ajout) {
  const r = structuredClone(base);
  for (const [k, v] of Object.entries(ajout ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) r[k] = fusionner(r[k] ?? {}, v);
    else if (v !== undefined) r[k] = v;
  }
  return r;
}
function charger() {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? fusionner(etatParDefaut(), JSON.parse(brut)) : etatParDefaut();
  } catch { return etatParDefaut(); }
}
let etat = charger();
let vue = null, dernierResume = null, dernierChiffrage = null, minuteurSauvegarde = null;

function sauvegarder() {
  clearTimeout(minuteurSauvegarde);
  minuteurSauvegarde = setTimeout(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(etat));
      $('#etatSauvegarde').textContent = 'Enregistré sur cet appareil';
      setTimeout(() => $('#etatSauvegarde').textContent = '', 2200);
    } catch { /* navigation privée : on continue sans enregistrer */ }
  }, 600);
}

/* -------------------------------------------------------------- rendu -- */
let minuteurRendu = null;
function rendre(immediat) {
  sauvegarder();
  clearTimeout(minuteurRendu);
  const faire = () => afficherResume(vue.maj(etat.config));
  if (immediat) faire(); else minuteurRendu = setTimeout(faire, 160);
}
function afficherResume(r) {
  if (!r) return;
  dernierResume = r;
  const c = etat.config.piece;
  $('#resume').innerHTML =
    `<h4>${dim(c.L)} × ${dim(c.P)} m · h. ${dim(c.H)} m</h4>` +
    (r.elements.length ? `<ul>${r.elements.map(e => `<li>${echapper(e)}</li>`).join('')}</ul>` : '') +
    r.alertes.map(a => `<span class="alerte">⚠ ${echapper(a)}</span>`).join('');
  afficherMetre(r);
}
function afficherMetre(r) {
  const m = r.metre;
  const e = estimer(r, etat.config, {});
  dernierChiffrage = e;
  const l = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  $('#metre').innerHTML =
    '<div class="metre-lignes">' +
      l('Faïence murale', arrondi(m.faienceM2) + ' m²') +
      l('Sol', arrondi(m.solM2) + ' m²') +
      l('Étanchéité', arrondi(m.etancheiteM2) + ' m²') +
      l('Carreaux (chute 8 %)', m.carreaux.toLocaleString('fr-FR')) +
      l('Volume', arrondi(m.volumeM3) + ' m³') +
    '</div>' +
    '<div class="chiffrage">' +
      '<div class="etiquette">Estimation fournitures et pose</div>' +
      `<div class="fourchette">${euros(e.bas)} – ${euros(e.haut)}</div>` +
      '<div class="avert">HT, hors plomberie, électricité et imprévus. ' +
      'Estimation automatique : elle ne remplace pas un devis.</div>' +
    '</div>' +
    '<details class="detail-postes"><summary>Détail des postes</summary><table>' +
      e.lignes.map(x => `<tr><td>${echapper(x.libelle)}` +
        (x.detail ? `<span class="det">${echapper(x.detail)}</span>` : '') +
        `</td><td>${euros(x.montant)}</td></tr>`).join('') +
      `<tr><td><b>Total</b></td><td><b>${euros(e.total)}</b></td></tr>` +
    '</table></details>';
}
function majSurface() {
  const c = etat.config.piece;
  $('#surface').textContent = arrondi(c.L * c.P) + ' m² au sol · '
    + arrondi(2 * (c.L + c.P) * c.H) + ' m² de murs';
}

/* ------------------------------------------------------ synchronisation */
function synchroniser() {
  const c = etat.config;
  $('#eNom').value = etat.entreprise.nom;
  $('#eTel').value = etat.entreprise.telephone;
  $('#eCouleur').value = etat.entreprise.couleur;
  $('#pNom').value = etat.projet.nom;
  $('#pClient').value = etat.projet.client;
  $('#dL').value = c.piece.L; $('#dP').value = c.piece.P; $('#dH').value = c.piece.H;
  $('#posPorte').value = c.porte.position;
  $('#posPorteVal').textContent = Math.round(c.porte.position * 100) + ' %';
  $$('#murPorte button').forEach(b => b.classList.toggle('actif', b.dataset.mur === c.porte.mur));
  $$('#partis button').forEach(b => b.classList.toggle('actif', b.dataset.parti === c.parti));
  $$('#faiences button').forEach(b => b.classList.toggle('actif', b.dataset.faience === c.materiaux.faience));
  $$('#metaux button').forEach(b => b.classList.toggle('actif', b.dataset.metal === c.materiaux.metal));
  $$('#bois button').forEach(b => b.classList.toggle('actif', b.dataset.bois === c.materiaux.bois));
  $('#nomFaience').textContent = FAIENCES[c.materiaux.faience]?.nom ?? '';
  $('#optBaignoire').checked = c.options.baignoire !== false;
  $('#optWc').checked = c.options.wc !== false;
  $('#optVerriere').checked = c.options.verriere !== false;
  $('#optPlantes').checked = c.options.plantes !== false;
  document.documentElement.style.setProperty('--vert', etat.entreprise.couleur);
  majSurface();
}

/* ----------------------------------------------------- fiche à imprimer */
function construireFiche(img) {
  const c = etat.config, m = dernierResume.metre, e = dernierChiffrage, p = c.piece;
  const ent = etat.entreprise;
  const nomEnt = ent.nom || 'Votre entreprise';
  const jour = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#fiche').innerHTML =
    '<div class="entete">' +
      `<div class="pastille-logo" style="background:${ent.couleur}">${echapper(nomEnt.charAt(0).toUpperCase())}</div>` +
      `<div><div style="font-weight:600;font-size:13pt">${echapper(nomEnt)}</div>` +
      `<div style="font-size:9.5pt;color:#54625b">${echapper(ent.telephone)}</div></div>` +
      `<div style="margin-left:auto;text-align:right;font-size:9pt;color:#8a978f">Fiche projet<br>${jour}</div>` +
    '</div>' +
    `<h1>${echapper(etat.projet.nom)}</h1>` +
    '<div style="font-size:10.5pt;color:#54625b;margin-bottom:4mm">' +
      (etat.projet.client ? echapper(etat.projet.client) + ' &middot; ' : '') +
      `${dim(p.L)} &times; ${dim(p.P)} m sous ${dim(p.H)} m &middot; ${arrondi(p.L * p.P)} m² &middot; ` +
      echapper(PARTIS[c.parti]?.nom ?? '') +
    '</div>' +
    '<div class="vues">' +
      `<img class="grande" src="${img.ensemble}" alt="Vue d’ensemble">` +
      `<img src="${img.douche}" alt="Douche"><img src="${img.vasque}" alt="Vasque">` +
    '</div>' +
    '<div class="cols eviter"><div><h2>Aménagement</h2><table>' +
      dernierResume.elements.map(x => `<tr><td>${echapper(x)}</td></tr>`).join('') +
    '</table></div><div><h2>Matériaux</h2><table>' +
      `<tr><td>Faïence</td><td class="n">${echapper(FAIENCES[c.materiaux.faience].nom)}</td></tr>` +
      `<tr><td>Format</td><td class="n">${echapper(FAIENCES[c.materiaux.faience].format)}</td></tr>` +
      `<tr><td>Robinetterie</td><td class="n">${echapper(METAUX[c.materiaux.metal].nom)}</td></tr>` +
      `<tr><td>Bois</td><td class="n">${echapper(BOIS[c.materiaux.bois].nom)}</td></tr>` +
    '</table></div></div>' +
    '<div class="cols eviter"><div><h2>Métré</h2><table>' +
      `<tr><td>Faïence murale</td><td class="n">${arrondi(m.faienceM2)} m²</td></tr>` +
      `<tr><td>Sol</td><td class="n">${arrondi(m.solM2)} m²</td></tr>` +
      `<tr><td>Étanchéité sous carrelage</td><td class="n">${arrondi(m.etancheiteM2)} m²</td></tr>` +
      `<tr><td>Carreaux, chute 8 % comprise</td><td class="n">${m.carreaux.toLocaleString('fr-FR')}</td></tr>` +
      `<tr><td>Volume de la pièce</td><td class="n">${arrondi(m.volumeM3)} m³</td></tr>` +
    '</table></div>' +
    `<div><h2>Plan</h2><img src="${img.plan}" alt="Vue en plan" style="width:100%;border:1px solid #dde4dd;border-radius:2mm"></div></div>` +
    '<h2>Estimation indicative</h2><table><thead><tr><th>Poste</th><th class="n">Montant HT</th></tr></thead><tbody>' +
      e.lignes.map(x => `<tr><td>${echapper(x.libelle)}</td><td class="n">${euros(x.montant)}</td></tr>`).join('') +
      `<tr class="total"><td>Fourchette estimée</td><td class="n">${euros(e.bas)} – ${euros(e.haut)}</td></tr>` +
    '</tbody></table>' +
    '<div class="mentions-pdf">Document non contractuel, produit par une démonstration. ' +
    'Les images sont une représentation de principe ; les teintes, les références et les ' +
    'dimensions restent à confirmer sur place. L’estimation est calculée automatiquement à ' +
    'partir de tarifs de référence : elle ne constitue ni un devis ni un engagement de prix.' +
    '<br>Aperçu réalisé avec Bainview.</div>';
  $('#fiche').hidden = false;
}

/* ---------------------------------------------------------- démarrage -- */
function commandes() {
  $('#partis').innerHTML = Object.entries(PARTIS).map(([cle, p]) =>
    `<button data-parti="${cle}">${p.nom}<small>${p.desc}</small></button>`).join('');
  $$('#partis button').forEach(b => b.onclick = () => {
    etat.config.parti = b.dataset.parti; synchroniser(); rendre(true);
  });
  $('#faiences').innerHTML = Object.entries(FAIENCES).map(([cle, f]) =>
    `<button class="teinte" data-faience="${cle}" style="background:${f.hex}" title="${f.nom}" aria-label="${f.nom}"></button>`).join('');
  $$('#faiences button').forEach(b => b.onclick = () => {
    etat.config.materiaux.faience = b.dataset.faience; synchroniser(); rendre(true);
  });
  $('#metaux').innerHTML = Object.entries(METAUX).map(([cle, m]) =>
    `<button data-metal="${cle}">${m.nom.split(' ')[0]}</button>`).join('');
  $$('#metaux button').forEach(b => b.onclick = () => {
    etat.config.materiaux.metal = b.dataset.metal; synchroniser(); rendre(true);
  });
  $('#bois').innerHTML = Object.entries(BOIS).map(([cle, m]) =>
    `<button data-bois="${cle}">${m.nom.split(' ')[0]}</button>`).join('');
  $$('#bois button').forEach(b => b.onclick = () => {
    etat.config.materiaux.bois = b.dataset.bois; synchroniser(); rendre(true);
  });
  $$('#murPorte button').forEach(b => b.onclick = () => {
    etat.config.porte.mur = b.dataset.mur; synchroniser(); rendre(true);
  });
  const borne = (v, min, max, secours) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : secours;
  };
  ['dL', 'dP', 'dH'].forEach(id => $('#' + id).oninput = () => {
    const c = etat.config.piece;
    c.L = borne($('#dL').value, 1.6, 6, c.L);
    c.P = borne($('#dP').value, 1.6, 6, c.P);
    c.H = borne($('#dH').value, 2.1, 4.5, c.H);
    majSurface(); rendre(false);
  });
  $('#posPorte').oninput = () => {
    etat.config.porte.position = Number($('#posPorte').value);
    $('#posPorteVal').textContent = Math.round(etat.config.porte.position * 100) + ' %';
    rendre(false);
  };
  const opts = { optBaignoire: 'baignoire', optWc: 'wc', optVerriere: 'verriere', optPlantes: 'plantes' };
  Object.entries(opts).forEach(([id, cle]) => $('#' + id).onchange = () => {
    etat.config.options[cle] = $('#' + id).checked; rendre(true);
  });
  $('#eNom').oninput = () => { etat.entreprise.nom = $('#eNom').value; sauvegarder(); };
  $('#eTel').oninput = () => { etat.entreprise.telephone = $('#eTel').value; sauvegarder(); };
  $('#eCouleur').oninput = () => {
    etat.entreprise.couleur = $('#eCouleur').value;
    document.documentElement.style.setProperty('--vert', etat.entreprise.couleur);
    sauvegarder();
  };
  $('#pNom').oninput = () => { etat.projet.nom = $('#pNom').value; sauvegarder(); };
  $('#pClient').oninput = () => { etat.projet.client = $('#pClient').value; sauvegarder(); };

  $$('[data-vue]').forEach(b => b.onclick = () => {
    $$('[data-vue]').forEach(x => x.classList.remove('actif'));
    b.classList.add('actif');
    vue.vue(b.dataset.vue);
  });
  $('#btnJour').onclick = () => { vue.ambiance(false); $('#btnJour').classList.add('actif'); $('#btnNuit').classList.remove('actif'); };
  $('#btnNuit').onclick = () => { vue.ambiance(true); $('#btnNuit').classList.add('actif'); $('#btnJour').classList.remove('actif'); };
  let rot = false;
  $('#btnRotation').onclick = () => { rot = !rot; vue.rotation(rot); $('#btnRotation').classList.toggle('actif', rot); };

  const fichier = () => (etat.projet.nom || 'projet').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet';

  $('#btnPng').onclick = () => vue.png(fichier());
  $('#btnGlb').onclick = async () => {
    const b = $('#btnGlb'), t = b.textContent;
    b.textContent = '…'; b.disabled = true;
    try { await vue.glb(fichier()); } finally { b.textContent = t; b.disabled = false; }
  };
  $('#btnFiche').onclick = async () => {
    const b = $('#btnFiche'), t = b.textContent;
    b.textContent = 'Préparation…'; b.disabled = true;
    try {
      construireFiche(await vue.captures(['ensemble', 'douche', 'vasque', 'plan']));
      await new Promise(r => setTimeout(r, 150));
      window.print();
    } finally { b.textContent = t; b.disabled = false; }
  };
  $('#btnCsv').onclick = () => {
    const m = dernierResume.metre, e = dernierChiffrage, c = etat.config;
    const n = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
    const lignes = [
      ['Projet', etat.projet.nom], ['Client', etat.projet.client],
      ['Largeur (m)', n(c.piece.L)], ['Profondeur (m)', n(c.piece.P)], ['Hauteur (m)', n(c.piece.H)],
      ['Surface au sol (m2)', n(m.solM2)], ['Faience murale (m2)', n(m.faienceM2)],
      ['Etancheite (m2)', n(m.etancheiteM2)], ['Carrelage total pose (m2)', n(m.carrelageM2)],
      ['Carreaux (chute 8%)', String(m.carreaux)], ['Volume (m3)', n(m.volumeM3)],
      [], ['Poste', 'Montant HT (EUR)'],
      ...e.lignes.map(x => [x.libelle, String(x.montant)]),
      ['Total estime', String(e.total)]
    ];
    const csv = '﻿' + lignes.map(l =>
      l.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = fichier() + '-metre.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $('#btnReinit').onclick = () => {
    if (!confirm('Repartir de la configuration par défaut ?')) return;
    etat = etatParDefaut();
    try { localStorage.removeItem(CLE); } catch {}
    synchroniser();
    afficherResume(vue.maj(etat.config));
    vue.vue('ensemble');
  };
}

vue = creerVue($('#scene'));
commandes();
synchroniser();
afficherResume(vue.maj(etat.config));
vue.vue('ensemble', true);
$('#chargement').classList.add('parti');
