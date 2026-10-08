/* Parcours « dépôt avant échéance » (spike) : chaque itération = un soumissionnaire distinct qui se connecte,
   téléverse ses 4 pièces (registre, fiscal, cnps, caution) puis dépose son offre. Rafale d'écritures concurrentes
   (SQLite à écrivain unique). N itérations réparties sur VUS VU concurrentes. */
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';

const BASE = __ENV.BASE || 'http://mp-charge-app:3000';
const PW = 'Marche+2026!';
const VUS = Number(__ENV.VUS || 300);
const ITER = Number(__ENV.ITER || 600);
const depotDur = new Trend('t_depot', true);     // POST /offers (transaction d'écriture)
const uploadDur = new Trend('t_upload', true);
const deposes = new Counter('offres_deposees');

export const options = {
  scenarios: { spike: { executor: 'shared-iterations', vus: VUS, iterations: ITER, maxDuration: '5m' } },
  thresholds: { http_req_failed: ['rate<0.02'], 't_depot': ['p(95)<1500'] },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};
const PDF = '%PDF-1.4\n% pièce de charge\n';

export default function () {
  const n = exec.scenario.iterationInTest;          // compte unique par itération (soum0..soumN)
  const lg = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: `soum${n}@charge.test`, password: PW }), { headers: { 'Content-Type': 'application/json' } });
  if (!check(lg, { 'login 200': (x) => x.status === 200 })) return;
  const TOKEN = (lg.cookies && lg.cookies.mp_token) ? lg.cookies.mp_token[0].value : '';
  const CK = 'mp_token=' + TOKEN;

  const hdr = (name) => ({ headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': name, Cookie: CK } });
  let okPieces = true;
  for (const [doc, name, q] of [['registre', 'registre.pdf', ''], ['fiscal', 'fiscal.pdf', '&expire=2099-12-31'], ['cnps', 'cnps.pdf', '&expire=2099-12-31'], ['caution', 'caution.pdf', '']]) {
    const u = http.post(`${BASE}/api/procedures/p1/files?doc=${doc}${q}`, PDF, hdr(name));
    uploadDur.add(u.timings.duration);
    if (u.status !== 201) okPieces = false;
  }
  check(null, { 'pièces déposées': () => okPieces });

  const offre = { name: `Soumission ${n}`, iso: 'CI', devise: 'XOF', montant: 90000000 + n, delai: 90, garantie: 24, refsCount: 4, lots: ['l1', 'l2'] };
  const d = http.post(`${BASE}/api/procedures/p1/offers`, JSON.stringify(offre), { headers: { 'Content-Type': 'application/json', Cookie: CK } });
  depotDur.add(d.timings.duration);
  if (check(d, { 'dépôt 201': (x) => x.status === 201 })) deposes.add(1);
  else if (d.status !== 201 && exec.scenario.iterationInTest < 5) console.log('dépôt ' + d.status + ' : ' + d.body);
}
