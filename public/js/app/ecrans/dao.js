/* Marché+ — Générateur du contenu du dossier d’appel d’offres (pièces et articles) ; sa mise en page en PDF est dans dossier-pdf.js.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Générateur de dossier d'appel d'offres ============ */
function A(n,t,cat,paras){ return {n:n,t:t,cat:cat,p:paras}; }
/* CCTP générique, quand aucune clause propre à l'achat n'a été rédigée : tiré de l'objet, des lots et des conditions. */
function cctpGenerique(c){
  var art=[{ titre:"Contexte, périmètre et objectifs", paragraphes:[
    "Le présent cahier des clauses techniques particulières définit les exigences techniques applicables au marché ayant pour objet : "+(c.objet||'')+".",
    "Le périmètre couvre l'ensemble des fournitures et prestations nécessaires à la réalisation de cet objet, telles que décrites ci-après et au bordereau des prix, y compris la livraison, la mise en œuvre, les essais et la documentation.",
    "Le soumissionnaire décrit dans son mémoire technique la manière dont il répond à chacune des exigences du présent cahier, en renvoyant aux pages de son offre qui en apportent la preuve."
  ]}];
  (c.lots||[]).forEach(function(lot){
    art.push({ titre:"Exigences techniques — "+lot.nom, paragraphes:[
      "Le présent article définit les exigences applicables au "+String(lot.nom||'').toLowerCase()+(lot.montant ? ", dont le montant estimatif s'établit à "+lot.montant : '')+".",
      "Les prestations de ce lot sont exécutées conformément aux règles de l'art et aux normes en vigueur. Le soumissionnaire détaille dans son mémoire technique les moyens matériels et humains qu'il affecte à ce lot, ainsi que le planning d'exécution correspondant."
    ]});
  });
  art.push({ titre:"Délais, essais et réception", paragraphes:[
    "Le délai d'exécution ne peut excéder "+(c.delaiMax||'—')+" jours calendaires à compter de l'ordre de service de démarrage ; il inclut les délais d'acheminement et, le cas échéant, de dédouanement.",
    "Les fournitures et prestations font l'objet d'essais de vérification selon un plan de recette proposé par le titulaire et approuvé par l'autorité contractante. La réception est prononcée après levée des réserves bloquantes."
  ]});
  art.push({ titre:"Garantie, documentation et formation", paragraphes:[
    "Les fournitures sont garanties pendant au moins "+(c.garantieMin||'—')+" mois à compter de la réception, pièces, main-d'œuvre et déplacements compris.",
    "Le titulaire remet en français la documentation nécessaire à l'exploitation et à l'entretien, et assure la formation des utilisateurs désignés par l'autorité contractante."
  ]});
  return art;
}

function buildDAO(){
  var c=state.cdc, lots=c.lots||[], specs=c.specs||[], crit=state.criteria||[], K=CADRE();
  var P=[];
  var txt=function(x){ return String(x==null?'':x); };
  var heure=function(){ return (c.ouverture ? c.ouverture : '—')+' à 10 h 00'; };
  var jours=function(n){ return n ? n+' jours' : 'le délai indiqué dans l’offre'; };

  /* ---------- PIÈCE 1 : OBJET ET MODALITÉS ---------- */
  P.push({ id:'p1', titre:"Pièce 1 — Objet et modalités de la consultation", cat:'admin', arts:[
    A('1.1',"Objet et lots",'admin',[
      txt(c.autorite)+" lance une consultation ("+txt(c.procedure).toLowerCase()+"), référence "+REF()+", pour : "+txt(c.objet)+".",
      lots.length>1
        ? "Le marché comprend "+lots.length+" lots ; un soumissionnaire peut répondre à un seul lot, à plusieurs ou à tous, en précisant dans son offre les lots visés et les remises éventuelles en cas d'attribution multiple."
        : "Le marché comprend un lot unique."
    ]),
    A('1.2',"Dépôt des offres et questions",'admin',[
      "Les offres sont rédigées en "+txt(c.langue||'français').toLowerCase()+" et déposées sur le portail de la plateforme au plus tard le "+heure()+" (heure d'Abidjan). Une offre déposée après cette heure est écartée.",
      "Les offres restent valables 90 jours à compter de cette date."+(c.caution ? " Chaque offre est accompagnée d'une caution de soumission de "+c.caution+" % du montant de l'offre hors taxes." : ""),
      "Les questions s'adressent par écrit depuis le portail, au plus tard 7 jours avant la date limite. Les réponses et les éventuels additifs sont communiqués à tous les candidats consultés et font partie du dossier ; un additif tardif reporte la date limite."
    ])
  ]});

  /* ---------- PIÈCE 2 : CONTENU DE L'OFFRE ET ÉVALUATION ---------- */
  var pr=(state.formulaireReferencement||{}).pieces||[], couv=DOCS().filter(function(d){ return !!R.pieceReferencement(d,pr); });
  var parPortee=function(portee){ return DOCS().filter(function(d){ return (d.scope||'tous')===portee && !R.pieceReferencement(d,pr); }).map(function(d){ return d.label; }); };
  var pieces=[];
  if(couv.length) pieces.push("Un soumissionnaire référencé est dispensé des pièces déjà validées à son référencement et en cours de validité : "+couv.map(function(d){ return d.label.toLowerCase(); }).join(' ; ')+".");
  [['tous','Tous les soumissionnaires joignent à leur offre : '],['local','Les soumissionnaires établis dans le pays de l\u2019acheteur joignent en outre : '],['etranger','Les soumissionnaires établis hors de l\u2019espace UEMOA joignent en outre : ']].forEach(function(g){
    var l=parPortee(g[0]); if(l.length) pieces.push(g[1]+l.join(' ; ')+'.');
  });
  if(!pieces.length) pieces.push("Aucune pièce n'est exigée en dehors de l'offre technique et de l'offre financière.");
  pieces.push("L'absence d'une pièce essentielle entraîne le rejet de l'offre ; une pièce purement formelle peut être régularisée dans le délai fixé par l'acheteur.");

  var evaluation=[
    "L'évaluation se fait en trois temps : conformité administrative, conformité technique aux spécifications minimales du CCTP, puis notation des offres conformes selon la grille : "+crit.map(function(x){ return x.label+" ("+x.weight+" %)"; }).join(" ; ")+".",
    "Une offre qui ne satisfait pas une spécification minimale est écartée sans être notée. Le marché est attribué à l'offre conforme qui obtient la meilleure note pondérée.",
    c.prefActive && preferencePossible()
      ? "Une marge de préférence de "+c.prefTaux+" % est appliquée, pour la seule comparaison, aux offres de soumissionnaires établis hors de l'espace UEMOA ; elle ne modifie ni leur prix ni le prix du marché. Les offres en devise étrangère sont converties en francs CFA au taux en vigueur à la date d'ouverture des plis."
      : "Les offres en devise étrangère sont converties en francs CFA au taux en vigueur à la date d'ouverture des plis, figé pour toute l'évaluation."
  ];
  if(K && K.recoursActif) evaluation.push("L'attribution est notifiée à tous les soumissionnaires avec les motifs du rejet de leur offre. Un recours est possible pendant "+(K.delaiRecoursJours ? K.delaiRecoursJours+' jours' : 'le délai prévu')+" ; il suspend la signature du marché jusqu'à décision.");
  else evaluation.push("L'attribution est notifiée à tous les soumissionnaires. L'acheteur peut déclarer la consultation infructueuse ou l'abandonner, sans indemnité, par décision motivée.");

  P.push({ id:'p2', titre:"Pièce 2 — Contenu de l'offre et évaluation", cat:'admin', arts:[
    A('2.1',"Contenu de l'offre",'admin',[
      "L'offre technique comprend le mémoire technique, structuré selon le cadre de la pièce 5, les fiches techniques des fournitures proposées et le planning d'exécution. Elle ne contient aucun prix.",
      "L'offre financière comprend l'acte d'engagement signé et le bordereau des prix de la pièce 5, complétés sans rature. En cas d'écart entre prix unitaire et prix total d'une ligne, le prix unitaire fait foi."
    ]),
    A('2.2',"Pièces à joindre",'admin',pieces),
    A('2.3',"Évaluation et attribution",'admin',evaluation)
  ]});

  /* ---------- PIÈCE 3 : BESOIN ET EXIGENCES TECHNIQUES (CCTP) ---------- */
  // clauses propres à l'achat (rédigées par l'IA ou saisies : cdc.cctp) ; à défaut, un CCTP générique tiré du cahier
  // des charges. L'article des spécifications minimales est toujours construit depuis la liste du cahier des charges.
  var propres = (c.cctp && (c.cctp.articles||[]).length) ? c.cctp.articles : cctpGenerique(c);
  var artSpecs = { titre:"Spécifications minimales exigées", paragraphes:
    [ "Les exigences ci-après sont minimales (article 2.3) : une offre qui n'en satisfait pas une seule est écartée sans être notée. Le soumissionnaire indique, pour chacune, la page de son offre qui démontre la conformité." ]
    .concat(specs.map(function(x,k){ return "Exigence "+(k+1)+" — "+x+"."; }))
    .concat([ "Une variante est présentée séparément et chiffrée à part ; elle ne dispense pas d'une offre de base strictement conforme." ]) };
  // placé après les exigences par lot (ou après le premier article)
  var apres = 1; propres.forEach(function(a,k){ if(/^Exigences techniques/.test(a.titre)) apres=k+1; });
  var cctp = propres.slice(0,apres).concat([artSpecs], propres.slice(apres)).map(function(a,k){ return A('3.'+(k+1), a.titre, 'tech', a.paragraphes); });
  P.push({ id:'p3', titre:"Pièce 3 — Besoin et exigences techniques", cat:'tech', arts:cctp });

  /* ---------- PIÈCE 4 : CONDITIONS CONTRACTUELLES ESSENTIELLES ---------- */
  var cond=[
    "Les prix sont hors taxes, fermes pendant les douze premiers mois, toutes sujétions comprises (fourniture, transport, assurance, installation, essais, documentation)."
      +(c.tva!==''&&c.tva!=null ? " La TVA applicable est de "+c.tva+" %." : "")
      +(c.retenueNonResident ? " Une retenue à la source de "+c.retenueNonResident+" % s'applique à la rémunération d'un prestataire non résident." : "")
      +(c.douaneACharge ? " Droits et taxes à l'importation à la charge de : "+txt(c.douaneACharge).toLowerCase()+"." : ""),
    (c.avance ? "Une avance de démarrage de "+c.avance+" % est versée contre garantie de restitution. " : "")+"Les paiements se font par virement sous 30 jours après réception de la facture et du procès-verbal de service fait."
  ];
  var delais=[];
  if(c.delaiMax) delais.push("Le délai d'exécution ne dépasse pas "+jours(c.delaiMax)+" calendaires à compter de l'ordre de service.");
  if(c.penalite!==''&&c.penalite!=null&&Number(c.penalite)>0) delais.push("Tout retard imputable au titulaire donne lieu à une pénalité de "+c.penalite+" ‰ du montant du marché par jour, plafonnée à 10 % du montant.");
  if(c.garantieMin) delais.push("Les fournitures sont garanties au moins "+c.garantieMin+" mois à compter de la réception, pièces et main-d'œuvre comprises.");
  P.push({ id:'p4', titre:"Pièce 4 — Conditions contractuelles essentielles", cat:'admin', arts:[
    A('4.1',"Prix, taxes et paiement",'admin',cond),
    A('4.2',"Délais, pénalités et garantie",'admin',delais.concat(["Le marché est constitué, par ordre de priorité, de l'acte d'engagement, du présent dossier, du bordereau des prix, du mémoire technique de l'attributaire et des additifs publiés."]))
  ]});

  /* ---------- PIÈCE 5 : CADRE DE RÉPONSE ---------- */
  P.push({ id:'p5', titre:"Pièce 5 — Cadre de réponse", cat:'admin', arts:[
    A('5.1',"Bordereau des prix",'admin',[
      "Le bordereau est complété ligne à ligne, sans ajout ni suppression de poste, hors taxes, en "+txt(c.deviseSoumission||'devise de soumission')+". Un poste laissé vide est réputé inclus dans les autres prix.",
      "Le cadre ci-dessous comporte une section par lot. Au-delà de 5 000 000 de francs CFA par poste, joindre un sous-détail (fourniture, main-d'œuvre, frais généraux, marge)."
    ]),
    A('5.2',"Cadre du mémoire technique",'tech',[
      "Le mémoire suit cet ordre : 1. compréhension du besoin et du contexte ; 2. solution et fournitures proposées, avec un tableau de conformité exigence par exigence (renvoi de page) ; 3. méthodologie et planning détaillé, jalons et chemin critique ; 4. organisation, équipe nominative et moyens affectés ; 5. garantie, maintenance et niveaux de service ; 6. références de marchés similaires (périmètre, montant, année, contact joignable).",
      "La note de méthodologie récompense les éléments précis et vérifiables (planning à jalons, équipe nommée, plan de repli, références vérifiables) plutôt que la reprise des termes du CCTP."
    ])
  ]});

  return P;
}
