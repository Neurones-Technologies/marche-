/* Marché+ — Données fictives pour la préparation d'un appel d'offres. Un appel d'offres neuf naît vide ; le bouton
   « Générer des données fictives » du cahier des charges remplit le cahier des charges et la grille de critères avec
   un exemple complet, tiré au hasard parmi quelques sujets (démonstration, essais). La référence est conservée.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var EXEMPLES_CDC = [
  { objet:'Fourniture, installation et mise en service d’équipements réseau pour le réseau d’agences',
    procedure:'Appel d’offres ouvert national',
    lots:[['Lot 1 — Équipements actifs (commutateurs, routeurs, pare-feux)','45 000 000 XOF'],['Lot 2 — Câblage structuré et baies de brassage','25 000 000 XOF'],
      ['Lot 3 — Installation, recette et formation','15 000 000 XOF'],['Lot 4 — Maintenance et support pendant 3 ans','18 000 000 XOF']],
    specs:['Commutateurs 24 ports gigabit administrables, compatibles VLAN 802.1Q et qualité de service','Routeurs d’agence avec double liaison WAN et bascule automatique',
      'Baies de brassage 42U ventilées, avec unités de distribution électrique redondées','Câblage cuivre catégorie 6A certifié, tests de recette par lien avec rapport signé',
      'Onduleurs 3 kVA par agence, autonomie minimale de 30 minutes en pleine charge','Supervision centralisée compatible SNMP v3, journaux conservés 12 mois',
      'Support technique en français, intervention sur site en moins de 8 heures ouvrées'],
    caution:2, garantieMin:18, delaiMax:120, penalite:1, avance:20 },
  { objet:'Fourniture et installation de mobilier de bureau pour le nouveau siège',
    procedure:'Appel d’offres ouvert national',
    lots:[['Lot 1 — Postes de travail (bureaux, caissons, sièges)','38 000 000 XOF'],['Lot 2 — Salles de réunion et espaces d’accueil','22 000 000 XOF'],
      ['Lot 3 — Rangements et archives','12 000 000 XOF']],
    specs:['Bureaux de 160 × 80 cm, plateau en panneau mélaminé de 25 mm, classe E1','Sièges ergonomiques réglables en hauteur, accoudoirs et soutien lombaire réglables',
      'Tables de réunion modulables de 8 à 20 places, passe-câbles intégrés','Armoires hautes à portes battantes, fermeture à clé, charge de 40 kg par tablette',
      'Livraison, montage et évacuation des emballages compris, sur 4 étages','Garantie de 5 ans sur les structures, de 2 ans sur les mécanismes'],
    caution:1.5, garantieMin:24, delaiMax:90, penalite:1, avance:15 },
  { objet:'Acquisition de véhicules de service pour les directions régionales',
    procedure:'Appel d’offres ouvert international',
    lots:[['Lot 1 — Véhicules tout-terrain 4 × 4 (8 unités)','184 000 000 XOF'],['Lot 2 — Berlines de liaison (6 unités)','72 000 000 XOF']],
    specs:['Moteur diesel d’au moins 2,4 L, boîte manuelle, transmission intégrale enclenchable (lot 1)','Climatisation, direction assistée, airbags conducteur et passager',
      'Réservoir d’au moins 70 litres, garde au sol d’au moins 210 mm (lot 1)','Couleur blanche, marquage aux couleurs de l’organisation à la livraison',
      'Réseau après-vente agréé dans au moins 3 villes du pays','Premier entretien et pièces d’usure couverts pendant 2 ans ou 50 000 km'],
    caution:2, garantieMin:24, delaiMax:150, penalite:1, avance:10 }
];

/* Remplit le cahier des charges et la grille de critères de la procédure ouverte avec un exemple. */
function genererDonneesFictives(){
  var c=state.cdc, ex=EXEMPLES_CDC[Math.floor(Math.random()*EXEMPLES_CDC.length)], K=CADRE();
  var dans30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  c.objet=ex.objet; c.autorite=c.autorite||(state.org&&state.org.nom)||''; c.procedure=ex.procedure;
  c.langue='Français'; c.deviseSoumission='Franc CFA (XOF)'; c.ouverture=dans30;
  c.lots=ex.lots.map(function(l,i){ return { id:'l'+Date.now().toString(36)+i, nom:l[0], montant:l[1] }; });
  c.specs=ex.specs.slice();
  c.caution=ex.caution; c.garantieMin=ex.garantieMin; c.delaiMax=ex.delaiMax; c.penalite=ex.penalite; c.avance=ex.avance;
  c.tva=18; c.retenueNonResident=20; c.douaneACharge='Titulaire du marché';
  c.prefActive=!!K.preferenceAutorisee; c.prefTaux=K.preferenceAutorisee ? Math.min(15,K.preferenceTauxMax) : 0;
  // grille : les deux critères calculés, et deux critères notés par l'évaluateur
  var poids={ prix:40, delai:15 };
  state.criteria=(state.criteria||[]).filter(function(x){ return x.kind==='auto'; }).map(function(x){ return Object.assign({}, x, { weight: poids[x.id]!=null ? poids[x.id] : 0 }); })
    .concat([{ id:'metho', label:'Méthodologie', weight:30, kind:'qual', hint:'Notation proposée par IA, validée par un évaluateur' },
             { id:'refs', label:'Références', weight:15, kind:'qual', hint:'Notation proposée par IA, validée par un évaluateur' }]);
  logit('Cahier des charges et grille de critères remplis avec des données fictives');
  save();
  choisirModeCdc('formulaire');
  toast('Données fictives générées : relisez et ajustez avant de publier.');
}
