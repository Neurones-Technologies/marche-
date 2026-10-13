/* Habillage des courriels : tout message de la plateforme part avec une mise en page à l'image de l'organisation
   (bandeau à sa couleur et à ses initiales, titre, texte, bouton d'action, pied de page), et son équivalent en texte
   brut pour les messageries qui n'affichent pas le HTML. Mise en page à base de tableaux et de styles en ligne, la seule
   que les messageries respectent (Outlook compris) ; aucune image distante, aucun script. */
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const SEP_PIED = '\n\n—\n'; // les notifications portent déjà leur mention d'envoi automatique : le modèle la remplace par son pied de page

const couleur = (org) => (/^#[0-9a-f]{6}$/i.test((org || {}).accent || '') ? org.accent : '#B4471B');
/** Teinte lisible (blanc ou encre) sur la couleur d'accent. */
function surAccent(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1F2430' : '#FFFFFF';
}
const initiales = (org) => String((org && (org.initiales || org.nom)) || 'M+').replace(/[^\p{L}\p{N}+]/gu, '').slice(0, 3).toUpperCase() || 'M+';

/** Paragraphe : retours à la ligne conservés, adresses web rendues cliquables. */
function paragraphe(t) {
  const lien = esc(t).replace(/https?:\/\/[^\s&<>"']+(?:&amp;[^\s&<>"']*)*/g, (u) => `<a href="${u}" style="color:inherit;text-decoration:underline;word-break:break-all">${u}</a>`);
  return lien.replace(/\n/g, '<br>');
}

/**
 * { objet, corps, action?: { libelle, url }, org? } → { objet, texte, html }.
 * Objet « [AO-2026-014] Titre » : la référence devient une étiquette au-dessus du titre. Sans action explicite, la
 * première adresse web du texte devient le bouton.
 */
function habiller({ objet, corps, action, org }) {
  const o = org || {}, accent = couleur(o), encre = surAccent(accent);
  const m = /^\[([^\]]{1,60})\]\s*(.+)$/.exec(String(objet || '')), etiquette = m ? m[1] : '', titre = m ? m[2] : String(objet || '');
  const brut = String(corps || ''), coupe = brut.indexOf(SEP_PIED), utile = (coupe >= 0 ? brut.slice(0, coupe) : brut).trim();
  const url = action && action.url ? action.url : ((utile.match(URL_RE) || [])[0] || '');
  const libelle = (action && action.libelle) || 'Ouvrir dans Marché+';
  const nom = o.nom || 'Marché+';
  const paragraphes = utile.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const texte = utile + '\n\n—\n' + nom + ' — plateforme Marché+\nMessage automatique : merci de ne pas y répondre.';

  const bouton = url ? `
        <tr><td style="padding:8px 36px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td bgcolor="${accent}" style="border-radius:8px"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 'Segoe UI',Arial,sans-serif;color:${encre};text-decoration:none;border-radius:8px">${esc(libelle)}</a></td>
          </tr></table>
        </td></tr>` : '';
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EC">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(paragraphes[0] || titre).slice(0, 110)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F1EC"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;color:#1F2430">
    <tr><td bgcolor="${accent}" style="padding:22px 36px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="46" valign="middle"><div style="width:42px;height:42px;line-height:42px;border-radius:10px;background:rgba(255,255,255,.22);color:${encre};font:700 15px/42px 'Segoe UI',Arial,sans-serif;text-align:center">${esc(initiales(o))}</div></td>
        <td valign="middle" style="padding-left:12px;font:600 16px/1.2 'Segoe UI',Arial,sans-serif;color:${encre}">${esc(nom)}</td>
        <td align="right" valign="middle" style="font:700 13px/1 'Segoe UI',Arial,sans-serif;letter-spacing:.06em;color:${encre};opacity:.85">MARCHÉ+</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px 36px 8px">
      ${etiquette ? `<div style="display:inline-block;margin-bottom:12px;padding:4px 10px;border-radius:999px;background:#F4F1EC;font:600 12px/1 'Segoe UI',Arial,sans-serif;color:#5C6371">${esc(etiquette)}</div>` : ''}
      <h1 style="margin:0;font:700 22px/1.3 'Segoe UI',Arial,sans-serif;color:#1F2430">${esc(titre)}</h1>
    </td></tr>
    <tr><td style="padding:12px 36px 20px;font:400 15px/1.6 'Segoe UI',Arial,sans-serif;color:#2B303B">
      ${paragraphes.map((p) => `<p style="margin:0 0 14px">${paragraphe(p)}</p>`).join('\n      ')}
    </td></tr>${bouton}
    <tr><td style="padding:18px 36px 26px;border-top:1px solid #ECE7DF;font:400 12px/1.6 'Segoe UI',Arial,sans-serif;color:#7A808C">
      Ce message vous est envoyé automatiquement par la plateforme Marché+ au nom de ${esc(nom)}. Merci de ne pas y répondre.<br>
      Marché+ — gestion des appels d’offres, des achats et des partenaires.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
  return { objet: String(objet || ''), texte, html };
}

module.exports = { habiller };
