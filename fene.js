import { kv } from '@vercel/kv';

// One-time starting history: real FENEGOSIDA daily rates (per tola), Sep 14 - Oct 4 2026.
const G = { '09-14':301000,'09-15':300100,'09-16':301800,'09-17':299500,'09-18':303100,'09-20':305200,'09-21':303900,'09-22':302200,'09-23':302300,'09-24':299100,'09-25':298600,'09-27':299300,'09-28':294300,'09-29':290500,'09-30':293300,'10-01':293300,'10-02':294800,'10-04':291900 };
const S = { '09-14':4620,'09-15':4600,'09-16':4685,'09-17':4625,'09-18':4775,'09-20':4795,'09-21':4805,'09-22':4775,'09-23':4815,'09-24':4650,'09-25':4620,'09-27':4655,'09-28':4510,'09-29':4395,'09-30':4425,'10-01':4425,'10-02':4450,'10-04':4390 };
const seed = o => Object.fromEntries(Object.entries(o).map(([k, v]) => ['2026-' + k, v]));
const SEED = { gold: seed(G), silver: seed(S) };

const num = s => Number(String(s).replace(/,/g, ''));

// Reads the two per-tola rates out of fenegosida.org's page text.
export function parse(html) {
  const txt = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const get = (re, k = 1, step = 1) => { const m = txt.match(re); return m ? Math.round(num(m[1]) * k / step) * step : null; };
  // 1) "FINE GOLD (9999) per 1 tola Rs 300000"  2) header ticker "Gold 0.99% Nrs 250,255" (per 10 g)
  const gold = get(/FINE GOLD.{0,40}?1\s*tola\D{0,12}(\d[\d,]*)/i) ?? get(/Gold\s*[\d.]+%\s*Nrs\s*(\d[\d,]*)/i, 1.1664, 100);
  const silver = get(/SILVER.{0,40}?1\s*tola\D{0,12}(\d[\d,]*)/i) ?? get(/Silver\s*[\d.]+%\s*Nrs\s*(\d[\d,]*)/i, 1.1664, 5);
  if (!gold || !silver) throw new Error('Could not find gold/silver rates in fenegosida.org page. Page text starts: ' + txt.slice(0, 400));
  return { gold, silver };
}

export async function getRates() {
  const r = await fetch('https://www.fenegosida.org/', { headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html' } });
  if (!r.ok) throw new Error('fenegosida.org returned HTTP ' + r.status);
  const { gold, silver } = parse(await r.text());
  const day = new Date(Date.now() + 20700000); // Nepal time = UTC+5:45
  const date = day.toISOString().slice(0, 10), saturday = day.getUTCDay() === 6;
  const out = {};
  for (const [m, price] of [['gold', gold], ['silver', silver]]) {
    const key = 'hist:' + m;
    let h = await kv.hgetall(key);
    if (!h) { await kv.hset(key, SEED[m]); h = { ...SEED[m] }; }
    if (!saturday) { await kv.hset(key, { [date]: price }); h[date] = price; }
    const history = Object.keys(h).sort().map(d => ({ date: d, price: Number(h[d]) }));
    out[m] = { price, prev: history.length > 1 ? history[history.length - 2].price : null,
      history, date: history[history.length - 1].date };
  }
  return out;
}
