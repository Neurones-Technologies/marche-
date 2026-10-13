/* Marché+ — Image de la page de garde du dossier d'appel d'offres, propre à chaque achat : une photo libre de droits
   trouvée d'après l'objet (recherche Wikimedia Commons, mots-clés tirés de l'objet par l'IA quand elle est configurée),
   ou l'image de l'acheteur. Sans image, la page de garde reste sobre.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* Image du dossier : { src, credit } ou null. */
function imageDossier(c){
  var i=c && c.illustrationImage;
  return i && i.fichier ? { src:'/api/files/'+encodeURIComponent(i.fichier), credit:i.credit||'' } : null;
}

/* Pas d'image : une photo qui répond à l'objet est cherchée toute seule, une fois par objet (formulaire, dossier publié) ;
   le rédacteur la change ensuite. Retourne une promesse (vide si rien à faire). */
function lancerImageAuto(){
  var c=state.cdc, cle=state.procedure+'|'+String(c.objet||'').trim();
  UI.imgAuto=UI.imgAuto||{};
  if(imageDossier(c) || String(c.objet||'').trim().length<8 || !can('cdc.edit') || UI.imgAuto[cle]) return Promise.resolve();
  UI.imgAuto[cle]='en cours';
  return Promise.resolve(typeof flush==='function' ? flush() : null).then(function(){ return MP.api('POST',MP.url('/illustration/auto'),{}); })
    .then(function(){ UI.imgAuto[cle]='fait'; return relireEtat(); })
    .catch(function(){ UI.imgAuto[cle]='fait'; render(); });
}
/* Avant l'aperçu du dossier : si l'achat n'a pas d'image, une photo qui répond à l'objet est cherchée (sans bloquer si la banque ne répond pas). */
function assurerImageDossier(){
  if(imageDossier(state.cdc) || !can('cdc.edit') || String(state.cdc.objet||'').trim().length<8) return Promise.resolve();
  return Promise.resolve(typeof flush==='function' ? flush() : null).then(function(){ return MP.api('POST',MP.url('/illustration/auto'),{}); })
    .then(function(){ return relireEtat(); }).catch(function(){});
}

/* Bloc du formulaire (cahier des charges) : aperçu, choisir une photo, importer, retirer. */
function blocImageDossier(parent){
  var c=state.cdc, img=imageDossier(c);
  var w=add(parent,'div','img-dossier'); w.style.gridColumn='1/-1';
  add(w,'label',null,'Image de la page de garde');
  var cle=state.procedure+'|'+String(c.objet||'').trim();
  lancerImageAuto();
  var ligne=add(w,'div','img-dossier-ligne');
  if(img){
    var im=add(ligne,'img','img-dossier-apercu'); im.src=img.src; im.alt='Image de la page de garde';
  } else {
    var vide=add(ligne,'div','img-dossier-vide'); vide.textContent=UI.imgAuto && UI.imgAuto[cle]==='en cours' ? 'Recherche d’une photo…' : 'Aucune image';
  }
  var d=add(ligne,'div','img-dossier-texte');
  add(d,'div','muted', img ? img.credit : (UI.imgAuto && UI.imgAuto[cle]==='en cours' ? 'Une photo qui répond à l’objet est en cours de recherche…' : 'Aucune photo libre trouvée automatiquement : choisissez-en une, ou importez la vôtre. Sans image, la page de garde reste sobre.'));
  var act=add(d,'div'); act.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
  var go=add(act,'button','btn btn-ghost btn-sm', img?'Changer de photo':'Choisir une photo'); go.type='button'; fk(go,'img-choisir');
  go.addEventListener('click',function(){
    if(!String(c.objet||'').trim()){ toast('Renseignez d’abord l’objet du marché.'); return; }
    Promise.resolve(typeof flush==='function' ? flush() : null).then(ouvrirChoixImage);
  });
  var inp=el('input'); inp.type='file'; inp.accept='.jpg,.jpeg,.png'; inp.hidden=true; inp.setAttribute('aria-label','Importer une image'); act.appendChild(inp);
  var up=add(act,'button','btn btn-ghost btn-sm','Importer mon image'); up.type='button'; fk(up,'img-importer');
  up.addEventListener('click',function(){ inp.click(); });
  inp.addEventListener('change',function(){
    var f=inp.files&&inp.files[0]; if(!f) return;
    if(f.size>5*1024*1024){ toast('Image trop lourde (5 Mo au plus).'); return; }
    up.disabled=true; up.textContent='Envoi…';
    Promise.resolve(typeof flush==='function' ? flush() : null)
      .then(function(){ return MP.upload(MP.url('/illustration/televerser'), f); })
      .then(function(){ toast('Image enregistrée.'); return relireEtat(); })
      .catch(function(e){ toast(e.message||'Envoi impossible.'); up.disabled=false; up.textContent='Importer mon image'; });
  });
  if(img){
    var rm=add(act,'button','btn btn-ghost btn-sm','Retirer'); rm.type='button'; fk(rm,'img-retirer');
    rm.addEventListener('click',function(){
      MP.api('DELETE',MP.url('/illustration'),{}).then(function(){ toast('Image retirée.'); return relireEtat(); }).catch(function(e){ toast(e.message||'Retrait impossible.'); });
    });
  }
}

/* Fenêtre de choix : recherche de photos libres de droits, d'abord d'après l'objet de l'achat. */
function ouvrirChoixImage(){
  var etat={ q:'', chargement:true, erreur:null, resultats:[], requetes:[], traduit:false, choix:null };
  function chercher(q){
    etat.chargement=true; etat.erreur=null; etat.resultats=[]; dessinerFenetre();
    MP.api('GET',MP.url('/illustration/recherche')+(q?'?q='+encodeURIComponent(q):'')).then(function(r){
      etat.chargement=false; etat.resultats=r.resultats; etat.requetes=r.requetes; etat.traduit=r.traduit; if(!q) etat.q=r.requetes[0]||''; dessinerFenetre();
    }).catch(function(e){ etat.chargement=false; etat.erreur=e.message||'Recherche impossible.'; dessinerFenetre(); });
  }
  ouvrirFenetre('Choisir une photo pour la page de garde', function(c,p){
    var f=add(c,'div'); f.style.cssText='display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px';
    var w=add(f,'div'); w.style.flex='1 1 260px';
    add(w,'label',null,'Rechercher une photo (en anglais de préférence)').setAttribute('for','img-q');
    var q=add(w,'input'); q.type='search'; q.id='img-q'; q.value=etat.q; q.placeholder='ex. white pickup truck'; fk(q,'img-q');
    var b=add(f,'button','btn btn-primary','Rechercher'); b.type='button'; fk(b,'img-rech');
    function lancer(){ etat.q=q.value.trim(); chercher(etat.q); }
    b.addEventListener('click',lancer); q.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); lancer(); } });
    if(etat.requetes.length) add(c,'p','muted',(etat.traduit?'Recherches tirées de l’objet de l’achat : ':'Recherche : ')+etat.requetes.join(' · ')+'.');
    if(etat.chargement){ add(c,'p','muted','Recherche des photos…').setAttribute('role','status'); }
    else if(etat.erreur){ add(c,'div','warn',etat.erreur); }
    else if(!etat.resultats.length){ add(c,'p','muted','Aucune photo libre ne correspond : essayez d’autres mots, ou importez votre image.'); }
    var g=add(c,'div','img-grille');
    etat.resultats.forEach(function(r){
      var t=add(g,'button','img-vignette'+(etat.choix===r.titre?' on':'')); t.type='button'; fk(t,'img-'+r.titre.slice(5,25));
      var im=add(t,'img'); im.src=r.vignette; im.alt=r.titre.replace(/^File:/,'').replace(/\.\w+$/,''); im.loading='lazy';
      add(t,'span','img-credit',(r.auteur||'auteur inconnu')+' · '+r.licence);
      t.addEventListener('click',function(){
        etat.choix=r.titre; dessinerFenetre();
        MP.api('POST',MP.url('/illustration/commons'),{ titre:r.titre }).then(function(){ toast('Photo retenue pour la page de garde.'); fermerFenetre(); return relireEtat(); })
          .catch(function(e){ etat.choix=null; toast(e.message||'Photo refusée.'); dessinerFenetre(); });
      });
    });
    add(c,'p','muted','Photos libres de droits de Wikimedia Commons (domaine public, CC0 ou CC BY) : le crédit de l’auteur figure sous la photo dans le dossier.').style.marginTop='12px';
    add(p,'button','btn btn-ghost','Fermer').addEventListener('click',fermerFenetre);
  }, { large:true });
  chercher('');
}
