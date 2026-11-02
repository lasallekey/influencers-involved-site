// Fills a RUNNING local preview (npm run dev) with 20 synthetic Pioneers so the "Our Pioneer Community" dashboard shows.
// Synthetic data only; the preview database lives in memory and disappears when the server stops.
//   node scripts/seed-preview.mjs [http://127.0.0.1:8787]
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const CH = ['Feeding America', 'American Red Cross', 'charity: water', 'UNICEF', 'Local Food Pantry', null];
let made = 0;
for (let i = 1; i <= 20; i++) {
  const c = CH[i % CH.length];
  const r = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-client-ip': `10.8.0.${i}` }, body: JSON.stringify({
    idempotency_key: `seed-preview-${String(i).padStart(10, '0')}-x`, consent_version: '2026-10-30', creator_name: `Preview Creator ${i}`, email: `preview${i}@creatormail.dev`,
    country: ['US', 'CA', 'GB', 'KR', 'DE', 'BR'][i % 6], pledge_date: new Date().toISOString().slice(0, 10), charity_status: c ? 'selected' : 'undecided', charity: c || undefined,
    pledge_confirmed: true, certificate_ack: true, privacy_preference: 'anonymous', general_email_opt_in: false, collaboration_interest: 'Not now', collaboration_types: [], collab_contact_opt_in: false, ii_extra_note: '',
    accounts: [{ platform: ['YouTube', 'Instagram', 'TikTok', 'Twitch'][i % 4], handle: '@preview' + i, public_display_permission: false }] }) });
  if (r.status === 201) made++;
}
console.log(`${made}/20 synthetic Pioneers created at ${base}`);
