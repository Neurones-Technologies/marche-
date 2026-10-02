/* Marché+ — Écran Conformité et anomalies.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function vConformite(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Conformité & anomalies');

  var c1=add(m,'div','card');
  add(c1,'div','panel-head','Contrôle des pièces par soumissionnaire');
  var sx=add(c1,'div','scroll-x'); var t=add(sx,'table');
  var tr=add(add(t,'thead'),'tr');
  ['Soumissionnaire','Origine','Pièces exigées','Manquantes','Décision'].forEach(function(x){ add(tr,'th',null,x); });
  var tb=add(t,'tbody');
  SEED_OFFERS.forEach(function(o){
    var r=add(tb,'tr');
    add(r,'td',null,o.name).style.fontWeight='600';
    originChip(add(r,'td'),o);
    add(r,'td',null, String(requiredDocs(o).length));
    var mis=missingDocs(o);
    var tdm=add(r,'td');
    if(!mis.length) add(tdm,'span','chip c-green','Aucune');
    else mis.forEach(function(d){ var c=add(tdm,'span','chip c-red',d.label); c.style.margin='2px 4px 2px 0'; });
    var ex=excluded(o);
    var btn=add(add(r,'td'),'button','btn btn-sm '+(ex?'btn-ghost':'btn-danger'), ex?'Réintégrer':'Écarter');
    fk(btn,'excl-'+o.id); guard('conformite.decide',btn);
    btn.addEventListener('click',function(){
      var mis=missingDocs(o);
      var q = ex ? ('L\u2019offre sera de nouveau notée et classée.'+(mis.length?' Elle présente encore '+mis.length+' pièce(s) manquante(s) : la réintégration devra être motivée au procès-verbal.':''))
                 : ('L\u2019offre ne sera plus notée ni classée. La décision reste réversible et sera consignée à la piste d\u2019audit.');
      ask(q, function(){
        cibler('PUT','/conformite/'+enc(o.id),{exclue:!ex}).then(function(r){
        if(!r) return;
        logit((ex?'Réintégration':'Exclusion administrative')+' — '+o.name);
        notify('offre.ecartee', (ex?'Offre réintégrée — ':'Offre écartée — ')+o.name,
          ex ? ("L'offre de "+o.name+" est réintégrée à l'évaluation de la procédure "+REF()+".")
             : ("L'offre de "+o.name+" est écartée pour non-conformité administrative. Motif : "+(mis.length?mis.map(function(x){return x.label;}).join(' ; '):'décision du comité')+"."));
        save(); render();
        });
      }, (ex?'Réintégrer « ':'Écarter « ')+o.name+' » ?', ex?'Réintégrer':'Écarter');
    });
  });
  labelize(t);

  var c2=add(m,'div','card'); c2.style.marginTop='18px';
  add(c2,'div','panel-head','Signaux détectés');
  var b=add(c2,'div','pad');
  anomalies().forEach(function(a){
    var row=add(b,'div'); row.style.cssText='display:flex;gap:14px;padding:14px 0;border-top:1px solid var(--line-2);align-items:flex-start';
    var col = a.lvl==='red'?'var(--red)':(a.lvl==='amber'?'var(--amber-line)':'var(--violet)');
    var dot=add(row,'span',null, a.lvl==='info'?'i':'!');
    dot.style.cssText='width:22px;height:22px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;background:'+col;
    var d=add(row,'div');
    var tt=add(d,'div'); tt.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(tt,'strong',null,a.t); add(tt,'span','chip c-grey',a.who);
    add(d,'div','muted',a.d).style.marginTop='3px';
  });

  var n=add(m,'div','note');
  add(n,'strong',null,'Sur les offres étrangères. ');
  n.appendChild(document.createTextNode("Les signaux violets ne sont pas des reproches : ils rappellent qu'une offre hors zone se compare sur une base fiscale et douanière différente. Écarter un soumissionnaire étranger pour une pièce qu'on n'a jamais exigée dans le dossier d'appel d'offres est le meilleur moyen de perdre un recours."));
}
