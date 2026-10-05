import { getRates } from '../lib/fene.js';

export default async function handler(req, res) {
  try {
    const r = await getRates();
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    res.status(200).json({ ...r, updatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
