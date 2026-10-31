// Charity names: a curated, categorized convenience list plus free-text entries, normalized so the same
// charity is counted once. The list is not an endorsement or an exclusive eligibility list.
import catalogue from '../../shared/charities.json' with { type: 'json' };

/** Lowercase, strip accents/punctuation, "&"→"and", drop a leading "the". Stable key for counting. */
export function charityKey(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const BY_KEY = new Map();
for (const cat of catalogue) {
  for (const c of cat.charities) {
    BY_KEY.set(charityKey(c.name), c.name);
    for (const a of c.aliases || []) BY_KEY.set(charityKey(a), c.name);
  }
}
export const CATALOGUE_SIZE = BY_KEY.size;

// Control characters and bidi overrides are replaced by spaces (built from escapes so the file stays plain ASCII).
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069]', 'g');
const PLACEHOLDERS = new Set(['none', 'na', 'n a', 'undecided', 'not sure', 'unsure', 'unknown', 'tbd', 'idk', 'later', 'i dont know', 'dont know', 'not decided', 'not yet', 'no idea', 'any', 'anything', 'other', 'test']);

/** Returns { name, key, listed } or { error }. Never throws. */
export function resolveCharity(input) {
  const raw = typeof input === 'string' ? input.replace(CTRL, ' ').replace(/\s+/g, ' ').trim() : '';
  if (raw.length < 2 || raw.length > 120) return { error: 'Enter the name of your charity (2 to 120 characters), or choose “I haven’t chosen a charity yet”.' };
  if (/:\/\/|www\.|@/.test(raw)) return { error: 'Please enter the charity’s name, not a web or email address.' };
  const key = charityKey(raw);
  if (!key) return { error: 'Please enter the charity’s name.' };
  const canonical = BY_KEY.get(key); // known names and aliases (even very short ones like "4-H") resolve first
  if (canonical) return { name: canonical, key: charityKey(canonical), listed: true };
  const letters = (raw.match(/\p{L}/gu) || []).length;
  if (letters < 2 || letters / raw.length < 0.4) return { error: 'Please enter the charity’s name.' };
  if (PLACEHOLDERS.has(key)) return { error: 'If you haven’t chosen yet, pick “I haven’t chosen a charity yet” instead. It’s fine to decide later.' };
  return { name: raw, key, listed: false };
}
