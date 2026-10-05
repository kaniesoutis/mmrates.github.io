import { kv } from '@vercel/kv';
import { getLiveGoldPrice, getLiveSilverPrice } from 'nepal-bullion-price'; // international spot -> estimate only
import { getRates } from '../lib/fene.js';

const cdf = z => {
  const a = Math.abs(z), t = 1 / (1 + .2316419 * a), d = .3989423 * Math.exp(-a * a / 2),
    p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

// Live move of the international-price estimate since the daily rate was set,
// turned into rise / flat / fall probabilities using past daily volatility.
async function one(metal, nep, live, snap) {
  const price = nep.price;
  const est = live.perTola.estimatedPrice;
  const key = `snap:${metal}:${nep.date}`;
  let base = await kv.get(key), fresh = false;
  if (base == null || snap) { await kv.set(key, est, { ex: 4 * 86400 }); base = est; fresh = true; }

  const h = (nep.history || []).map(x => x.price).filter(Boolean);
  const r = h.slice(1).map((v, i) => Math.log(v / h[i]));
  const sd = r.length > 4 ? Math.sqrt(r.reduce((a, x) => a + x * x, 0) / r.length) : 0.008;
  let ok = 0, n = 0; // baseline: "tomorrow moves the same way as today" over the history
  for (let i = 1; i < r.length; i++) if (r[i - 1] && r[i]) { n++; if (Math.sign(r[i - 1]) === Math.sign(r[i])) ok++; }

  const drift = est / base - 1, s = Math.max(sd * .7, .002), band = .25 * sd;
  const U = Math.round((1 - cdf((band - drift) / s)) * 100);
  let D = Math.round(cdf((-band - drift) / s) * 100);
  if (U + D > 100) D = 100 - U;
  return { ready: !fresh, pUp: U, pFlat: 100 - U - D, pDown: D, drift, estNow: est,
    range: [price * (1 - sd), price * (1 + sd)], hit: { ok, n } };
}

export default async function handler(req, res) {
  try {
    const snap = req.query.snap === '1';
    const [R, lg, ls] = await Promise.all([getRates(), getLiveGoldPrice(), getLiveSilverPrice()]);
    const [gold, silver] = await Promise.all([one('gold', R.gold, lg, snap), one('silver', R.silver, ls, snap)]);
    res.setHeader('Cache-Control', snap ? 'no-store' : 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ gold, silver, at: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
