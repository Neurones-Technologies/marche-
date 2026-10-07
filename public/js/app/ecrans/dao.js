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
  var c=state.cdc;
  var P=[];
  var lots=c.lots, specs=c.specs;

  /* ---------- PIÈCE 1 : AVIS ---------- */
  P.push({ id:'p1', titre:"Pièce 1 — Avis d'appel d'offres", cat:'admin', arts:[
    A('1.1',"Objet et identification",'admin',[
      c.autorite+" lance un "+c.procedure.toLowerCase()+" sous la référence "+REF()+" ayant pour objet : "+c.objet+".",
      "Le marché est passé en "+lots.length+" lot(s) distinct(s), pouvant être attribués séparément. Un même soumissionnaire peut présenter une offre pour un seul lot, pour plusieurs lots ou pour l'ensemble des lots ; il précise dans son acte d'engagement les lots pour lesquels il soumissionne et, le cas échéant, les remises consenties en cas d'attribution multiple.",
      "La procédure est ouverte aux entreprises établies dans l'espace UEMOA comme aux entreprises établies hors de cet espace, sous réserve de la production des pièces exigées à l'article 2.4 du règlement de la consultation."
    ]),
    A('1.2',"Conditions de participation et retrait du dossier",'admin',[
      "Le dossier d'appel d'offres est retiré au siège de l'autorité contractante ou téléchargé sur la plateforme de dématérialisation. Le retrait est gratuit et n'emporte aucune obligation de soumissionner ; il donne lieu à inscription au registre des retraits, qui sert de base à la diffusion des additifs et réponses aux questions.",
      "Les offres sont rédigées en "+c.langue.toLowerCase()+". Les documents établis dans une autre langue sont accompagnés d'une traduction française certifiée conforme, seule la version française faisant foi en cas de divergence.",
      "Les plis sont déposés au plus tard le "+c.ouverture+" à 10 h 00, heure locale d'Abidjan, sous double enveloppe cachetée ou par dépôt dématérialisé sur le portail. Tout pli parvenu après l'heure limite est écarté sans être ouvert et retourné au soumissionnaire à ses frais."
    ])
  ]});

  /* ---------- PIÈCE 2 : RÈGLEMENT DE LA CONSULTATION ---------- */
  P.push({ id:'p2', titre:"Pièce 2 — Règlement de la consultation", cat:'admin', arts:[
    A('2.1',"Forme et contenu des offres",'admin',[
      "L'offre comprend deux enveloppes intérieures distinctes et séparément cachetées : l'enveloppe « A — offre technique et pièces administratives » et l'enveloppe « B — offre financière ». Aucune indication de prix ne doit figurer dans l'enveloppe A ; la présence d'un élément de prix dans l'offre technique entraîne le rejet de l'offre.",
      "L'offre technique comprend le mémoire technique renseigné selon le cadre imposé en pièce 6, les fiches techniques des matériels proposés, le planning d'exécution, l'organigramme de l'équipe affectée et les curriculums des intervenants clés.",
      "L'offre financière comprend l'acte d'engagement signé, le bordereau des prix unitaires et le détail quantitatif estimatif, complétés sans rature ni surcharge. En cas de discordance entre le prix unitaire et le prix total d'une ligne, le prix unitaire fait foi et le total est rectifié en conséquence ; la correction est notifiée au soumissionnaire, qui peut la refuser, son offre étant alors écartée."
    ]),
    A('2.2',"Durée de validité et caution de soumission",'admin',[
      "Les offres demeurent valables pendant quatre-vingt-dix (90) jours calendaires à compter de la date limite de dépôt. L'autorité contractante peut solliciter une prorogation de ce délai ; le soumissionnaire qui refuse la prorogation voit son offre écartée sans que sa caution soit saisie.",
      "Chaque offre est accompagnée d'une caution de soumission d'un montant égal à "+c.caution+" % du montant de l'offre hors taxes, émise par un établissement bancaire agréé dans l'espace UEMOA ou, pour les soumissionnaires établis hors de cet espace, contre-garantie par un tel établissement.",
      "La caution de soumission est libérée dans les trente (30) jours suivant la notification d'attribution pour les soumissionnaires non retenus, et après constitution de la garantie de bonne exécution pour l'attributaire. Elle est acquise à l'autorité contractante en cas de retrait de l'offre pendant sa durée de validité ou de refus de signer le marché."
    ]),
    A('2.3',"Questions, additifs et visite de site",'admin',[
      "Les candidats adressent leurs demandes d'éclaircissement par écrit au plus tard sept (7) jours avant la date limite de dépôt. Les réponses, rendues anonymes, sont communiquées simultanément à tous les candidats ayant retiré le dossier et font partie intégrante du dossier d'appel d'offres.",
      "Lorsque l'autorité contractante organise une visite de site, sa date et ses modalités sont communiquées à tous les candidats consultés ; l'attestation de visite délivrée à cette occasion est alors jointe à l'offre.",
      "L'autorité contractante peut publier des additifs modifiant le dossier jusqu'à cinq (5) jours avant la date limite. Si un additif est de nature à modifier substantiellement la préparation des offres, la date limite de dépôt est reportée d'une durée au moins égale au délai restant à courir."
    ]),
    A('2.4',"Pièces du dossier de candidature",'admin',(function(){
      var pr=(state.formulaireReferencement||{}).pieces||[], couv=DOCS().filter(function(d){ return !!R.pieceReferencement(d,pr); });
      return couv.length ? ["Un soumissionnaire référencé auprès de l'autorité contractante est dispensé de produire les pièces déjà validées lors de son référencement et en cours de validité : "+couv.map(function(d){ return d.label.toLowerCase(); }).join(' ; ')+"."] : [];
    })().concat([
      "Tout soumissionnaire produit : le registre du commerce ou un document équivalent du pays d'établissement ; une attestation de régularité fiscale de moins de trois mois ; la caution de soumission ; les états financiers certifiés des trois derniers exercices ; la liste des marchés similaires exécutés au cours des cinq dernières années, appuyée d'attestations de bonne exécution.",
      "Les soumissionnaires établis en Côte d'Ivoire produisent en outre une attestation de l'organisme de prévoyance sociale de moins de trois mois.",
      "Les soumissionnaires établis hors de l'espace UEMOA produisent en outre : la traduction française certifiée de leurs pièces, la légalisation consulaire ou l'apostille de leurs documents officiels, la contre-garantie bancaire mentionnée à l'article 2.2, et un engagement de représentation locale précisant l'identité du représentant, l'adresse du domicile élu en Côte d'Ivoire et l'étendue de son mandat pendant la durée du marché et de la garantie.",
      "L'absence d'une pièce essentielle entraîne le rejet de l'offre. L'autorité contractante peut toutefois inviter un soumissionnaire à compléter une pièce purement formelle, dans un délai qu'elle fixe, dès lors que cette régularisation n'a pas pour effet de modifier le contenu de l'offre ni d'avantager son auteur."
    ])),
    A('2.5',"Évaluation des offres",'admin',[
      "L'évaluation se déroule en trois temps : examen de la conformité administrative, examen de la conformité technique au regard des spécifications minimales du CCTP, puis notation des offres techniquement conformes selon la grille pondérée annexée.",
      "La grille de notation en vigueur pour la présente consultation est la suivante : "+state.criteria.map(function(x){return x.label+" ("+x.weight+" %)";}).join(" ; ")+".",
      "Une offre qui ne satisfait pas une spécification minimale du CCTP est écartée sans être notée, quelle que soit la qualité du reste de la proposition. Les spécifications minimales sont celles expressément désignées comme telles au CCTP."
    ]),
    A('2.6', preferencePossible() ? "Préférence communautaire et comparaison des offres" : "Comparaison des offres",'admin', c.prefActive ? [
      "Une marge de préférence de "+c.prefTaux+" % est appliquée en faveur des soumissionnaires établis dans l'espace UEMOA. Pour les seuls besoins de la comparaison, le montant des offres présentées par des soumissionnaires établis hors de cet espace est majoré de ce taux.",
      "Cette majoration est une opération de comparaison et non de négociation : elle ne modifie ni le montant de l'offre, ni le prix du marché en cas d'attribution. Le montant contractuel demeure celui figurant à l'acte d'engagement de l'attributaire.",
      "Les offres libellées en devises étrangères sont converties en francs CFA au taux de change en vigueur à la date d'ouverture des plis, taux qui demeure figé pour toute la durée de l'évaluation. Cette règle vaut quelle que soit l'évolution ultérieure des cours."
    ] : [
      preferencePossible() ? "Aucune marge de préférence communautaire n'est appliquée dans le cadre de la présente consultation. Les offres sont comparées à leur contre-valeur en francs CFA, sans correction tenant au lieu d'établissement du soumissionnaire." : "Les offres sont comparées à leur contre-valeur en francs CFA.",
      "Les offres libellées en devises étrangères sont converties en francs CFA au taux de change en vigueur à la date d'ouverture des plis, taux qui demeure figé pour toute la durée de l'évaluation."
    ]),
    A('2.7',"Attribution, recours et abandon de la procédure",'admin',[
      "Le marché est attribué au soumissionnaire dont l'offre, techniquement conforme, obtient la note pondérée la plus élevée. L'attribution est notifiée à l'attributaire et l'information est communiquée aux soumissionnaires non retenus, avec indication des motifs du rejet de leur offre.",
      "Les soumissionnaires disposent d'un délai de recours auprès de l'autorité contractante puis, le cas échéant, de l'organe de régulation compétent. L'exercice d'un recours dans les délais suspend la signature du marché jusqu'à décision.",
      "L'autorité contractante peut déclarer la procédure infructueuse ou l'abandonner pour motif d'intérêt général, sans que les soumissionnaires puissent prétendre à indemnité. Cette décision est motivée et portée à la connaissance de tous les soumissionnaires."
    ])
  ]});

  /* ---------- PIÈCE 3 : CCAP ---------- */
  P.push({ id:'p3', titre:"Pièce 3 — Cahier des clauses administratives particulières", cat:'admin', arts:[
    A('3.1',"Pièces constitutives et ordre de priorité",'admin',[
      "Le marché est constitué, par ordre de priorité décroissant, de : l'acte d'engagement et ses annexes ; le présent CCAP ; le CCTP ; le bordereau des prix unitaires et le détail quantitatif estimatif ; le mémoire technique de l'attributaire ; les additifs publiés au cours de la consultation.",
      "En cas de contradiction entre deux pièces, la pièce de rang supérieur prévaut. Toute clause du mémoire technique de l'attributaire contraire au CCTP est réputée non écrite, sauf lorsqu'elle est plus favorable à l'autorité contractante."
    ]),
    A('3.2',"Prix, révision et régime fiscal",'admin',[
      "Les prix sont fermes et non révisables pendant les douze (12) premiers mois d'exécution. Au-delà, ils peuvent être actualisés selon la formule d'actualisation annexée à l'acte d'engagement, dans la limite d'une variation annuelle plafonnée.",
      "La taxe sur la valeur ajoutée est applicable au taux de "+c.tva+" %. Les prestations réalisées par un prestataire non résident sont soumises à une retenue à la source de "+c.retenueNonResident+" % sur la part de rémunération de source locale, opérée par l'autorité contractante et reversée à l'administration fiscale.",
      "Les droits et taxes à l'importation des matériels sont à la charge de : "+c.douaneACharge+". Le soumissionnaire intègre dans son prix l'ensemble des frais d'acheminement, d'assurance, de manutention, de dédouanement et de transport intérieur jusqu'aux sites d'installation, sauf stipulation contraire de l'acte d'engagement."
    ]),
    A('3.3',"Avance de démarrage et modalités de paiement",'admin',[
      "Une avance de démarrage de "+c.avance+" % du montant du marché est versée à l'attributaire sur présentation d'une garantie de restitution d'avance de même montant, émise par un établissement agréé dans l'espace UEMOA. L'avance est remboursée par retenues proportionnelles sur les acomptes.",
      "Les paiements sont effectués par virement dans un délai de trente (30) jours à compter de la réception de la facture accompagnée des pièces justificatives et du procès-verbal de service fait.",
      "Les acomptes sont versés selon l'avancement constaté : trente pour cent (30 %) à la livraison des matériels sur site, quarante pour cent (40 %) après installation et essais partiels concluants, vingt pour cent (20 %) à la réception provisoire, dix pour cent (10 %) à la réception définitive."
    ]),
    A('3.4',"Garanties, pénalités et résiliation",'admin',[
      "Une garantie de bonne exécution égale à cinq pour cent (5 %) du montant du marché est constituée dans les vingt (20) jours suivant la notification. Elle est libérée après la réception définitive, déduction faite des sommes éventuellement dues par le titulaire.",
      "Le délai d'exécution ne peut excéder "+c.delaiMax+" jours calendaires à compter de l'ordre de service de démarrage. Tout retard imputable au titulaire donne lieu à une pénalité de "+c.penalite+" ‰ du montant du marché par jour calendaire de retard, plafonnée à dix pour cent (10 %) du montant du marché.",
      "Le marché peut être résilié aux torts du titulaire en cas de manquement grave persistant après mise en demeure restée sans effet pendant quinze (15) jours, d'atteinte du plafond des pénalités, ou de fausse déclaration ayant déterminé l'attribution. La résiliation entraîne la saisie de la garantie de bonne exécution, sans préjudice des dommages et intérêts.",
      "Les différends sont réglés prioritairement à l'amiable. À défaut d'accord dans un délai de soixante (60) jours, ils relèvent des juridictions compétentes du lieu d'exécution du marché, le droit applicable étant celui de l'État de l'autorité contractante."
    ]),
    A('3.5',"Assurances, sous-traitance et confidentialité",'admin',[
      "Le titulaire justifie, avant tout démarrage, d'une assurance responsabilité civile professionnelle et d'une assurance couvrant les matériels jusqu'à leur réception, pour des montants adaptés à l'importance du marché.",
      "La sous-traitance est admise dans la limite de quarante pour cent (40 %) du montant du marché, sous réserve de l'agrément préalable et écrit de l'autorité contractante sur l'identité et les capacités du sous-traitant. Le titulaire demeure seul responsable de l'exécution vis-à-vis de l'autorité contractante.",
      "Le titulaire et ses intervenants sont tenus à une obligation de confidentialité absolue sur toute information relative aux systèmes, aux données et à l'organisation de l'autorité contractante, dont ils auraient connaissance à l'occasion du marché. Cette obligation survit cinq (5) ans à l'expiration du marché. Le personnel intervenant sur site fait l'objet d'une enquête de moralité préalable."
    ])
  ]});

  /* ---------- PIÈCE 4 : CCTP ---------- */
  // clauses propres à l'achat (rédigées par l'IA ou saisies : cdc.cctp) ; à défaut, un CCTP générique tiré du cahier
  // des charges. L'article des spécifications minimales est toujours construit depuis la liste du cahier des charges.
  var propres = (c.cctp && (c.cctp.articles||[]).length) ? c.cctp.articles : cctpGenerique(c);
  var artSpecs = { titre:"Spécifications minimales et fonctionnalités exigées", paragraphes:
    [ "Les spécifications ci-après constituent des exigences minimales au sens de l'article 2.5 du règlement de la consultation. Une offre qui n'en satisfait pas une seule est écartée sans être notée. Le soumissionnaire renseigne, pour chacune, la référence précise de la page de son offre où la conformité est démontrée." ]
    .concat(specs.map(function(s,i){ return "Exigence "+(i+1)+" — "+s+"."; }))
    .concat([ "Toute proposition de variante par rapport à ces exigences est présentée séparément, chiffrée distinctement, et ne dispense pas le soumissionnaire de présenter une offre de base strictement conforme." ]) };
  // placé après les exigences par lot (ou après le premier article)
  var apres = 1; propres.forEach(function(a,k){ if(/^Exigences techniques/.test(a.titre)) apres=k+1; });
  var cctp = propres.slice(0,apres).concat([artSpecs], propres.slice(apres)).map(function(a,k){ return A('4.'+(k+1), a.titre, 'tech', a.paragraphes); });
  P.push({ id:'p4', titre:"Pièce 4 — Cahier des clauses techniques particulières", cat:'tech', arts:cctp });

  /* ---------- PIÈCE 5 : BORDEREAU ---------- */
  P.push({ id:'p5', titre:"Pièce 5 — Bordereau des prix et détail quantitatif estimatif", cat:'admin', arts:[
    A('5.1',"Structure des prix",'admin',[
      "Le bordereau est renseigné ligne à ligne, sans ajout ni suppression de poste. Les prix unitaires sont exprimés hors taxes, dans la devise de soumission retenue, et s'entendent toutes sujétions comprises : fourniture, transport, assurance, dédouanement, installation, essais, documentation et formation afférents au poste.",
      "Un poste laissé vide est réputé inclus dans les autres prix du bordereau et ne pourra donner lieu à rémunération complémentaire. Un prix manifestement anormal au regard de la prestation attendue peut donner lieu à demande de justification écrite avant toute décision d'écartement.",
      "Le détail quantitatif estimatif est établi sur la base des quantités prévisionnelles indiquées. La rémunération du titulaire s'effectue sur la base des quantités réellement exécutées, constatées contradictoirement."
    ]),
    A('5.2',"Décomposition par lot et sous-détail",'admin',
      [ "Le bordereau comporte une section par lot, dont la structure est la suivante :" ]
      .concat(lots.map(function(l,i){ return "Section "+(i+1)+" — "+l.nom+" : postes de fourniture, postes de main-d'œuvre d'installation, postes d'essais et de recette, poste de documentation et de formation. Montant estimatif : "+l.montant+"."; }))
      .concat([ "Pour les postes dont le montant unitaire dépasse cinq millions (5 000 000) de francs CFA, un sous-détail de prix est joint, faisant apparaître la part de fourniture, la part de main-d'œuvre, les frais généraux et la marge." ]))
  ]});

  /* ---------- PIÈCE 6 : CADRE DU MÉMOIRE TECHNIQUE ---------- */
  P.push({ id:'p6', titre:"Pièce 6 — Cadre du mémoire technique", cat:'tech', arts:[
    A('6.1',"Structure imposée du mémoire technique",'tech',[
      "Le mémoire technique est présenté selon la structure imposée ci-après, sans inversion ni fusion de chapitres. Un mémoire ne respectant pas cette structure est plus difficilement comparable et s'expose à une notation défavorable sur le critère de méthodologie.",
      "Chapitre 1 — Compréhension du besoin et analyse du contexte : reformulation des enjeux, identification des contraintes propres au site et à l'activité de l'autorité contractante, points de vigilance relevés.",
      "Chapitre 2 — Solution technique proposée : description de la solution, schémas utiles, justification des choix au regard des exigences du CCTP.",
      "Chapitre 3 — Fournitures et matériels proposés : fiches techniques, tableau de conformité exigence par exigence avec renvoi de page, attestations constructeur, engagements de support et de disponibilité des pièces.",
      "Chapitre 4 — Méthodologie d'exécution : phasage, étapes de mise en œuvre, gestion des interruptions de service, plan de repli en cas de difficulté.",
      "Chapitre 5 — Organisation et moyens : organigramme nominatif, curriculums des intervenants clés, moyens matériels affectés, localisation des équipes, part de sous-traitance envisagée.",
      "Chapitre 6 — Planning détaillé : planning par lot et par phase, chemin critique identifié, jalons de contrôle, marges prévues pour l'acheminement et le dédouanement.",
      "Chapitre 7 — Plan de recette : scénarios de test par exigence, modes de preuve, critères d'acceptation, modèle de procès-verbal.",
      "Chapitre 8 — Garantie, maintenance et niveaux de service : organisation du support, disponibilité des pièces, engagements de délais d'intervention.",
      "Chapitre 9 — Analyse et maîtrise des risques : registre des risques identifiés, probabilité, impact, mesures de prévention et plans de contingence associés.",
      "Chapitre 10 — Références : marchés similaires exécutés, périmètre, montant, année, attestations de bonne exécution, contacts joignables pour vérification."
    ]),
    A('6.2',"Éléments attendus à l'appui de la notation qualitative",'tech',[
      "La notation du critère de méthodologie s'appuie sur le caractère spécifique et vérifiable des éléments produits. Un mémoire reprenant les termes du CCTP sans les traduire en organisation concrète est considéré comme générique et noté en conséquence.",
      "Sont particulièrement valorisés : un planning dont le chemin critique est identifié et argumenté, un plan de repli documenté, un registre des risques comportant des mesures opérationnelles et non des intentions, et des références vérifiables auprès de contacts joignables.",
      "Sont considérés comme insuffisants : les plannings sans jalon de contrôle, les organigrammes sans nom ni curriculum, les engagements de délai non assortis de moyens correspondants, et les références dont le périmètre n'est pas comparable à celui du présent marché."
    ])
  ]});

  /* ---------- PIÈCE 7 : MODÈLES ---------- */
  P.push({ id:'p7', titre:"Pièce 7 — Modèles et formulaires", cat:'admin', arts:[
    A('7.1',"Liste des modèles annexés",'admin',[
      "Sont annexés au présent dossier, à utiliser sans modification : le modèle d'acte d'engagement ; le modèle de caution de soumission ; le modèle de garantie de bonne exécution ; le modèle de garantie de restitution d'avance ; la déclaration sur l'honneur de non-exclusion ; le formulaire de renseignements sur le candidat ; le tableau de conformité aux spécifications minimales ; le modèle d'attestation de visite de site.",
      "Toute modification apportée par un soumissionnaire au texte d'un modèle de garantie bancaire est signalée à l'autorité contractante, qui apprécie si elle en altère la portée. Une garantie dont la rédaction prive l'autorité contractante de son caractère à première demande est réputée non conforme."
    ])
  ]});

  return P;
}
