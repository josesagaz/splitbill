// One shared bill = one "meta" blob (total, service, currency)
// plus one blob per person, so friends typing at the same time
// never overwrite each other.
import { getStore } from "@netlify/blobs";

const CODE = /^[A-Z0-9]{5}$/;
const REUSE_AFTER_MS = 24 * 60 * 60 * 1000; // a code can be used again 24h after its bill started
const ID = /^[a-z0-9]{8,20}$/;
const CURRENCIES = ["GBP", "EUR", "USD"];
const MAX_PEOPLE = 40;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const cleanAmount = v => String(v ?? "").replace(/[^0-9.,+\/* ]/g, "").slice(0, 120);
const cleanInitials = v => String(v ?? "").toUpperCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 3);
const cleanTip = v => {
  const n = Math.round(Number(v) * 2) / 2;
  return Number.isFinite(n) ? Math.min(30, Math.max(0, n)) : 12.5;
};
const cleanMeta = m => ({
  total: cleanAmount(m?.total),
  tip: cleanTip(m?.tip ?? 12.5),
  currency: CURRENCIES.includes(m?.currency) ? m.currency : "GBP",
});

export default async req => {
  const store = getStore({ name: "bills", consistency: "strong" });

  if (req.method === "GET") {
    const code = new URL(req.url).searchParams.get("code") || "";
    if (!CODE.test(code)) return json({ error: "bad_code" }, 400);
    const meta = await store.get(`${code}/meta`, { type: "json" });
    if (!meta) return json({ error: "not_found" }, 404);
    const { blobs } = await store.list({ prefix: `${code}/people/` });
    const people = (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" }))))
      .filter(Boolean)
      .sort((a, b) => a.createdAt - b.createdAt);
    return json({ meta, people });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const code = String(body.code || "");
  if (!CODE.test(code)) return json({ error: "bad_code" }, 400);
  const metaKey = `${code}/meta`;

  if (body.action === "create") {
    const old = await store.get(metaKey, { type: "json" });
    if (old) {
      if (Date.now() - (old.createdAt || 0) < REUSE_AFTER_MS) return json({ error: "exists" }, 409);
      // yesterday's bill with the same code: clear it out and start fresh
      const { blobs } = await store.list({ prefix: `${code}/` });
      await Promise.all(blobs.map(b => store.delete(b.key)));
    }
    await store.setJSON(metaKey, { ...cleanMeta(body.meta), createdAt: Date.now() });
    return json({ ok: true });
  }

  const meta = await store.get(metaKey, { type: "json" });
  if (!meta) return json({ error: "not_found" }, 404);

  if (body.action === "meta") {
    await store.setJSON(metaKey, { ...cleanMeta(body.meta), createdAt: meta.createdAt });
    return json({ ok: true });
  }

  const id = String(body.id || "");
  if (!ID.test(id)) return json({ error: "bad_id" }, 400);
  const key = `${code}/people/${id}`;

  if (body.action === "person") {
    const existing = await store.get(key, { type: "json" });
    if (!existing) {
      const { blobs } = await store.list({ prefix: `${code}/people/` });
      if (blobs.length >= MAX_PEOPLE) return json({ error: "full" }, 409);
    }
    await store.setJSON(key, {
      id,
      initials: cleanInitials(body.initials),
      spent: cleanAmount(body.spent),
      createdAt: existing?.createdAt ?? Date.now(),
    });
    return json({ ok: true });
  }

  if (body.action === "remove") {
    await store.delete(key);
    return json({ ok: true });
  }

  return json({ error: "bad_action" }, 400);
};

export const config = { path: "/api/bill" };
