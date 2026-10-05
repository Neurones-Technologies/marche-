/* Marché+ — Écran Décision et circuit d’approbation.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Le circuit d'approbation est un tableau : on approuve ou rejette depuis la ligne du niveau attendu. */
"use strict";

function vDecision(m){
  if(!state.evalDone) return locked(m,"Le circuit d'approbation s'ouvre une fois l'évaluation validée.",'evaluation',"Aller à l'évaluation");
  var rows=ranking(), win=rows[0], c=state.cdc;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,"Proposition d'attribution");

  var card=add(m,'div','card pad');
  add(card,'div','stat-k','Attributaire proposé par le classement');
  var nm=add(card,'div'); nm.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:4px 0 2px';
  add(nm,'span',null,win.o.name).style.cssText='font-size:24px;font-weight:700';
  originChip(nm,win.o);
  add(card,'div','muted', sep(win.o.montant)+' '+win.o.devise+' ('+xof(montantXOF(win.o))+') · '+win.o.delai+' jours · note '+win.total.toFixed(1)+'/100');
  if(rows[1]) add(card,'div','muted','Écart avec le 2ᵉ ('+rows[1].o.name+') : '+(win.total-rows[1].total).toFixed(1)+' point(s).').style.marginTop='8px';
  if(!isUemoa(win.o)){
    var wn=add(card,'div','warn'); wn.style.marginTop='14px';
    add(wn,'strong',null,'Attributaire hors zone UEMOA. ');
    wn.appendChild(document.createTextNode("Vérifier avant signature : retenue à la source de "+c.retenueNonResident+" % sur les prestations de source locale, régime douanier des équipements importés (à la charge de "+c.douaneACharge.toLowerCase()+"), validité de la contre-garantie bancaire auprès d'un établissement agréé, et modalités de représentation locale pendant la garantie de "+c.garantieMin+" mois minimum."));
  }

  var nReq=MPCircuits.nbRequises(state.approvals);
  var fp=MPCircuits.prochaine(state.approvals);
  tableau(m,{ cle:'circuit', titre:'Circuit d’approbation — '+nReq+' niveau(x) requis sur '+state.approvals.length+' configuré(s)',
    lignes:state.approvals.map(function(a,i){ return {a:a,i:i}; }),
    colonnes:[
      {lab:'Niveau', rendu:function(x,td){ add(td,'span','stepnum '+(x.a.done?'done':(x.i===fp?'now':'')), x.a.done?'✓':String(x.i+1)); }},
      {lab:'Rôle', rendu:function(x,td){ add(td,'strong',null,x.a.role); add(td,'div','muted',x.a.who); }},
      {lab:'Conditions', val:function(x){
        var cond=[];
        if(Number(x.a.seuil)>0) cond.push('à partir de '+xof(Number(x.a.seuil)));
        if(x.a.roleId) cond.push('réservé au rôle « '+((state.roles[x.a.roleId]||{}).lab||x.a.roleId)+' »');
        return cond.length ? cond.join(' · ') : '—';
      }},
      {lab:'Statut', rendu:function(x,td){
        var a=x.a;
        if(a.done) chipCellule(td,'Approuvé'+(a.at?' le '+a.at:''),'c-green');
        else if(!MPCircuits.requise(a)) chipCellule(td,'Non requis pour ce montant','c-grey');
        else chipCellule(td, x.i===fp ? 'À approuver' : 'En attente', x.i===fp ? 'c-amber' : 'c-grey');
      }}
    ],
    actions:function(x,td){
      var a=x.a, i=x.i;
      if(a.done || !MPCircuits.requise(a) || i!==fp) return;
      var btn=boutonCellule(td,'Approuver',function(){
        ask('Cette approbation est horodatée, nominative et consignée à la piste d’audit.', function(){
          cibler('POST','/approbations/'+i).then(function(r){
            if(!r) return;
            logit('Approbation — '+a.role+' ('+a.who+')');
            if(allApproved()){
              logit('Attribution prononcée — '+win.o.name);
              notify('attribution','Attribution prononcée',
                "Le marché "+REF()+" est attribué à "+win.o.name+" ("+win.o.pays+") pour "+xof(montantXOF(win.o))+", délai "+win.o.delai+" jours. Notification aux soumissionnaires non retenus à préparer, sous réserve du délai de recours.");
              save(); go('pv'); return;
            }
            var nxt=null; for(var z=0;z<state.approvals.length;z++) if(!state.approvals[z].done){ nxt=state.approvals[z]; break; }
            if(nxt) notify('appro.attendue','Approbation attendue — '+nxt.role,
              "Le niveau « "+a.role+" » a approuvé. Niveau suivant attendu : "+nxt.role+" ("+nxt.who+").");
            save(); render();
          });
        }, 'Approuver au titre « '+a.role+' » ?', 'Approuver');
      },'appr-'+i,true);
      guard('decision.approve',btn);
      var rj=boutonCellule(td,'Rejeter',function(){
        demander("Le rejet est motivé, nominatif et consigné à la piste d’audit. La procédure revient à l’évaluation et le circuit repart du premier niveau.", function(motif){
          cibler('POST','/approbations/'+i+'/rejet',{motif:motif}).then(function(r){
            if(!r) return;
            logit('Attribution rejetée — '+a.role);
            notify('appro.attendue','Attribution rejetée — '+a.role,
              "Le niveau « "+a.role+" » a rejeté l'attribution de la procédure "+REF()+". Motif : "+motif+". L'évaluation est rouverte.");
            save(); go('evaluation');
          });
        }, 'Rejeter l’attribution au titre « '+a.role+' » ?', 'Rejeter', 'Motif du rejet');
      },'rej-'+i);
      guard('decision.approve',rj);
      if(a.roleId && me().role!==a.roleId){
        var res='Niveau réservé au rôle « '+((state.roles[a.roleId]||{}).lab||a.roleId)+' ».';
        [btn,rj].forEach(function(z){ z.disabled=true; z.title=res; });
      }
    }
  });

  if((state.rejets||[]).length){
    tableau(m,{ cle:'rejets', titre:'Rejets antérieurs de l’attribution', lignes:state.rejets.map(function(x,i){ return {x:x,i:i}; }),
      colonnes:[
        {lab:'Niveau', rendu:function(r,td){ add(td,'strong',null,r.x.role); }},
        {lab:'Motif', rendu:function(r,td){ add(td,'div','dt-extrait',r.x.motif); }},
        {lab:'Date', val:function(r){ return r.x.at; }}
      ],
      recherche:function(r){ return r.x.role+' '+r.x.motif; },
      actions:function(r,td){ boutonDetail(td,function(){
        ouvrirFenetre('Rejet — '+r.x.role, function(c){
          var x=(state.rejets||[])[r.i]; if(!x) return false;
          grilleLecture(c,[['Niveau',x.role],['Date',x.at]]);
          champLecture(c,'Motif',x.motif);
        });
      },'rejet-'+r.i); }
    });
  }

  var n=add(m,'div','note');
  add(n,'strong',null,'La décision reste humaine. ');
  n.appendChild(document.createTextNode("Le classement est une proposition issue de la grille ; l'attribution n'existe qu'une fois les niveaux d'approbation franchis. Un comité peut s'écarter du classement — l'écart est alors consigné au procès-verbal, comme l'exige la contestabilité de la procédure."));
}
