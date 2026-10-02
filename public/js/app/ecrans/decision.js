/* Marché+ — Écran Décision et circuit d’approbation.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
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

  var wf=add(m,'div','card'); wf.style.marginTop='18px';
  var nReq=MPCircuits.nbRequises(state.approvals);
  add(wf,'div','panel-head','Circuit d\u2019approbation — '+nReq+' niveau(x) requis sur '+state.approvals.length+' configuré(s)');
  var b=add(wf,'div','pad');
  var fp=MPCircuits.prochaine(state.approvals);
  state.approvals.forEach(function(a,i){
    var row=add(b,'div','stepline');
    var requis=MPCircuits.requise(a);
    add(row,'div','stepnum '+(a.done?'done':(i===fp?'now':'')), a.done?'✓':String(i+1));
    var d=add(row,'div'); d.style.flex='1 1 auto';
    add(d,'strong',null,a.role); add(d,'div','muted',a.who);
    var cond=[];
    if(Number(a.seuil)>0) cond.push('à partir de '+xof(Number(a.seuil)));
    if(a.roleId) cond.push('réservé au rôle « '+((state.roles[a.roleId]||{}).lab||a.roleId)+' »');
    if(cond.length) add(d,'div','muted',cond.join(' · '));
    if(a.done) add(row,'span','chip c-green','Approuvé'+(a.at?' le '+a.at:''));
    else if(!requis) add(row,'span','chip c-grey','Non requis pour ce montant');
    else if(i===fp){
      var btn=add(row,'button','btn btn-primary btn-sm','Approuver');
      fk(btn,'appr-'+i); guard('decision.approve',btn);
      btn.addEventListener('click',function(){
        ask('Cette approbation est horodatée, nominative et consignée à la piste d\u2019audit.', function(){
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
      });
      var rj=add(row,'button','btn btn-ghost btn-sm','Rejeter');
      fk(rj,'rej-'+i); guard('decision.approve',rj);
      if(a.roleId && me().role!==a.roleId){
        var res='Niveau réservé au rôle « '+((state.roles[a.roleId]||{}).lab||a.roleId)+' ».';
        [btn,rj].forEach(function(x){ x.disabled=true; x.title=res; });
      }
      rj.addEventListener('click',function(){
        demander("Le rejet est motivé, nominatif et consigné à la piste d\u2019audit. La procédure revient à l\u2019évaluation et le circuit repart du premier niveau.", function(motif){
          cibler('POST','/approbations/'+i+'/rejet',{motif:motif}).then(function(r){
            if(!r) return;
            logit('Attribution rejetée — '+a.role);
            notify('appro.attendue','Attribution rejetée — '+a.role,
              "Le niveau « "+a.role+" » a rejeté l'attribution de la procédure "+REF()+". Motif : "+motif+". L'évaluation est rouverte.");
            save(); go('evaluation');
          });
        }, 'Rejeter l\u2019attribution au titre « '+a.role+' » ?', 'Rejeter', 'Motif du rejet');
      });
    } else add(row,'span','chip c-grey','En attente');
  });

  if((state.rejets||[]).length){
    var kr=add(m,'div','card'); kr.style.marginTop='18px';
    add(kr,'div','panel-head','Rejets antérieurs de l\u2019attribution');
    var br=add(kr,'div','pad');
    state.rejets.forEach(function(x){
      var row=add(br,'div','docline'); var lf=add(row,'div');
      add(lf,'strong',null,x.role); add(lf,'div','muted',x.motif);
      add(row,'span','chip c-grey',x.at);
    });
  }

  var n=add(m,'div','note');
  add(n,'strong',null,'La décision reste humaine. ');
  n.appendChild(document.createTextNode("Le classement est une proposition issue de la grille ; l'attribution n'existe qu'une fois les niveaux d'approbation franchis. Un comité peut s'écarter du classement — l'écart est alors consigné au procès-verbal, comme l'exige la contestabilité de la procédure."));
}
