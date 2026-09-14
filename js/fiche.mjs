/* Bainview — génération de la fiche projet en PDF.
   S'appuie sur jsPDF + AutoTable, chargés en UMD depuis un CDN par la page.
   Produit un fichier identique d'un poste à l'autre, contrairement à la boîte
   d'impression du navigateur. */
import { FAIENCES, METAUX, BOIS, PARTIS } from './engine.mjs';

/* Les polices standard de jsPDF sont en WinAnsi : les espaces fines
   insécables de Intl.NumberFormat n'y existent pas, on formate à la main. */
const separer = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const eur = (v) => separer(Math.round(v)) + ' €';
const nb1 = (v) => v.toFixed(1).replace('.', ',');
const nb2 = (v) => v.toFixed(2).replace('.', ',');

const ENCRE = [21, 32, 28];
const GRIS = [132, 145, 138];
const LIGNE = [221, 228, 221];

function hexVersRvb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return [14, 107, 82];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function pdfDisponible() {
  return typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF;
}

/**
 * @param {object} d  { entreprise:{nom,telephone,couleur,contact}, projet:{nom,client},
 *                      config, resume, chiffrage, images:{ensemble,douche,vasque,plan,ratio} }
 * @returns {Blob}
 */
export function construirePdf(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const M = 14, W = 210, utile = W - 2 * M;
  const couleur = hexVersRvb(d.entreprise.couleur);
  const c = d.config, p = c.piece, m = d.resume.metre, e = d.chiffrage;
  const ratio = d.images.ratio || 1.6;

  /* ---------------------------------------------------------- en-tête -- */
  function enTete() {
    doc.setFillColor(...couleur);
    doc.roundedRect(M, 12, 12, 12, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold').setFontSize(14);
    doc.text((d.entreprise.nom || '?').trim().charAt(0).toUpperCase(), M + 6, 20.2, { align: 'center' });

    doc.setTextColor(...ENCRE).setFontSize(12);
    doc.text(d.entreprise.nom || 'Votre entreprise', M + 16, 17.5);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRIS);
    const contact = [d.entreprise.telephone, d.entreprise.contact].filter(Boolean).join('  ·  ');
    if (contact) doc.text(contact, M + 16, 22.5);

    const jour = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text('Fiche projet', W - M, 17.5, { align: 'right' });
    doc.text(jour, W - M, 22.5, { align: 'right' });

    doc.setDrawColor(...ENCRE).setLineWidth(0.5);
    doc.line(M, 27, W - M, 27);
  }

  function pied(numero, total) {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS);
    doc.text('Document non contractuel — seul le devis signé fait foi.', M, 288);
    doc.text(numero + '/' + total, W - M, 288, { align: 'right' });
  }

  /* ----------------------------------------------------------- page 1 -- */
  enTete();
  doc.setFont('helvetica', 'bold').setFontSize(19).setTextColor(...ENCRE);
  doc.text(d.projet.nom || 'Projet', M, 38);

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90, 100, 94);
  const sousTitre = [
    d.projet.client,
    nb2(p.L) + ' x ' + nb2(p.P) + ' m sous ' + nb2(p.H) + ' m',
    nb1(p.L * p.P) + ' m²',
    PARTIS[c.parti] ? PARTIS[c.parti].nom : ''
  ].filter(Boolean).join('  ·  ');
  doc.text(sousTitre, M, 44);

  let y = 49;
  const hGrande = utile / ratio;
  doc.addImage(d.images.ensemble, 'JPEG', M, y, utile, hGrande, 'ens', 'FAST');
  y += hGrande + 3;

  const demi = (utile - 3) / 2, hDemi = demi / ratio;
  doc.addImage(d.images.douche, 'JPEG', M, y, demi, hDemi, 'dou', 'FAST');
  doc.addImage(d.images.vasque, 'JPEG', M + demi + 3, y, demi, hDemi, 'vas', 'FAST');
  y += hDemi + 8;

  const styleTable = {
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 0, right: 0 },
              textColor: ENCRE, lineColor: LIGNE, lineWidth: { bottom: 0.1 } },
    headStyles: { fontSize: 7.5, textColor: GRIS, fontStyle: 'normal', lineWidth: { bottom: 0.3 } },
    margin: { left: M, right: M }
  };

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...ENCRE);
  doc.text('Aménagement', M, y);
  doc.autoTable({
    ...styleTable,
    startY: y + 2,
    body: d.resume.elements.map(x => [x]),
    tableWidth: demi
  });
  const finGauche = doc.lastAutoTable.finalY;

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...ENCRE);
  doc.text('Matériaux', M + demi + 3, y);
  doc.autoTable({
    ...styleTable,
    startY: y + 2,
    margin: { left: M + demi + 3, right: M },
    body: [
      ['Faïence', FAIENCES[c.materiaux.faience].nom],
      ['Format', FAIENCES[c.materiaux.faience].format],
      ['Robinetterie', METAUX[c.materiaux.metal].nom],
      ['Bois', BOIS[c.materiaux.bois].nom]
    ],
    columnStyles: { 1: { halign: 'right' } },
    tableWidth: demi
  });
  y = Math.max(finGauche, doc.lastAutoTable.finalY) + 6;

  if (d.resume.alertes.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(154, 91, 31);
    d.resume.alertes.forEach(a => {
      doc.text('! ' + a, M, y, { maxWidth: utile });
      y += 5;
    });
  }
  pied(1, 2);

  /* ----------------------------------------------------------- page 2 -- */
  doc.addPage();
  enTete();
  y = 38;

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...ENCRE);
  doc.text('Métré', M, y);
  doc.autoTable({
    ...styleTable,
    startY: y + 2,
    tableWidth: demi,
    body: [
      ['Faïence murale', nb1(m.faienceM2) + ' m²'],
      ['Sol', nb1(m.solM2) + ' m²'],
      ['Étanchéité sous carrelage', nb1(m.etancheiteM2) + ' m²'],
      ['Carrelage posé au total', nb1(m.carrelageM2) + ' m²'],
      ['Carreaux, chute 8 % comprise', separer(m.carreaux)],
      ['Volume de la pièce', nb1(m.volumeM3) + ' m³']
    ],
    columnStyles: { 1: { halign: 'right' } }
  });
  const finMetre = doc.lastAutoTable.finalY;

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...ENCRE);
  doc.text('Plan', M + demi + 3, y);
  doc.addImage(d.images.plan, 'JPEG', M + demi + 3, y + 3, demi, demi / ratio, 'pla', 'FAST');
  y = Math.max(finMetre, y + 3 + demi / ratio) + 8;

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...ENCRE);
  doc.text('Estimation indicative', M, y);
  doc.autoTable({
    ...styleTable,
    startY: y + 2,
    head: [['Poste', 'Montant HT']],
    body: e.lignes.map(x => [
      x.detail ? { content: x.libelle + '\n' + x.detail, styles: { fontSize: 9 } } : x.libelle,
      eur(x.montant)
    ]),
    foot: [['Fourchette estimée', eur(e.bas) + '  –  ' + eur(e.haut)]],
    footStyles: { fontStyle: 'bold', fontSize: 10.5, textColor: ENCRE,
                  lineWidth: { top: 0.4 }, lineColor: ENCRE },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0 && String(data.cell.raw?.content ?? '').includes('\n')) {
        data.cell.styles.cellPadding = { top: 1.6, bottom: 2.2, left: 0, right: 0 };
      }
    }
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS);
  const mentions =
    "Les images sont une représentation de principe produite par ordinateur : les teintes, " +
    "les références et les dimensions restent à confirmer sur place. L'estimation ci-dessus " +
    "est calculée automatiquement à partir de tarifs de référence ; elle ne constitue ni un " +
    "devis ni un engagement de prix, et n'inclut ni la plomberie, ni l'électricité, ni les " +
    "imprévus de chantier. Seul le devis signé fait foi.";
  doc.text(doc.splitTextToSize(mentions, utile), M, y);

  pied(2, 2);
  return doc.output('blob');
}

export function telechargerPdf(d, nomFichier) {
  const blob = construirePdf(d);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (nomFichier || 'fiche-projet') + '.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
