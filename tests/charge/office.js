/* Parcours « bureau » : un agent interne se connecte, puis lit à répétition la liste des procédures, l'état complet
   de la procédure p1 (lecture coûteuse : toutes les clés pkv) et la liste des partenaires, avec des temps de pause.
   PROFILE fixe le profil de montée : baseline | load | stress | soak. */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import exec from 'k6/execution';

const BASE = __ENV.BASE || 'http://mp-charge-app:3000';
const PW = 'Marche+2026!';
const stateDur = new Trend('t_state', true);     // latence de GET /state (le point chaud)
const listDur = new Trend('t_procedures', true);

const SCENARIOS = {
  baseline: { executor: 'constant-vus', vus: 2, duration: '30s' },
  load:     { executor: 'ramping-vus', startVUs: 5, stages: [{ duration: '1m', target: 200 }, { duration: '2m', target: 200 }, { duration: '30s', target: 0 }], gracefulStop: '10s' },
  stress:   { executor: 'ramping-vus', startVUs: 10, stages: [{ duration: '30s', target: 100 }, { duration: '30s', target: 300 }, { duration: '30s', target: 500 }, { duration: '30s', target: 800 }, { duration: '45s', target: 1200 }, { duration: '20s', target: 0 }], gracefulStop: '10s' },
  soak:     { executor: 'ramping-vus', startVUs: 20, stages: [{ duration: '20s', target: 50 }, { duration: '8m', target: 50 }, { duration: '20s', target: 0 }], gracefulStop: '10s' },
};

export const options = {
  scenarios: { office: SCENARIOS[__ENV.PROFILE || 'baseline'] },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    't_state': ['p(95)<600'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

let TOKEN = null;                                     // mémorisé par VU (variable de module = portée VU)
function loginOnce() {
  const n = (exec.vu.idInTest - 1) % 60;             // 60 comptes internes réutilisés
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: `agent${n}@charge.test`, password: PW }), { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'login 200': (x) => x.status === 200 });
  if (r.cookies && r.cookies.mp_token) TOKEN = r.cookies.mp_token[0].value;
}
const P = () => ({ headers: { Cookie: 'mp_token=' + TOKEN } });  // k6 réinitialise le pot entre itérations : cookie explicite

export default function () {
  if (!TOKEN) loginOnce();
  const r1 = http.get(`${BASE}/api/procedures`, P());
  listDur.add(r1.timings.duration);
  check(r1, { 'procedures 2xx': (x) => x.status === 200 });

  const r2 = http.get(`${BASE}/api/procedures/p1/state`, P());
  stateDur.add(r2.timings.duration);
  check(r2, { 'state 2xx': (x) => x.status === 200 });

  http.get(`${BASE}/api/partenaires`, P());
  sleep(1 + Math.random() * 2);                         // temps de réflexion 1-3 s
}
