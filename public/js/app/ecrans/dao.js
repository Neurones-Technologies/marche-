/* Marché+ — Générateur du contenu du dossier d’appel d’offres (pièces et articles) ; sa mise en page en PDF est dans dossier-pdf.js.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Générateur de dossier d'appel d'offres ============ */
function A(n,t,cat,paras){ return {n:n,t:t,cat:cat,p:paras}; }

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
      "Une visite de site est organisée sur trois agences représentatives du parc : une agence du district d'Abidjan, une agence de ville secondaire et une agence isolée alimentée par groupe électrogène. La visite est obligatoire ; l'attestation de visite délivrée à cette occasion est une pièce du dossier de candidature.",
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
    A('2.6',"Préférence communautaire et comparaison des offres",'admin', c.prefActive ? [
      "Une marge de préférence de "+c.prefTaux+" % est appliquée en faveur des soumissionnaires établis dans l'espace UEMOA. Pour les seuls besoins de la comparaison, le montant des offres présentées par des soumissionnaires établis hors de cet espace est majoré de ce taux.",
      "Cette majoration est une opération de comparaison et non de négociation : elle ne modifie ni le montant de l'offre, ni le prix du marché en cas d'attribution. Le montant contractuel demeure celui figurant à l'acte d'engagement de l'attributaire.",
      "Les offres libellées en devises étrangères sont converties en francs CFA au taux de change en vigueur à la date d'ouverture des plis, taux qui demeure figé pour toute la durée de l'évaluation. Cette règle vaut quelle que soit l'évolution ultérieure des cours."
    ] : [
      "Aucune marge de préférence communautaire n'est appliquée dans le cadre de la présente consultation. Les offres sont comparées à leur contre-valeur en francs CFA, sans correction tenant au lieu d'établissement du soumissionnaire.",
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

  /* ---------- PIÈCE 4 : CCTP (volume technique dominant) ---------- */
  var cctp=[];
  cctp.push(A('4.1',"Contexte, périmètre et objectifs",'tech',[
    "L'autorité contractante exploite un réseau d'agences bancaires réparties sur l'ensemble du territoire, comprenant des agences urbaines raccordées à la fibre optique, des agences de villes secondaires desservies par liaison radio ou cuivre, et des agences isolées dont la connectivité repose sur une liaison satellitaire de secours. Le présent marché a pour objet la modernisation de l'infrastructure réseau locale de ces agences.",
    "Le périmètre couvre la fourniture, le transport, l'installation, le paramétrage, les essais, la mise en service, la documentation, la formation et la maintenance des équipements décrits ci-après. Il inclut la dépose et l'évacuation des équipements remplacés, ainsi que la reprise du câblage existant lorsque celui-ci ne satisfait pas les exigences de la présente pièce.",
    "Les objectifs assignés au marché sont : porter la disponibilité du réseau d'agence à un niveau compatible avec l'activité bancaire de guichet ; segmenter les flux métier, monétique et bureautique ; réduire le délai de remise en service après incident ; et doter l'exploitant d'une supervision centralisée couvrant l'ensemble du parc.",
    "Les quantités indiquées au détail quantitatif estimatif sont données à titre indicatif et pourront varier de plus ou moins vingt pour cent (20 %) sans que le titulaire puisse prétendre à une modification de ses prix unitaires."
  ]));
  cctp.push(A('4.2',"Architecture cible et principes de conception",'tech',[
    "L'architecture cible repose sur une topologie en étoile au niveau de chaque agence, avec un équipement de distribution unique assurant la commutation locale et le raccordement aux liaisons opérateur. Les agences de plus de vingt postes disposent de deux équipements de commutation en cascade, dimensionnés pour absorber la charge en cas de défaillance de l'un d'eux.",
    "Le raccordement au réseau étendu est assuré par un routeur d'agence disposant d'au moins deux interfaces WAN actives, permettant une bascule automatique vers la liaison de secours sans intervention humaine et sans coupure de session supérieure à trente (30) secondes.",
    "La segmentation logique est obligatoire et repose sur des réseaux locaux virtuels distincts pour : les postes de travail bureautiques, les applications métier bancaires, les automates et la monétique, la téléphonie sur IP, la vidéosurveillance, et l'administration des équipements. Aucun flux ne transite entre ces segments sans passer par un point de filtrage explicite.",
    "La conception proposée est justifiée dans le mémoire technique par un schéma d'architecture par type d'agence, un plan d'adressage cohérent avec le plan existant, et une matrice des flux autorisés entre segments.",
    "Le soumissionnaire propose une architecture homogène sur l'ensemble du parc. Les solutions reposant sur plusieurs gammes hétérogènes d'équipements pour une même fonction sont écartées, sauf justification technique circonstanciée acceptée par l'autorité contractante."
  ]));
  cctp.push(A('4.3',"Contraintes d'environnement — climat, énergie et sûreté",'tech',[
    "SPÉCIFICATION MINIMALE. Les matériels fonctionnent sans dégradation de performance dans une plage de température ambiante comprise entre 0 et 45 °C et une humidité relative pouvant atteindre 95 % sans condensation. Les équipements dont la plage de fonctionnement nominale est inférieure sont écartés, sauf à être livrés avec un dispositif de conditionnement d'air dédié chiffré dans l'offre.",
    "Les matériels installés en zone sahélienne ou exposés à l'harmattan présentent un indice de protection contre la poussière au moins égal à IP 4X au niveau des entrées d'air, ou sont installés dans des baies équipées de filtres à poussière démontables et remplaçables sans outil. Le titulaire fournit un jeu de filtres de rechange par site.",
    "L'alimentation électrique est réputée instable : le titulaire dimensionne ses équipements pour supporter des variations de tension comprises entre 170 et 260 volts, des microcoupures répétées et des retours de tension brutaux après reprise du groupe électrogène. Les alimentations acceptant une plage plus étroite sont protégées par un régulateur de tension chiffré dans l'offre.",
    "Chaque site est équipé d'un onduleur dimensionné pour assurer une autonomie minimale de trente (30) minutes à pleine charge de l'ensemble des équipements réseau et de sécurité, avec bypass automatique et report d'alarme vers la supervision. Le calcul de dimensionnement est joint à l'offre.",
    "Les équipements sont installés dans des locaux techniques fermant à clé, dans des baies verrouillables. Les ports non utilisés sont désactivés administrativement. Les câbles de brassage sont repérés aux deux extrémités selon une convention de nommage soumise à l'approbation de l'autorité contractante avant déploiement."
  ]));

  /* Spécifications par lot, générées depuis la configuration */
  var LOTTEXT = [
    ["Les équipements actifs sont administrables, alimentés en courant alternatif et dotés d'alimentations redondées pour les agences de plus de vingt postes. Ils supportent le marquage de réseaux locaux virtuels selon la norme 802.1Q, la qualité de service à huit files d'attente, l'agrégation de liens et le contrôle d'accès au port selon la norme 802.1X.",
     "Les commutateurs proposent au minimum vingt-quatre ports gigabit cuivre et deux ports optiques de liaison montante. La fourniture d'électricité par le port selon la norme 802.3at est exigée sur au moins la moitié des ports afin d'alimenter les téléphones IP, les caméras et les bornes sans fil, avec un budget de puissance total explicitement chiffré.",
     "Les routeurs d'agence assurent le chiffrement des flux inter-sites, la bascule automatique entre liaisons, le marquage et la priorisation des flux applicatifs bancaires, et l'ouverture d'un tunnel de secours sur liaison satellitaire avec gestion de la latence associée.",
     "Les matériels proposés ne font pas l'objet d'une annonce de fin de commercialisation à la date de remise des offres, et bénéficient d'un support constructeur garanti pendant au moins cinq (5) ans à compter de la réception provisoire. Une attestation du constructeur ou de son distributeur agréé est jointe à l'offre."],
    ["Le câblage est réalisé en cuivre catégorie 6A blindé, avec une garantie système constructeur de vingt-cinq (25) ans couvrant les composants et les performances de la liaison. Les liaisons dépassant quatre-vingt-dix (90) mètres sont réalisées en fibre optique.",
     "Chaque poste de travail est desservi par deux prises RJ45. Les liaisons vers les automates bancaires et les équipements monétiques sont physiquement distinctes et repérées par un code couleur dédié, afin d'interdire tout brassage accidentel avec le réseau bureautique.",
     "Les baies de brassage sont de hauteur 42U, équipées de panneaux de brassage, de passe-câbles horizontaux, de deux unités de distribution électrique sur départs distincts, d'un éclairage intérieur et d'une sonde de température reportée à la supervision.",
     "SPÉCIFICATION MINIMALE. Chaque lien cuivre installé fait l'objet d'un test de certification au moyen d'un appareil étalonné de moins de douze mois. Les rapports de certification, lien par lien, sont remis sous forme numérique exploitable et conditionnent la réception provisoire du lot."],
    ["L'installation est réalisée sans interruption de l'activité de guichet. Les interventions nécessitant une coupure sont planifiées en dehors des heures d'ouverture et font l'objet d'une demande de changement approuvée au moins cinq (5) jours ouvrés à l'avance.",
     "Chaque site fait l'objet d'une visite préalable contradictoire donnant lieu à un relevé d'existant et à une fiche de préparation validée par l'exploitant. Le déploiement est organisé par vagues géographiques, avec un site pilote dont la recette complète conditionne la poursuite du déploiement.",
     "La formation porte sur l'exploitation courante, le diagnostic de premier niveau et les procédures de remise en service. Elle est dispensée en français, sur site, en groupes de huit personnes au maximum, et donne lieu à la remise d'un support pédagogique et à une évaluation individuelle des acquis.",
     "Le titulaire assure un accompagnement renforcé pendant les quinze (15) jours ouvrés suivant la mise en service de chaque vague, avec présence sur site ou astreinte dédiée selon la criticité des agences concernées."],
    ["La maintenance couvre la maintenance préventive, la maintenance corrective et la gestion des pièces de rechange pendant toute la durée du contrat, sur l'ensemble des sites déployés.",
     "La maintenance préventive comprend au minimum deux visites annuelles par site, portant sur le nettoyage des filtres, le contrôle des serrages et des températures, la vérification des batteries d'onduleur, la mise à jour des micrologiciels validés et le contrôle de la sauvegarde des configurations. Chaque visite donne lieu à un rapport signé par l'exploitant du site.",
     "Un stock de pièces de rechange est constitué et maintenu sur le territoire national, représentant au minimum dix pour cent (10 %) des équipements déployés par référence, avec un minimum d'une unité par référence. L'inventaire de ce stock est communiqué trimestriellement à l'autorité contractante.",
     "Le titulaire s'engage sur la disponibilité des pièces pendant toute la durée du contrat. En cas d'obsolescence d'une référence, il propose un équipement de remplacement de caractéristiques au moins équivalentes, sans surcoût pour l'autorité contractante."]
  ];
  lots.forEach(function(lot,i){
    var base = LOTTEXT[i] || ["Les prestations de ce lot sont exécutées conformément aux règles de l'art et aux normes en vigueur. Le soumissionnaire détaille dans son mémoire technique les moyens matériels et humains qu'il affecte à ce lot, ainsi que le planning d'exécution correspondant."];
    var paras = [ "Le présent chapitre définit les exigences applicables au "+lot.nom.toLowerCase()+", dont le montant estimatif s'établit à "+lot.montant+"." ].concat(base);
    cctp.push(A('4.'+(4+i), "Exigences techniques — "+lot.nom, 'tech', paras));
  });

  var nx = 4+lots.length;
  cctp.push(A('4.'+nx,"Spécifications minimales et fonctionnalités exigées",'tech',
    [ "Les spécifications ci-après constituent des exigences minimales au sens de l'article 2.5 du règlement de la consultation. Une offre qui n'en satisfait pas une seule est écartée sans être notée. Le soumissionnaire renseigne, pour chacune, la référence précise de la page de son offre où la conformité est démontrée." ]
    .concat(specs.map(function(s,i){ return "Exigence "+(i+1)+" — "+s+"."; }))
    .concat([ "Toute proposition de variante par rapport à ces exigences est présentée séparément, chiffrée distinctement, et ne dispense pas le soumissionnaire de présenter une offre de base strictement conforme." ])));

  cctp.push(A('4.'+(nx+1),"Normes, homologations et origine des matériels",'tech',[
    "Les matériels sont neufs, d'origine, et n'ont fait l'objet d'aucun reconditionnement. Le soumissionnaire produit une attestation du constructeur ou de son distributeur agréé pour la zone, certifiant l'authenticité des matériels et l'ouverture des droits au support et aux mises à jour de sécurité.",
    "Les équipements sont conformes aux normes internationales applicables en matière de compatibilité électromagnétique et de sécurité électrique, ainsi qu'aux exigences de l'autorité nationale de régulation des télécommunications lorsqu'ils comportent des fonctions radioélectriques. Les certificats correspondants sont joints.",
    "Les interfaces d'administration, la documentation et les messages système sont disponibles en français ou en anglais. Lorsqu'ils ne sont disponibles qu'en anglais, le titulaire fournit un référentiel de traduction des messages d'alarme et des procédures d'exploitation critiques.",
    "SPÉCIFICATION MINIMALE. Les équipements bénéficient de mises à jour de sécurité publiées par le constructeur pendant au moins cinq (5) ans. Les matériels en fin de support à la date de remise des offres sont écartés."
  ]));

  cctp.push(A('4.'+(nx+2),"Sécurité des systèmes d'information bancaires",'tech',[
    "L'administration des équipements s'effectue exclusivement par protocole chiffré, depuis un réseau d'administration dédié et isolé. Les protocoles d'administration en clair sont désactivés sur l'ensemble du parc, sans exception, y compris pendant les phases de déploiement.",
    "Les comptes d'administration par défaut sont supprimés ou renommés et leurs mots de passe modifiés avant mise en service. L'authentification des administrateurs s'appuie sur un annuaire central avec traçabilité nominative des actions ; l'usage de comptes génériques partagés est proscrit.",
    "Les segments portant des flux monétiques respectent les exigences de cloisonnement applicables aux données de porteurs de cartes : séparation physique ou logique stricte, filtrage explicite, journalisation des accès et interdiction de tout transit par le segment bureautique.",
    "Les journaux des équipements sont exportés en temps réel vers un collecteur central, horodatés par une source de temps commune, et conservés pendant douze (12) mois au minimum. Le titulaire fournit la configuration permettant cet export et vérifie sa complétude lors de la recette.",
    "Les configurations sont sauvegardées automatiquement après chaque modification et archivées de manière versionnée. Le titulaire remet une procédure documentée de restauration complète d'un équipement à partir de sa sauvegarde, testée en présence de l'exploitant lors de la recette."
  ]));

  cctp.push(A('4.'+(nx+3),"Supervision, exploitation et indicateurs",'tech',[
    "L'ensemble des équipements est supervisé depuis la plateforme centrale de l'autorité contractante au moyen du protocole SNMP version 3, à l'exclusion des versions antérieures non chiffrées. Le titulaire fournit les fichiers de définition des objets gérés et assiste l'exploitant dans leur intégration.",
    "Sont remontés au minimum : la disponibilité de chaque équipement et de chaque liaison, l'état des alimentations et des ventilateurs, la température interne, le taux d'utilisation des interfaces, le taux d'erreurs, l'état des batteries d'onduleur et les bascules de liaison WAN.",
    "Le titulaire propose un jeu de seuils d'alerte argumenté et un tableau de bord d'exploitation présentant l'état du parc par région, par type d'agence et par criticité. Ce tableau de bord est livré paramétré et fonctionnel à la réception provisoire.",
    "Les indicateurs contractuels de disponibilité sont calculés mensuellement à partir des données de supervision, sur la base de relevés contradictoires. Toute divergence entre les relevés du titulaire et ceux de l'exploitant est tranchée au profit des relevés de l'autorité contractante, sauf preuve contraire apportée par le titulaire."
  ]));

  cctp.push(A('4.'+(nx+4),"Essais, recette et réception",'tech',[
    "Les essais se déroulent en trois phases : essais en usine ou en plateau sur un échantillon représentatif avant expédition ; essais de mise en service site par site ; recette globale portant sur l'ensemble du parc déployé.",
    "Le plan de recette est proposé par le titulaire et approuvé par l'autorité contractante avant tout démarrage. Il comporte, pour chaque exigence du présent CCTP, un scénario de test, un résultat attendu et un mode de preuve. Une exigence sans scénario de test associé est réputée non recettée.",
    "Les essais comprennent au minimum : la certification de chaque lien de câblage, la vérification de la segmentation par tentative de flux interdits, l'essai de bascule automatique de liaison WAN avec chronométrage de la reprise, l'essai d'autonomie sur onduleur, la vérification des remontées de supervision et la restauration d'une configuration depuis sauvegarde.",
    "La réception provisoire est prononcée après levée de toutes les réserves bloquantes et remise complète de la documentation. La réception définitive intervient au terme d'une période d'observation de trois (3) mois d'exploitation sans incident bloquant imputable au titulaire.",
    "Tout incident survenu pendant la période d'observation et imputable au titulaire suspend le décompte de celle-ci jusqu'à correction définitive et validation par l'exploitant."
  ]));

  cctp.push(A('4.'+(nx+5),"Documentation et transfert de compétences",'tech',[
    "Le titulaire remet, en français et sous format numérique modifiable : le dossier des ouvrages exécutés par site, les schémas d'architecture et de câblage mis à jour, le plan d'adressage, la matrice des flux, les configurations commentées, les procédures d'exploitation courante et les procédures de reprise après incident.",
    "Le dossier de chaque site comporte le relevé des liens certifiés, les photographies des installations avant et après intervention, la liste des matériels installés avec leurs numéros de série, et le procès-verbal de mise en service signé par le responsable d'agence.",
    "Le transfert de compétences porte sur l'exploitation, le diagnostic et la maintenance de premier niveau. Il comprend des sessions théoriques et des travaux pratiques sur maquette, et fait l'objet d'une évaluation des acquis dont les résultats sont communiqués à l'autorité contractante.",
    "La documentation est mise à jour par le titulaire à chaque modification intervenant pendant la période de garantie. Une documentation non à jour constitue une réserve bloquante à la réception définitive."
  ]));

  cctp.push(A('4.'+(nx+6),"Niveaux de service, délais d'intervention et astreinte",'tech',[
    "SPÉCIFICATION MINIMALE. Le délai d'intervention sur site est inférieur à huit (8) heures ouvrées pour les agences du district d'Abidjan et à vingt-quatre (24) heures ouvrées pour les autres agences du territoire, à compter de la déclaration de l'incident.",
    "Le délai de remise en service est de quatre (4) heures pour un incident bloquant l'activité de guichet en agence urbaine et de vingt-quatre (24) heures pour les autres sites. Lorsque la remise en service exige une pièce non disponible en stock local, le titulaire met en place une solution de contournement dans ces mêmes délais.",
    "Le titulaire met en place un point d'entrée unique joignable en français, disponible pendant les heures ouvrées et en astreinte pour les incidents bloquants, avec accusé de prise en compte sous trente (30) minutes et suivi traçable de chaque incident jusqu'à clôture contradictoire.",
    "Le non-respect d'un délai contractuel donne lieu à l'application de pénalités spécifiques, cumulables avec les pénalités de retard prévues au CCAP, selon le barème annexé à l'acte d'engagement.",
    "Un comité de suivi trimestriel réunit le titulaire et l'exploitant pour examiner les indicateurs, les incidents récurrents et les actions correctives engagées. Le compte rendu de ce comité est annexé au dossier de marché."
  ]));

  cctp.push(A('4.'+(nx+7),"Logistique, transport, dédouanement et délais d'acheminement",'tech',[
    "Le soumissionnaire détaille dans son offre la chaîne logistique retenue : lieu d'expédition, mode de transport, incoterm proposé, délai d'acheminement prévisionnel et marges prises en compte pour les opérations de dédouanement.",
    "Les délais d'acheminement et de dédouanement sont inclus dans le délai global d'exécution. Aucune prolongation de délai ne sera accordée au titre de difficultés logistiques ou douanières ordinaires, celles-ci étant réputées connues et intégrées au planning.",
    "Les matériels sont conditionnés pour un transport maritime ou aérien en zone tropicale, avec protection contre l'humidité et les chocs. Tout matériel livré avec un emballage détérioré fait l'objet de réserves à la livraison et peut être refusé.",
    "Le titulaire supporte les frais de stockage et de magasinage en cas de retard qui lui est imputable. Il assure les matériels jusqu'à leur réception provisoire par l'autorité contractante."
  ]));

  cctp.push(A('4.'+(nx+8),"Environnement, sécurité au travail et gestion des déchets",'tech',[
    "Les interventions sont conduites dans le respect des règles de sécurité applicables aux établissements recevant du public. Le personnel intervenant dispose des équipements de protection individuelle adaptés et d'une habilitation électrique en cours de validité pour les travaux concernés.",
    "Les équipements déposés sont évacués par le titulaire et traités dans une filière conforme à la réglementation applicable aux déchets d'équipements électriques et électroniques. Un bordereau de suivi des déchets est remis à l'autorité contractante pour chaque enlèvement.",
    "Les batteries d'onduleur remplacées font l'objet d'une reprise systématique par le titulaire et d'un traitement en filière spécialisée. Leur abandon sur site constitue un manquement grave au sens du CCAP.",
    "Le titulaire propose, à performances égales, les matériels présentant la consommation électrique la plus faible, et documente dans son mémoire technique la consommation prévisionnelle du parc installé."
  ]));

  cctp.push(A('4.'+(nx+9),"Liaisons étendues, qualité de service et performance applicative",'tech',[
    "Le titulaire configure la priorisation des flux de sorte que les applications de guichet et la monétique disposent d'une bande passante garantie, y compris en période de saturation. Les flux de sauvegarde, de mise à jour et de bureautique lourde sont relégués en classe non prioritaire et peuvent être écrêtés.",
    "SPÉCIFICATION MINIMALE. La latence aller-retour entre une agence raccordée par liaison terrestre et le centre de traitement n'excède pas cent cinquante (150) millisecondes en heure de pointe, et la perte de paquets sur les flux prioritaires demeure inférieure à un pour mille (1 ‰) mesuré sur une heure glissante.",
    "Les agences desservies par liaison satellitaire font l'objet d'un paramétrage spécifique tenant compte de la latence propre à ce mode de transport : adaptation des temporisations applicatives, compression des en-têtes lorsque cela est pertinent, et exclusion explicite des flux non critiques pendant les heures d'ouverture.",
    "Le titulaire réalise, avant réception provisoire, une campagne de mesure de performance sur un échantillon représentatif d'au moins quinze pour cent (15 %) des sites, couvrant chaque type de raccordement. Les résultats sont consignés dans un rapport contradictoire.",
    "Le dimensionnement proposé tient compte d'une croissance de trafic de vingt pour cent (20 %) par an sur trois ans. Le soumissionnaire justifie ses hypothèses de dimensionnement dans son mémoire technique."
  ]));
  cctp.push(A('4.'+(nx+10),"Téléphonie sur IP et intégration des services de communication",'tech',[
    "Les équipements de commutation assurent l'alimentation électrique des postes téléphoniques par le port et leur affectation automatique au réseau local virtuel dédié à la voix, sans configuration manuelle poste par poste.",
    "Les flux de signalisation et de média sont marqués et priorisés de bout en bout. Le titulaire vérifie lors de la recette que la qualité vocale mesurée demeure satisfaisante en situation de charge, y compris lors d'une bascule de liaison WAN.",
    "L'acheminement des appels d'urgence et des appels vers le centre de sécurité de l'autorité contractante reste opérationnel en cas de perte de la liaison principale. Le dispositif de secours proposé est décrit et testé lors de la recette.",
    "Les postes existants conservés sont inventoriés et leur compatibilité avec l'infrastructure proposée est vérifiée avant déploiement. Tout poste incompatible est signalé à l'autorité contractante, qui décide de son remplacement ou de son maintien sur infrastructure dédiée."
  ]));
  cctp.push(A('4.'+(nx+11),"Réseau sans fil en agence",'tech',[
    "Le réseau sans fil comporte deux services distincts : un service interne réservé aux équipements professionnels, authentifié par certificat ou par annuaire, et un service invité strictement isolé du réseau interne, sans aucune route vers les segments métier ou monétique.",
    "SPÉCIFICATION MINIMALE. Le service invité est cloisonné au niveau du port et au niveau du routage. Une architecture reposant uniquement sur un filtrage applicatif pour séparer le service invité du réseau interne est refusée.",
    "La couverture radio est dimensionnée à partir d'une étude par type d'agence, tenant compte des cloisons, des espaces de caisse et des zones de coffre. Une étude de couverture après installation est réalisée sur un échantillon de sites et remise à l'autorité contractante.",
    "Les bornes sont administrables de manière centralisée, avec application automatique des politiques de sécurité et des mises à jour. Le remplacement d'une borne défaillante s'effectue sans reconfiguration manuelle, la configuration étant restituée depuis le contrôleur central."
  ]));
  cctp.push(A('4.'+(nx+12),"Courants faibles, vidéosurveillance et systèmes de sûreté",'tech',[
    "Les flux de vidéosurveillance sont portés par un réseau local virtuel dédié et n'empruntent en aucun cas le segment bureautique. Le dimensionnement des liens tient compte du débit cumulé des caméras et de la durée de rétention exigée par la politique de sûreté de l'autorité contractante.",
    "Les équipements de contrôle d'accès et de détection d'intrusion raccordés au réseau font l'objet d'un segment spécifique, dont les flux sortants sont limités aux seuls serveurs de gestion identifiés dans la matrice des flux.",
    "La perte de la liaison étendue ne doit pas interrompre l'enregistrement local des images ni le fonctionnement autonome du contrôle d'accès. Le titulaire vérifie ce comportement lors de la recette, liaison débranchée.",
    "Le titulaire coordonne ses interventions avec les prestataires de sûreté en place. Toute intervention susceptible d'interrompre un système de sûreté fait l'objet d'une autorisation écrite préalable du responsable sûreté de l'autorité contractante."
  ]));
  cctp.push(A('4.'+(nx+13),"Reprise de l'existant et migration",'tech',[
    "Le titulaire réalise un inventaire contradictoire de l'existant par site avant toute dépose : équipements, versions, configurations, raccordements opérateur et servitudes particulières. Cet inventaire est validé par l'exploitant et sert de référence en cas de litige.",
    "Les configurations existantes sont sauvegardées et archivées avant toute modification. Aucune dépose n'intervient avant que la sauvegarde ne soit vérifiée comme exploitable.",
    "La migration s'effectue site par site, avec une fenêtre de bascule définie et un point de non-retour explicite. Au-delà de ce point, si la bascule n'est pas achevée, le plan de repli est déclenché et le site est restitué dans son état initial avant la reprise de l'activité.",
    "SPÉCIFICATION MINIMALE. Aucune agence ne peut rester indisponible au-delà de l'ouverture des guichets du fait d'une opération de migration. Le plan de repli est documenté, testé sur le site pilote et approuvé avant tout déploiement de masse.",
    "Les équipements déposés sont conservés en quarantaine pendant trente (30) jours avant évacuation, afin de permettre une restitution rapide en cas de difficulté post-migration."
  ]));
  cctp.push(A('4.'+(nx+14),"Continuité d'activité et résilience des agences",'tech',[
    "L'architecture proposée permet le maintien de l'activité de guichet en mode dégradé en cas de perte de la liaison principale, par bascule automatique sur la liaison de secours. Le mode dégradé et ses limites fonctionnelles sont documentés et portés à la connaissance des exploitants d'agence.",
    "Le titulaire fournit, pour chaque type d'agence, une fiche de conduite à tenir en cas d'incident majeur : diagnostic de premier niveau, actions autorisées à l'agent d'agence, seuil d'escalade et coordonnées du support.",
    "Un exercice de simulation d'incident est organisé avant la réception définitive sur au moins trois sites de typologies différentes, en présence de l'exploitant. Le compte rendu de cet exercice, incluant les délais constatés, est annexé au dossier de réception.",
    "Les temps de reprise constatés lors de ces exercices constituent la référence contractuelle. Un écart significatif entre les délais annoncés à l'offre et les délais constatés donne lieu à un plan d'action correctif à la charge du titulaire."
  ]));
  cctp.push(A('4.'+(nx+15),"Gestion des versions, obsolescence et évolutions",'tech',[
    "Le titulaire maintient un référentiel des versions de micrologiciels déployées par référence d'équipement et par site. Toute mise à jour est précédée d'une validation en maquette et d'une demande de changement approuvée.",
    "Les mises à jour correctives de sécurité qualifiées de critiques par le constructeur sont déployées dans un délai de trente (30) jours à compter de leur publication, après validation en maquette. Les mises à jour fonctionnelles suivent le calendrier convenu en comité de suivi.",
    "Le titulaire informe l'autorité contractante de toute annonce de fin de commercialisation ou de fin de support affectant un matériel déployé, dans le mois suivant l'annonce, et propose une trajectoire de remplacement.",
    "Aucune modification de configuration n'est apportée en production sans demande de changement tracée, comportant la description de l'opération, l'analyse d'impact, la procédure de retour arrière et la fenêtre d'intervention."
  ]));
  cctp.push(A('4.'+(nx+16),"Contrôle de capacité, métrologie et amélioration continue",'tech',[
    "Le titulaire met en place une métrologie permettant de suivre l'évolution de la charge des liens, l'occupation des ports, la consommation électrique et la température des locaux techniques, avec conservation des historiques sur douze (12) mois glissants.",
    "Un rapport trimestriel de capacité est remis à l'autorité contractante, identifiant les sites approchant leurs limites, les incidents récurrents et les recommandations d'évolution argumentées et chiffrées.",
    "Les incidents récurrents font l'objet d'une analyse de cause racine formalisée, distincte du simple rétablissement du service. L'analyse est présentée en comité de suivi avec le plan d'action correspondant et son échéancier.",
    "Les recommandations du titulaire n'engagent l'autorité contractante que lorsqu'elles sont acceptées par écrit. Une recommandation formulée et non suivie d'effet ne dégage pas le titulaire de ses obligations de résultat sur le périmètre contractuel."
  ]));

  cctp.push(A('4.'+(nx+17),"Mise à la terre, protection foudre et surtensions",'tech',[
    "SPÉCIFICATION MINIMALE. Chaque local technique dispose d'une prise de terre dont la résistance mesurée est inférieure à dix (10) ohms. La mesure est réalisée contradictoirement avant installation ; lorsque la valeur n'est pas atteinte, le titulaire chiffre et réalise la reprise de la prise de terre au titre du marché.",
    "L'ensemble des masses métalliques des baies, chemins de câbles et coffrets est relié à une barrette de terre unique par site, selon un maillage documenté au dossier des ouvrages exécutés. Les liaisons équipotentielles sont réalisées en conducteur de section adaptée et repérées.",
    "Des parafoudres de type adapté sont installés en tête d'alimentation électrique de chaque local technique ainsi que sur les arrivées de liaisons cuivre extérieures. Les parafoudres comportent un report d'état de fin de vie vers la supervision.",
    "Les liaisons cuivre entre bâtiments distincts d'un même site sont proscrites : elles sont réalisées en fibre optique, y compris sur de courtes distances, afin d'éviter la propagation des surtensions d'origine atmosphérique.",
    "Le titulaire remet, pour chaque site, un procès-verbal de mesure de terre et de continuité des liaisons équipotentielles, daté et signé. L'absence de ce procès-verbal constitue une réserve bloquante à la réception provisoire du site concerné."
  ]));
  cctp.push(A('4.'+(nx+18),"Prérequis de site, génie civil et servitudes",'tech',[
    "Le titulaire établit, pour chaque site, une fiche de prérequis précisant les besoins en alimentation électrique, en espace, en ventilation, en cheminement de câbles et en travaux de percement éventuels. Cette fiche est transmise à l'autorité contractante au moins quinze (15) jours avant l'intervention.",
    "Les travaux de génie civil légers nécessaires au cheminement des câbles, à la pose des chemins de câbles et à la fixation des baies sont inclus dans le marché, ainsi que les rebouchages, les reprises de peinture et le nettoyage des zones d'intervention.",
    "Les percements de parois coupe-feu sont rebouchés au moyen de dispositifs conservant le degré coupe-feu d'origine. Un relevé photographique des rebouchages est joint au dossier des ouvrages exécutés.",
    "Le titulaire est réputé avoir pris connaissance de l'état des sites lors de la visite obligatoire. Aucune plus-value ne sera accordée au titre de sujétions de site qu'une visite attentive aurait permis d'identifier.",
    "Les interventions en agence sont conduites de manière à préserver l'accueil du public : protection des sols, limitation du bruit pendant les heures d'ouverture, dégagement quotidien des zones de circulation et évacuation des gravats en fin de journée."
  ]));
  cctp.push(A('4.'+(nx+19),"Interopérabilité avec le système d'information et la monétique",'tech',[
    "L'infrastructure proposée s'intègre sans adaptation du système d'information existant. Le soumissionnaire identifie dans son mémoire technique les éventuels points d'adhérence et les modalités de vérification préalable qu'il propose.",
    "Les automates bancaires et terminaux monétiques conservent leur adressage et leur cheminement réseau après migration, sauf décision contraire de l'autorité contractante. Toute modification affectant ces équipements fait l'objet d'une validation préalable de l'exploitant monétique.",
    "SPÉCIFICATION MINIMALE. Les flux à destination des automates bancaires ne transitent par aucun équipement partagé avec le réseau invité, et sont filtrés de manière explicite à chaque franchissement de segment.",
    "Le titulaire réalise, avant bascule de chaque site comportant un automate, un essai de transaction de bout en bout en condition réelle, tracé et validé par l'exploitant monétique. Aucune bascule n'est réputée achevée sans cet essai.",
    "Les fenêtres d'intervention sur les segments monétiques sont arrêtées conjointement avec les exploitants concernés et tiennent compte des périodes de forte affluence, notamment les fins de mois et les veilles de jours fériés."
  ]));
  cctp.push(A('4.'+(nx+20),"Gestion des identités, administration déléguée et traçabilité",'tech',[
    "Les droits d'administration sont attribués selon le principe du moindre privilège, par profils distincts : administration complète, exploitation courante, consultation seule. Les profils et leurs périmètres sont définis avec l'autorité contractante avant mise en service.",
    "Les intervenants du titulaire disposent de comptes nominatifs, individuellement identifiés, dont la création et la suppression suivent une procédure formalisée. La sortie d'un intervenant de l'équipe projet entraîne la révocation de ses accès sous vingt-quatre (24) heures.",
    "Les accès distants du titulaire aux équipements sont soumis à autorisation préalable pour chaque intervention, transitent par un point d'accès contrôlé par l'autorité contractante, et sont intégralement journalisés.",
    "Un relevé trimestriel des comptes actifs et des accès effectués est remis à l'autorité contractante. Tout écart entre les comptes déclarés et les comptes constatés donne lieu à explication écrite du titulaire."
  ]));
  cctp.push(A('4.'+(nx+21),"Repérage, inventaire et gestion des actifs",'tech',[
    "Chaque équipement installé est étiqueté de manière durable et lisible, résistante à la chaleur et à l'humidité, mentionnant l'identifiant du site, l'identifiant de l'équipement et sa fonction, selon la convention de nommage approuvée.",
    "Le titulaire constitue et remet un inventaire complet du parc déployé, exploitable sous format tableur, comportant par équipement : le site, la localisation précise, la référence, le numéro de série, la version de micrologiciel, la date de mise en service et la date d'échéance de garantie.",
    "Cet inventaire est tenu à jour pendant toute la durée du marché et remis actualisé à chaque comité de suivi trimestriel. Il est également remis lors de la réception définitive dans un format permettant sa reprise dans l'outil de gestion des actifs de l'autorité contractante.",
    "Les numéros de série déclarés sont vérifiables auprès du constructeur. Toute discordance entre l'inventaire déclaré et le parc constaté lors d'un contrôle inopiné constitue un manquement au sens du CCAP."
  ]));
  cctp.push(A('4.'+(nx+22),"Variantes, équivalences techniques et propriété des livrables",'tech',[
    "Les soumissionnaires peuvent proposer des variantes techniques, à la condition expresse de présenter également une offre de base strictement conforme aux exigences du présent CCTP. Une offre composée exclusivement de variantes est écartée.",
    "Toute proposition présentée comme équivalente à une exigence du CCTP est accompagnée d'une démonstration technique documentée de cette équivalence, pièce à pièce. La charge de la preuve incombe au soumissionnaire ; l'appréciation de l'équivalence relève de l'autorité contractante.",
    "Les configurations, scripts, procédures, schémas et documentations produits au titre du marché deviennent la propriété de l'autorité contractante, qui peut les utiliser, les modifier et les communiquer à un tiers intervenant sur son infrastructure, sans que le titulaire puisse s'y opposer.",
    "Les licences logicielles nécessaires au fonctionnement des équipements sont acquises au nom de l'autorité contractante et transférables. Les licences nominatives au titulaire ou non transférables sont refusées.",
    "À l'expiration du marché, le titulaire assure la réversibilité : remise de l'ensemble des éléments d'exploitation à jour, transfert des accès, et accompagnement du prestataire entrant pendant une période de trente (30) jours, incluse dans le prix du marché."
  ]));

  cctp.push(A('4.'+(nx+23),"Réception des matériels sur site, stockage et conservation",'tech',[
    "Les matériels sont réceptionnés contradictoirement sur chaque site ou sur la plateforme logistique du titulaire, en présence d'un représentant de l'autorité contractante. La réception donne lieu à un procès-verbal mentionnant les références, les quantités, les numéros de série et l'état des emballages.",
    "Le stockage intermédiaire est assuré dans des locaux fermés, secs et ventilés, à l'abri de l'ensoleillement direct et des infiltrations. Les matériels sont stockés sur palettes ou étagères, jamais à même le sol, afin de prévenir les dommages en cas d'inondation saisonnière.",
    "Les matériels demeurent sous la garde et la responsabilité du titulaire jusqu'à leur installation et leur mise en service. Toute perte, vol ou détérioration survenant avant réception provisoire est à sa charge exclusive, y compris lorsque le stockage s'effectue dans les locaux de l'autorité contractante.",
    "Les équipements sensibles à l'humidité sont conservés dans leur emballage d'origine avec dessiccant jusqu'à l'installation. Un matériel dont l'emballage a été ouvert plus de trente (30) jours avant installation fait l'objet d'un contrôle de bon fonctionnement documenté avant mise en service.",
    "Le titulaire tient un registre de mouvement des matériels, du port ou de l'entrepôt jusqu'au site d'installation, consultable à tout moment par l'autorité contractante."
  ]));
  cctp.push(A('4.'+(nx+24),"Sites isolés et contraintes d'accès",'tech',[
    "Certaines agences sont situées hors des grands axes et peuvent être difficilement accessibles en saison des pluies. Le soumissionnaire intègre cette contrainte dans son planning et précise, pour chacun de ces sites, la fenêtre d'intervention qu'il retient et les moyens logistiques mobilisés.",
    "SPÉCIFICATION MINIMALE. Pour les sites isolés, le titulaire constitue sur place un jeu de pièces de rechange de premier niveau permettant le remplacement des composants les plus exposés sans attendre un acheminement depuis Abidjan. La liste de ce jeu est soumise à l'approbation de l'autorité contractante.",
    "Les interventions sur ces sites sont regroupées afin de limiter les déplacements. Le titulaire propose un calendrier de tournées préventives cohérent avec les contraintes saisonnières d'accès.",
    "Lorsque l'accès physique est temporairement impossible, le titulaire met en œuvre les moyens de diagnostic et de correction à distance dont il dispose, et en informe l'exploitant. L'impossibilité d'accès dûment constatée suspend le décompte des délais d'intervention, à charge pour le titulaire d'en apporter la preuve.",
    "Le titulaire prend à sa charge l'ensemble des frais de déplacement, d'hébergement et de mission de ses équipes, quels que soient l'éloignement du site et la durée de l'intervention. Aucune facturation complémentaire à ce titre ne sera admise."
  ]));
  cctp.push(A('4.'+(nx+25),"Essais de montée en charge et vérification du dimensionnement",'tech',[
    "Avant la réception provisoire, le titulaire réalise des essais de montée en charge sur un site représentatif de chaque typologie d'agence, visant à vérifier le comportement de l'infrastructure en conditions de trafic soutenu.",
    "Les essais portent notamment sur : la saturation progressive des liens montants, le comportement de la qualité de service sous charge, la tenue des équipements en température après plusieurs heures de fonctionnement à charge élevée, et le comportement du dispositif lors d'une bascule de liaison en pleine charge.",
    "Les résultats sont comparés aux hypothèses de dimensionnement présentées dans le mémoire technique. Un écart défavorable significatif entre les performances annoncées et les performances constatées engage le titulaire à renforcer le dimensionnement à ses frais.",
    "Les essais sont conduits en dehors des heures d'ouverture au public et selon un protocole approuvé préalablement. Les mesures sont relevées contradictoirement et consignées dans un rapport d'essais annexé au dossier de réception.",
    "Le titulaire fournit l'ensemble des moyens de test nécessaires à ces essais : générateurs de trafic, appareils de mesure étalonnés, sondes de température. Ces moyens demeurent sa propriété et sont retirés à l'issue des essais."
  ]));

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
      "Chapitre 1 — Compréhension du besoin et analyse du contexte : reformulation des enjeux, identification des contraintes propres au parc d'agences, points de vigilance relevés lors de la visite de site.",
      "Chapitre 2 — Architecture technique proposée : schémas par type d'agence, plan d'adressage, matrice des flux, justification des choix au regard des exigences du CCTP.",
      "Chapitre 3 — Matériels proposés : fiches techniques, tableau de conformité exigence par exigence avec renvoi de page, attestations constructeur, engagements de support et de disponibilité des pièces.",
      "Chapitre 4 — Méthodologie de déploiement : découpage en vagues, site pilote, procédure de bascule, gestion des interruptions de service, plan de repli en cas d'échec d'une bascule.",
      "Chapitre 5 — Organisation et moyens : organigramme nominatif, curriculums des intervenants clés, moyens matériels affectés, localisation des équipes, part de sous-traitance envisagée.",
      "Chapitre 6 — Planning détaillé : planning par lot et par vague, chemin critique identifié, jalons de contrôle, marges prévues pour l'acheminement et le dédouanement.",
      "Chapitre 7 — Plan de recette : scénarios de test par exigence, modes de preuve, critères d'acceptation, modèle de procès-verbal.",
      "Chapitre 8 — Maintenance et niveaux de service : organisation du support, localisation du stock de pièces, engagements de délais par zone géographique, dispositif d'astreinte.",
      "Chapitre 9 — Analyse et maîtrise des risques : registre des risques identifiés, probabilité, impact, mesures de prévention et plans de contingence associés.",
      "Chapitre 10 — Références : marchés similaires exécutés, périmètre, montant, année, attestations de bonne exécution, contacts joignables pour vérification."
    ]),
    A('6.2',"Éléments attendus à l'appui de la notation qualitative",'tech',[
      "La notation du critère de méthodologie s'appuie sur le caractère spécifique et vérifiable des éléments produits. Un mémoire reprenant les termes du CCTP sans les traduire en organisation concrète est considéré comme générique et noté en conséquence.",
      "Sont particulièrement valorisés : un planning dont le chemin critique est identifié et argumenté, un plan de repli documenté pour chaque bascule, un registre des risques comportant des mesures opérationnelles et non des intentions, et des références vérifiables auprès de contacts joignables.",
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
