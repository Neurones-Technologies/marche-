// Extrait les données de référence du prototype d'origine vers server/seed/seed.json
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(process.argv[2],'utf8');
const ctx={state:null,JSON,Date,Math,Number,String};vm.createContext(ctx);
vm.runInContext(src+`;this.__out={UEMOA_DEF,RATES_DEF,PERMS,INCOMPAT,ROLES:ROLES_DEF(),USERS:USERS_DEF,EVENTS,NOTIF_RULES:notifRulesDef(),OFFERS:SEED_OFFERS,META,DOC_DEFS,CRITERIA:SEED_CRITERIA,APPROVALS:SEED_APPROVALS,CDC:SEED_CDC}`,ctx);
fs.writeFileSync(process.argv[3],JSON.stringify(ctx.__out,null,1));
console.log(Object.keys(ctx.__out).map(k=>k+':'+(Array.isArray(ctx.__out[k])?ctx.__out[k].length:typeof ctx.__out[k])).join(' '));
