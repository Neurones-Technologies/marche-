/* Marché+ — Illustrations de page de garde du dossier d'appel d'offres, une par grand thème d'achat.
   Dessins vectoriels (SVG, formes simples : le même texte sert à l'écran et dans le PDF généré par pdfmake).
   themeDossier(cdc) choisit le thème d'après l'objet, les lots et les spécifications.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* Fonds : six palettes et deux dispositions des cercles décoratifs, choisies d'après l'achat (graine) : deux dossiers du
   même thème n'ont pas la même page de garde. */
var ILLU_PALETTES = [['#FDF0E7','#F7D8C4'],['#EAF2FD','#CFE0F7'],['#EAF7F0','#CDEBDB'],['#F3EEFB','#DDD0F2'],['#FDF6E3','#F5E3B0'],['#FDECEF','#F6CBD3']];
function illuFond(graine){
  var pal=ILLU_PALETTES[graine%ILLU_PALETTES.length], dispo=Math.floor(graine/ILLU_PALETTES.length)%2;
  var c=dispo ? [[70,62,70],[410,250,54]] : [[410,62,70],[70,250,54]];
  return '<rect x="0" y="0" width="480" height="300" rx="28" fill="'+pal[0]+'"/>' +
    '<circle cx="'+c[0][0]+'" cy="'+c[0][1]+'" r="'+c[0][2]+'" fill="'+pal[1]+'" opacity="0.55"/><circle cx="'+c[1][0]+'" cy="'+c[1][1]+'" r="'+c[1][2]+'" fill="'+pal[1]+'" opacity="0.45"/>';
}
function illuSvg(corps, graine){ return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300">' + illuFond(graine||0) + corps + '</svg>'; }

var ILLUSTRATIONS = {
  informatique: { lab:'Informatique et réseaux', corps: (
    // écran
    '<rect x="70" y="78" width="170" height="112" rx="10" fill="#1F2430"/><rect x="80" y="88" width="150" height="88" rx="4" fill="#2a78d6"/>' +
    '<rect x="92" y="100" width="60" height="8" rx="4" fill="#ffffff" opacity="0.85"/><rect x="92" y="116" width="96" height="6" rx="3" fill="#ffffff" opacity="0.55"/>' +
    '<rect x="92" y="130" width="80" height="6" rx="3" fill="#ffffff" opacity="0.55"/><rect x="92" y="148" width="40" height="18" rx="4" fill="#eda100"/>' +
    '<rect x="140" y="190" width="30" height="22" fill="#5C6371"/><rect x="112" y="212" width="86" height="10" rx="5" fill="#1F2430"/>' +
    // baie de serveurs
    '<rect x="300" y="66" width="96" height="170" rx="10" fill="#1F2430"/>' +
    '<rect x="312" y="80" width="72" height="26" rx="4" fill="#5C6371"/><rect x="312" y="114" width="72" height="26" rx="4" fill="#5C6371"/>' +
    '<rect x="312" y="148" width="72" height="26" rx="4" fill="#5C6371"/><rect x="312" y="182" width="72" height="26" rx="4" fill="#5C6371"/>' +
    '<circle cx="372" cy="93" r="4" fill="#1baf7a"/><circle cx="372" cy="127" r="4" fill="#1baf7a"/><circle cx="372" cy="161" r="4" fill="#eda100"/><circle cx="372" cy="195" r="4" fill="#1baf7a"/>' +
    // liaisons du réseau
    '<path d="M240 130 C 270 130, 270 100, 300 100" stroke="#B4471B" stroke-width="4" fill="none"/>' +
    '<path d="M240 160 C 270 160, 270 190, 300 190" stroke="#B4471B" stroke-width="4" fill="none"/>' +
    '<circle cx="270" cy="115" r="7" fill="#B4471B"/><circle cx="270" cy="175" r="7" fill="#B4471B"/>' +
    '<path d="M330 48 a18 18 0 0 1 34 -6 a14 14 0 0 1 22 12 a12 12 0 0 1 -4 24 h-50 a16 16 0 0 1 -2 -30 z" fill="#ffffff"/>') },

  mobilier: { lab:'Mobilier et aménagement', corps: (
    // bureau
    '<rect x="60" y="150" width="230" height="16" rx="6" fill="#B4471B"/><rect x="74" y="166" width="12" height="80" fill="#923914"/>' +
    '<rect x="230" y="166" width="48" height="80" rx="4" fill="#923914"/><rect x="236" y="180" width="36" height="4" fill="#FDF0E7"/><rect x="236" y="208" width="36" height="4" fill="#FDF0E7"/>' +
    // écran et lampe
    '<rect x="150" y="96" width="78" height="52" rx="6" fill="#1F2430"/><rect x="183" y="146" width="12" height="6" fill="#1F2430"/>' +
    '<path d="M96 150 L 104 108 L 126 92" stroke="#1F2430" stroke-width="5" fill="none"/><path d="M116 84 l 26 -6 l 4 22 z" fill="#eda100"/>' +
    // fauteuil
    '<rect x="318" y="96" width="78" height="96" rx="22" fill="#2a78d6"/><rect x="306" y="170" width="102" height="26" rx="12" fill="#256abf"/>' +
    '<rect x="352" y="196" width="10" height="34" fill="#5C6371"/><path d="M320 244 L 357 230 L 394 244" stroke="#5C6371" stroke-width="6" fill="none"/>' +
    '<circle cx="320" cy="248" r="6" fill="#1F2430"/><circle cx="394" cy="248" r="6" fill="#1F2430"/>' +
    // étagère
    '<rect x="70" y="54" width="120" height="8" rx="3" fill="#923914"/><rect x="80" y="30" width="12" height="24" fill="#1baf7a"/><rect x="96" y="34" width="10" height="20" fill="#e87ba4"/><rect x="110" y="28" width="14" height="26" fill="#4a3aa7"/>') },

  vehicules: { lab:'Véhicules et transport', corps: (
    '<rect x="30" y="232" width="420" height="10" rx="5" fill="#5C6371"/>' +
    '<rect x="60" y="234" width="40" height="4" fill="#ffffff"/><rect x="150" y="234" width="40" height="4" fill="#ffffff"/><rect x="240" y="234" width="40" height="4" fill="#ffffff"/><rect x="330" y="234" width="40" height="4" fill="#ffffff"/>' +
    // véhicule tout-terrain
    '<path d="M86 200 L 96 150 Q 100 136 116 134 L 250 128 Q 270 128 286 144 L 318 172 L 380 180 Q 398 184 400 202 L 400 214 L 86 214 Z" fill="#B4471B"/>' +
    '<path d="M124 146 L 196 142 L 196 176 L 116 178 Z" fill="#cde2fb"/><path d="M208 142 L 262 140 Q 272 140 280 150 L 300 174 L 208 176 Z" fill="#cde2fb"/>' +
    '<rect x="110" y="122" width="150" height="8" rx="4" fill="#1F2430"/>' +
    '<circle cx="146" cy="216" r="28" fill="#1F2430"/><circle cx="146" cy="216" r="12" fill="#9b958d"/>' +
    '<circle cx="344" cy="216" r="28" fill="#1F2430"/><circle cx="344" cy="216" r="12" fill="#9b958d"/>' +
    '<rect x="384" y="186" width="16" height="8" rx="3" fill="#eda100"/>' +
    '<path d="M40 110 h40 M30 126 h56 M48 142 h30" stroke="#B4471B" stroke-width="5" stroke-linecap="round" opacity="0.5"/>') },

  travaux: { lab:'Travaux et bâtiment', corps: (
    // immeuble en construction
    '<rect x="180" y="110" width="150" height="140" fill="#9b958d"/>' +
    '<rect x="196" y="126" width="28" height="22" fill="#cde2fb"/><rect x="242" y="126" width="28" height="22" fill="#cde2fb"/><rect x="288" y="126" width="28" height="22" fill="#cde2fb"/>' +
    '<rect x="196" y="166" width="28" height="22" fill="#cde2fb"/><rect x="242" y="166" width="28" height="22" fill="#cde2fb"/><rect x="288" y="166" width="28" height="22" fill="#cde2fb"/>' +
    '<rect x="236" y="206" width="40" height="44" fill="#1F2430"/>' +
    '<rect x="180" y="96" width="150" height="14" fill="none" stroke="#1F2430" stroke-width="3" stroke-dasharray="8 6"/>' +
    // grue
    '<rect x="96" y="60" width="12" height="190" fill="#eda100"/><rect x="60" y="54" width="230" height="12" fill="#eda100"/>' +
    '<path d="M102 54 L 102 30 L 60 54 M102 30 L 150 54" stroke="#eda100" stroke-width="5" fill="none"/>' +
    '<line x1="250" y1="66" x2="250" y2="98" stroke="#1F2430" stroke-width="3"/><rect x="236" y="98" width="28" height="10" fill="#B4471B"/>' +
    '<rect x="80" y="246" width="44" height="8" fill="#1F2430"/>' +
    // cônes
    '<path d="M370 250 L 384 206 L 398 250 Z" fill="#B4471B"/><rect x="378" y="224" width="12" height="6" fill="#ffffff"/>' +
    '<path d="M404 250 L 416 214 L 428 250 Z" fill="#B4471B"/><rect x="411" y="230" width="10" height="5" fill="#ffffff"/>' +
    '<rect x="40" y="250" width="400" height="8" rx="4" fill="#5C6371"/>') },

  energie: { lab:'Énergie et éclairage', corps: (
    '<circle cx="380" cy="80" r="34" fill="#eda100"/>' +
    '<path d="M380 30 v-14 M380 144 v-14 M330 80 h-14 M444 80 h-14 M345 45 l-10 -10 M415 115 l10 10 M415 45 l10 -10 M345 115 l-10 10" stroke="#eda100" stroke-width="5" stroke-linecap="round"/>' +
    // lampadaire solaire
    '<rect x="150" y="70" width="10" height="180" fill="#5C6371"/><path d="M155 76 Q 160 50 210 50 L 220 50" stroke="#5C6371" stroke-width="8" fill="none"/>' +
    '<rect x="206" y="48" width="44" height="14" rx="6" fill="#1F2430"/><path d="M212 62 L 196 120 L 262 120 L 246 62 Z" fill="#eda100" opacity="0.35"/>' +
    '<path d="M110 100 L 190 84 L 196 112 L 116 128 Z" fill="#2a78d6"/><path d="M136 95 L 142 123 M162 90 L 168 118" stroke="#cde2fb" stroke-width="2"/>' +
    // panneaux au sol
    '<path d="M260 230 L 300 170 L 400 170 L 360 230 Z" fill="#2a78d6"/><path d="M293 180 L 393 180 M283 195 L 383 195 M273 210 L 373 210" stroke="#cde2fb" stroke-width="2"/>' +
    '<rect x="320" y="230" width="8" height="20" fill="#5C6371"/>' +
    '<path d="M60 150 L 84 150 L 70 178 L 96 178 L 58 230 L 70 192 L 48 192 Z" fill="#B4471B"/>' +
    '<rect x="40" y="250" width="400" height="8" rx="4" fill="#5C6371"/>') },

  fournitures: { lab:'Fournitures et consommables', corps: (
    // ramette et feuilles
    '<rect x="70" y="170" width="150" height="70" rx="6" fill="#ffffff"/><rect x="70" y="150" width="150" height="26" rx="6" fill="#2a78d6"/>' +
    '<rect x="86" y="190" width="118" height="5" rx="2" fill="#E6E1DA"/><rect x="86" y="204" width="118" height="5" rx="2" fill="#E6E1DA"/><rect x="86" y="218" width="80" height="5" rx="2" fill="#E6E1DA"/>' +
    // classeur
    '<rect x="240" y="80" width="70" height="160" rx="8" fill="#B4471B"/><rect x="254" y="100" width="42" height="56" rx="4" fill="#FDF0E7"/><circle cx="275" cy="200" r="10" fill="#FDF0E7"/>' +
    '<rect x="318" y="96" width="56" height="144" rx="8" fill="#1baf7a"/><rect x="330" y="114" width="32" height="44" rx="4" fill="#FDF0E7"/>' +
    // pot à crayons
    '<rect x="390" y="170" width="48" height="70" rx="8" fill="#4a3aa7"/>' +
    '<rect x="398" y="120" width="8" height="54" fill="#eda100"/><rect x="412" y="110" width="8" height="64" fill="#e34948"/><rect x="426" y="128" width="8" height="46" fill="#2a78d6"/>' +
    '<path d="M398 120 l4 -10 l4 10 z M412 110 l4 -10 l4 10 z M426 128 l4 -10 l4 10 z" fill="#1F2430"/>' +
    '<rect x="40" y="240" width="420" height="10" rx="5" fill="#923914"/>') },

  sante: { lab:'Santé et équipements médicaux', corps: (
    '<circle cx="150" cy="150" r="80" fill="#ffffff"/><rect x="128" y="94" width="44" height="112" rx="8" fill="#e34948"/><rect x="94" y="128" width="112" height="44" rx="8" fill="#e34948"/>' +
    // presse-papiers
    '<rect x="270" y="70" width="130" height="170" rx="12" fill="#1F2430"/><rect x="282" y="86" width="106" height="142" rx="6" fill="#ffffff"/>' +
    '<rect x="312" y="62" width="46" height="18" rx="6" fill="#5C6371"/>' +
    '<rect x="296" y="108" width="78" height="6" rx="3" fill="#E6E1DA"/><rect x="296" y="126" width="64" height="6" rx="3" fill="#E6E1DA"/>' +
    '<path d="M296 168 L 316 168 L 324 150 L 336 188 L 346 160 L 352 168 L 374 168" stroke="#1baf7a" stroke-width="5" fill="none" stroke-linejoin="round"/>' +
    // gélule
    '<rect x="96" y="236" width="70" height="26" rx="13" fill="#2a78d6"/><rect x="131" y="236" width="35" height="26" rx="0" fill="#cde2fb"/>') },

  conseil: { lab:'Études, conseil et formation', corps: (
    // tableau et graphique
    '<rect x="160" y="50" width="220" height="140" rx="10" fill="#ffffff"/><rect x="160" y="50" width="220" height="16" rx="8" fill="#1F2430"/>' +
    '<rect x="190" y="140" width="26" height="36" fill="#2a78d6"/><rect x="228" y="116" width="26" height="60" fill="#1baf7a"/><rect x="266" y="96" width="26" height="80" fill="#eda100"/><rect x="304" y="80" width="26" height="96" fill="#B4471B"/>' +
    '<path d="M196 120 L 240 100 L 278 82 L 318 66" stroke="#1F2430" stroke-width="3" fill="none"/>' +
    '<rect x="264" y="190" width="10" height="44" fill="#5C6371"/>' +
    // personnes
    '<circle cx="90" cy="130" r="22" fill="#923914"/><path d="M52 236 Q 52 170 90 168 Q 128 170 128 236 Z" fill="#B4471B"/>' +
    '<circle cx="410" cy="150" r="20" fill="#1F2430"/><path d="M376 240 Q 376 186 410 184 Q 444 186 444 240 Z" fill="#4a3aa7"/>' +
    // loupe
    '<circle cx="140" cy="250" r="16" fill="none" stroke="#1F2430" stroke-width="5"/><line x1="152" y1="262" x2="168" y2="278" stroke="#1F2430" stroke-width="6" stroke-linecap="round"/>') },

  securite: { lab:'Sécurité et surveillance', corps: (
    // bouclier
    '<path d="M240 52 L 316 78 L 316 150 Q 316 214 240 246 Q 164 214 164 150 L 164 78 Z" fill="#1F2430"/>' +
    '<path d="M240 66 L 302 88 L 302 150 Q 302 204 240 232 Q 178 204 178 150 L 178 88 Z" fill="#2a78d6"/>' +
    '<path d="M208 150 l22 24 l44 -52" stroke="#ffffff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    // caméra
    '<rect x="50" y="96" width="82" height="40" rx="10" fill="#5C6371"/><circle cx="120" cy="116" r="12" fill="#1F2430"/><circle cx="120" cy="116" r="5" fill="#e34948"/>' +
    '<rect x="84" y="136" width="10" height="34" fill="#5C6371"/><rect x="66" y="168" width="46" height="8" rx="4" fill="#1F2430"/>' +
    // cadenas
    '<rect x="352" y="150" width="76" height="62" rx="10" fill="#eda100"/><path d="M368 150 v-20 a22 22 0 0 1 44 0 v20" stroke="#1F2430" stroke-width="9" fill="none"/>' +
    '<circle cx="390" cy="178" r="8" fill="#1F2430"/><rect x="386" y="180" width="8" height="16" rx="3" fill="#1F2430"/>') },

  nettoyage: { lab:'Entretien et propreté', corps: (
    // seau
    '<path d="M110 150 L 130 240 L 250 240 L 270 150 Z" fill="#2a78d6"/><rect x="104" y="140" width="172" height="16" rx="8" fill="#256abf"/>' +
    '<path d="M124 150 C 124 100, 256 100, 256 150" stroke="#5C6371" stroke-width="6" fill="none"/>' +
    // serpillière
    '<rect x="318" y="46" width="10" height="150" rx="5" fill="#B4471B"/><path d="M296 196 L 350 196 L 360 244 L 286 244 Z" fill="#eda100"/>' +
    '<path d="M296 204 v36 M310 204 v36 M324 204 v38 M338 204 v36 M350 204 v34" stroke="#c28100" stroke-width="3"/>' +
    // bulles et éclats
    '<circle cx="170" cy="96" r="14" fill="#cde2fb" stroke="#2a78d6" stroke-width="3"/><circle cx="214" cy="70" r="9" fill="#cde2fb" stroke="#2a78d6" stroke-width="3"/>' +
    '<circle cx="136" cy="64" r="7" fill="#cde2fb" stroke="#2a78d6" stroke-width="3"/><circle cx="240" cy="108" r="6" fill="#cde2fb" stroke="#2a78d6" stroke-width="3"/>' +
    '<path d="M392 120 l6 -18 l6 18 l18 6 l-18 6 l-6 18 l-6 -18 l-18 -6 z" fill="#1baf7a"/><path d="M60 190 l4 -12 l4 12 l12 4 l-12 4 l-4 12 l-4 -12 l-12 -4 z" fill="#1baf7a"/>' +
    '<rect x="40" y="244" width="400" height="8" rx="4" fill="#5C6371"/>') },

  climatisation: { lab:'Climatisation et froid', corps: (
    // unité murale
    '<rect x="70" y="64" width="250" height="84" rx="16" fill="#ffffff"/><rect x="70" y="64" width="250" height="84" rx="16" fill="none" stroke="#1F2430" stroke-width="4"/>' +
    '<rect x="92" y="112" width="206" height="14" rx="7" fill="#cde2fb"/><rect x="92" y="130" width="206" height="6" rx="3" fill="#E6E1DA"/>' +
    '<circle cx="290" cy="88" r="6" fill="#1baf7a"/><rect x="92" y="82" width="60" height="8" rx="4" fill="#E6E1DA"/>' +
    // souffle
    '<path d="M110 168 C 110 196, 140 196, 140 224 M170 168 C 170 196, 200 196, 200 224 M230 168 C 230 196, 260 196, 260 224 M290 168 C 290 196, 320 196, 320 224" stroke="#2a78d6" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    // flocon
    '<g stroke="#2a78d6" stroke-width="7" stroke-linecap="round"><line x1="392" y1="150" x2="392" y2="250"/><line x1="342" y1="200" x2="442" y2="200"/><line x1="357" y1="165" x2="427" y2="235"/><line x1="427" y1="165" x2="357" y2="235"/></g>' +
    '<circle cx="392" cy="200" r="9" fill="#ffffff" stroke="#2a78d6" stroke-width="5"/>' +
    '<rect x="40" y="258" width="400" height="8" rx="4" fill="#5C6371"/>') },

  restauration: { lab:'Restauration et réceptions', corps: (
    // cloche
    '<path d="M70 190 A 100 100 0 0 1 270 190 Z" fill="#B4471B"/><rect x="52" y="190" width="236" height="16" rx="8" fill="#923914"/>' +
    '<circle cx="170" cy="82" r="12" fill="#923914"/><path d="M110 150 A 70 70 0 0 1 150 112" stroke="#FDF0E7" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.7"/>' +
    '<path d="M104 238 Q 170 262 236 238" stroke="#5C6371" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    // couverts
    '<rect x="326" y="70" width="10" height="170" rx="5" fill="#5C6371"/><rect x="320" y="70" width="22" height="64" rx="10" fill="#9b958d"/>' +
    '<path d="M388 70 v54 a14 14 0 0 0 28 0 v-54 M402 70 v170" stroke="#5C6371" stroke-width="9" fill="none" stroke-linecap="round"/>' +
    // vapeur
    '<path d="M130 60 q-10 -14 0 -28 M170 54 q-10 -14 0 -28 M210 60 q-10 -14 0 -28" stroke="#9b958d" stroke-width="5" fill="none" stroke-linecap="round"/>') },

  communication: { lab:'Impression et communication', corps: (
    // imprimante
    '<rect x="90" y="120" width="200" height="86" rx="14" fill="#1F2430"/><rect x="120" y="76" width="140" height="52" rx="4" fill="#ffffff"/>' +
    '<rect x="134" y="90" width="80" height="6" rx="3" fill="#E6E1DA"/><rect x="134" y="104" width="100" height="6" rx="3" fill="#E6E1DA"/>' +
    '<rect x="116" y="188" width="148" height="52" rx="4" fill="#ffffff"/><rect x="130" y="202" width="60" height="6" rx="3" fill="#2a78d6"/><rect x="130" y="216" width="100" height="6" rx="3" fill="#E6E1DA"/>' +
    '<circle cx="262" cy="142" r="6" fill="#1baf7a"/><rect x="104" y="140" width="60" height="8" rx="4" fill="#5C6371"/>' +
    // mégaphone
    '<path d="M330 120 L 410 80 L 410 200 L 330 160 Z" fill="#B4471B"/><rect x="306" y="120" width="30" height="40" rx="8" fill="#923914"/>' +
    '<rect x="324" y="160" width="18" height="40" rx="6" fill="#1F2430"/>' +
    '<path d="M424 110 q18 30 0 60 M440 96 q30 44 0 88" stroke="#eda100" stroke-width="6" fill="none" stroke-linecap="round"/>') },

  generique: { lab:'Achat', corps: (
    // document scellé
    '<rect x="150" y="40" width="170" height="220" rx="12" fill="#ffffff"/>' +
    '<rect x="174" y="70" width="100" height="10" rx="5" fill="#1F2430"/><rect x="174" y="96" width="122" height="6" rx="3" fill="#E6E1DA"/>' +
    '<rect x="174" y="112" width="122" height="6" rx="3" fill="#E6E1DA"/><rect x="174" y="128" width="96" height="6" rx="3" fill="#E6E1DA"/>' +
    '<rect x="174" y="150" width="122" height="6" rx="3" fill="#E6E1DA"/><rect x="174" y="166" width="80" height="6" rx="3" fill="#E6E1DA"/>' +
    '<circle cx="280" cy="222" r="26" fill="#B4471B"/><path d="M268 222 l9 9 l17 -18" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    // stylo
    '<path d="M350 230 L 410 110 L 424 118 L 364 238 Z" fill="#2a78d6"/><path d="M350 230 L 354 248 L 364 238 Z" fill="#1F2430"/>' +
    '<rect x="70" y="200" width="56" height="56" rx="10" fill="#1baf7a"/><path d="M84 228 l10 10 l18 -20" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round"/>') }
};

Object.keys(ILLUSTRATIONS).forEach(function(k){ ILLUSTRATIONS[k].svg=illuSvg(ILLUSTRATIONS[k].corps,0); });

/* Thème d'un dossier, d'après l'objet, les lots et les spécifications : le thème dont les mots clés (mots entiers)
   reviennent le plus souvent ; l'objet compte double. Aucun mot reconnu : illustration générique. */
var THEMES_MOTS = {
  informatique: ['informatique','réseau','réseaux','ordinateur','ordinateurs','serveur','serveurs','logiciel','logiciels','numérique','télécom','télécoms','télécommunication','commutateur','commutateurs','switch','switches','routeur','routeurs','pare-feu','pare-feux','wifi','wi-fi','câblage','vlan','supervision','imprimante','imprimantes','poste de travail','postes de travail','datacenter'],
  mobilier: ['mobilier','meuble','meubles','chaise','chaises','siège','sièges','fauteuil','fauteuils','table','tables','armoire','armoires','caisson','caissons','aménagement'],
  vehicules: ['véhicule','véhicules','voiture','voitures','camion','camions','automobile','automobiles','moto','motos','4x4','berline','berlines','pick-up','flotte','engin','engins'],
  travaux: ['travaux','construction','bâtiment','bâtiments','réhabilitation','rénovation','génie civil','route','routes','voirie','maçonnerie','chantier','ouvrage','ouvrages','bitumage'],
  energie: ['éclairage','électricité','électrique','énergie','solaire','solaires','lampadaire','lampadaires','groupe électrogène','photovoltaïque','luminaire','luminaires'],
  fournitures: ['fournitures de bureau','fourniture de bureau','articles de bureau','papeterie','consommable','consommables','cartouche','cartouches','ramette','ramettes','papier'],
  sante: ['médical','médicale','médicaux','santé','hôpital','hôpitaux','clinique','pharmaceutique','médicament','médicaments','laboratoire','soins'],
  securite: ['gardiennage','surveillance','vidéosurveillance','caméra','caméras','alarme','alarmes','incendie','extincteur','extincteurs','antivol','sécurité physique','contrôle d accès'],
  nettoyage: ['nettoyage','entretien','propreté','désinfection','hygiène','détergent','détergents','balayage','ménage','assainissement'],
  climatisation: ['climatisation','climatiseur','climatiseurs','split','froid','réfrigération','ventilation','chauffage','frigorifique'],
  restauration: ['restauration','traiteur','repas','cantine','catering','cuisine','alimentaire','alimentation','denrées','boisson','boissons','cocktail'],
  communication: ['impression','imprimerie','imprimés','communication','publicité','affiche','affiches','signalétique','banderole','banderoles','brochure','brochures','goodies'],
  conseil: ['étude','études','conseil','audit','formation','assistance technique','prestation intellectuelle','expertise','accompagnement','consultant']
};
function themeDossier(c){
  var norm=function(t){ return ' '+String(t||'').toLowerCase().replace(/[’']/g,' ').replace(/[^a-zà-ÿ0-9-]+/g,' ')+' '; };
  var texte=norm(c.objet)+norm(c.objet)+norm((c.lots||[]).map(function(l){ return l.nom; }).join(' '))+norm((c.specs||[]).join(' '));
  var meilleur='generique', score=0;
  Object.keys(THEMES_MOTS).forEach(function(th){
    var n=0; THEMES_MOTS[th].forEach(function(m){ var k=' '+m+' ', i=texte.indexOf(k); while(i>=0){ n++; i=texte.indexOf(k,i+1); } });
    if(n>score){ score=n; meilleur=th; }
  });
  return meilleur;
}

/* Illustration de la page de garde : le thème choisi par l'acheteur (cdc.illustration), sinon celui que l'objet évoque ;
   fonds et dispositions varient selon l'achat (référence et objet). Retourne { id, lab, svg }. */
function graineDossier(c){
  var t=String((c.ref||'')+'|'+(c.objet||'')), h=0, i;
  for(i=0;i<t.length;i++) h=(h*31+t.charCodeAt(i))>>>0;
  return h;
}
/*PHOTOS-DEBUT*/
var PHOTOS = { "informatique": [ { "f": "informatique-1.jpg", "credit": "USDAgov — Public domain — Wikimedia Commons" }, { "f": "informatique-2.jpg", "credit": "Carl Lender from Sunrise, USA — CC BY 2.0 — Wikimedia Commons" }, { "f": "informatique-3.jpg", "credit": "USDAgov — Public domain — Wikimedia Commons" } ], "mobilier": [ { "f": "mobilier-1.jpg", "credit": "Phillip Pessar — CC BY 2.0 — Wikimedia Commons" } ], "vehicules": [ { "f": "vehicules-1.jpg", "credit": "TTTNIS — CC0 — Wikimedia Commons" }, { "f": "vehicules-2.jpg", "credit": "Guywelch2000 — CC0 — Wikimedia Commons" }, { "f": "vehicules-3.jpg", "credit": "TTTNIS — CC0 — Wikimedia Commons" } ], "travaux": [ { "f": "travaux-1.jpg", "credit": "Aciarium — CC BY 4.0 — Wikimedia Commons" }, { "f": "travaux-2.jpg", "credit": "High Contrast — CC BY 3.0 de — Wikimedia Commons" }, { "f": "travaux-3.jpg", "credit": "W.carter — CC BY 4.0 — Wikimedia Commons" } ], "energie": [ { "f": "energie-1.jpg", "credit": "Pseudopanax at English Wikipedia — Public domain — Wikimedia Commons" }, { "f": "energie-2.jpg", "credit": "Western Balkans Investment Framework — CC BY 2.0 — Wikimedia Commons" }, { "f": "energie-3.jpg", "credit": "ENERGY.GOV — Public domain — Wikimedia Commons" } ], "fournitures": [ { "f": "fournitures-1.jpg", "credit": "Nacho — Public domain — Wikimedia Commons" }, { "f": "fournitures-2.jpg", "credit": "European Southern Observatory — CC BY 2.0 — Wikimedia Commons" } ], "sante": [ { "f": "sante-1.jpg", "credit": "Presidencia de la República Mexicana — CC BY 2.0 — Wikimedia Commons" }, { "f": "sante-2.jpg", "credit": "High Contrast — CC BY 3.0 de — Wikimedia Commons" }, { "f": "sante-3.jpg", "credit": "Aciarium — CC BY 4.0 — Wikimedia Commons" } ], "conseil": [ { "f": "conseil-1.jpg", "credit": "The Official CTBTO Photostream — CC BY 2.0 — Wikimedia Commons" }, { "f": "conseil-2.jpg", "credit": "Sandstein — CC BY 3.0 — Wikimedia Commons" } ], "securite": [ { "f": "securite-1.jpg", "credit": "Benoît Prieur — CC0 — Wikimedia Commons" } ], "nettoyage": [ { "f": "nettoyage-1.jpg", "credit": "Slawomir.kudla — CC0 — Wikimedia Commons" }, { "f": "nettoyage-2.jpg", "credit": "Dave Proffer — CC BY 2.0 — Wikimedia Commons" }, { "f": "nettoyage-3.jpg", "credit": "U.S. Department of Agriculture — Public domain — Wikimedia Commons" } ], "climatisation": [ { "f": "climatisation-1.jpg", "credit": "Raysonho @ Open Grid Scheduler / Grid Engine — CC0 — Wikimedia Commons" }, { "f": "climatisation-2.jpg", "credit": "Raysonho @ Open Grid Scheduler / Grid Engine — CC0 — Wikimedia Commons" } ], "restauration": [ { "f": "restauration-1.jpg", "credit": "Jameson Fink — CC BY 2.0 — Wikimedia Commons" } ], "communication": [ { "f": "communication-1.jpg", "credit": "Helge Klaus Rieder — CC0 — Wikimedia Commons" }, { "f": "communication-2.jpg", "credit": "Retired electrician — CC0 — Wikimedia Commons" } ], "generique": [ { "f": "generique-1.jpg", "credit": "philippechazal — CC0 — Wikimedia Commons" }, { "f": "generique-2.jpg", "credit": "Estormiz — CC0 — Wikimedia Commons" }, { "f": "generique-3.jpg", "credit": "ESO/M.Zamani — CC BY 4.0 — Wikimedia Commons" } ]
};
/*PHOTOS-FIN*/
/* Vraies photos libres de droits (Wikimedia Commons : domaine public, CC0 ou CC BY, crédits ci-dessous et dans
   docs/CREDITS-IMAGES.md), plusieurs par thème : l'achat en retient une d'après sa référence. Le dessin sert de repli. */
function illustrationDossier(c){
  var id=(c.illustration && ILLUSTRATIONS[c.illustration]) ? c.illustration : themeDossier(c), illu=ILLUSTRATIONS[id]||ILLUSTRATIONS.generique;
  var g=graineDossier(c), liste=PHOTOS[id]||PHOTOS.generique||[], p=liste.length ? liste[g%liste.length] : null;
  return { id:id, lab:illu.lab, svg:illuSvg(illu.corps, g), photo:p ? { src:'/img/illustrations/'+p.f, credit:p.credit } : null };
}
