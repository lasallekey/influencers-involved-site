# Pioneer Registry: counting, visibility and charity rules

Single source of truth for what the public dashboard counts and when it appears. The Worker uses one predicate for every public number and for the visibility threshold (`worker/src/index.js`: `ELIGIBLE`, `REGISTRY_MIN`).

## Who counts (eligible registration)
A registration is **eligible** only if **all** of these are true:
1. `registration_status = 'Active'`. Withdrawn registrations never count.
2. `is_test = 0`. Automated or synthetic registrations never count (below).
3. It is a real stored registration: one person per email address (a partial unique index allows one *active* registration per address).

Not required: email verification, public listing, or any named charity. Anonymous and unverified Pioneers **do** count (they are people who made a pledge); they are simply never identified.

### What is flagged as a test registration
Set automatically at registration time from the email address, never from a client flag:
- reserved test domains: `*.test`, `*.invalid`, `*.example`, `*.localhost`, `example.com/.org/.net`;
- addresses starting `smoke+` (the automated smoke test) or containing `+test` / `+smoke` (so staff and the owner can test with a real mailbox such as `name+test1@gmail.com`, receive the verification email, and never move the public numbers);
- any extra domains listed in the optional Worker variable `TEST_EMAIL_DOMAINS` (comma-separated).
Records can also be flagged or unflagged later by an administrator (`worker/admin-queries.sql`, recipes 6 to 7). Tests, demos and the e2e suite never use real domains for genuine seeds.

## When the public registry appears: exactly 20
Until there are **20 eligible registrations**, the whole public registry is hidden:
- `GET /api/stats` returns exactly `{"visible":false}` (no counts, no zero state) and `GET /api/pioneers` returns `{"visible":false,"pioneers":[]}`.
- The Challenge page shows no dashboard, counter, empty state or listing, and the homepage never shows a counter.
- Registration and certificates work normally.
At 20 or more, the "Our Pioneer Community" dashboard appears automatically. If withdrawals bring the number below 20 it hides again; the next eligible registration restores it. Responses are cached for 60 seconds, so changes can take up to a minute to show. There are no artificial numbers.

## The four figures (in this order)
| Label | Meaning |
|---|---|
| Pioneers Registered | eligible registrations (people) |
| Social Accounts | distinct *platform + normalized handle* across eligible registrations (lowercase, leading `@` removed), so the same account listed twice, or by two people, counts once |
| Charities Selected | distinct charities named in pledges, after normalization (below). Registrations that have not chosen a charity yet are excluded. This is not a count of donations or verified recipients |
| Countries Represented | distinct ISO country codes |

Below the figures, "Pioneers who chose to be listed" shows only verified, publicly opted-in Pioneers and only the accounts they approved. An account with no profile URL appears as plain text (`Platform · handle`), never as a link built from the handle.

## Charities
- **Catalogue:** `shared/charities.json`: 101 names in 9 categories, with aliases (for example MSF, ACLU, "Red Cross"). It feeds the selector and the Worker's normalizer. It is a convenience list: no ratings, badges or claims of vetting, and no affiliation with the research sources used to assemble it (Charity Navigator, CharityWatch, GiveWell). Add a name by editing the JSON; `worker/test/catalogue.test.js` guards duplicates and alias collisions.
- **Selector:** native `<select>` grouped by category with a search box. The first two options after the placeholder are always **"I haven't chosen a charity yet — I'll decide later."** and **"Another charity — let me enter its name."**
- **Normalization:** lowercase, accents and punctuation removed, "&" = "and", a leading "the" ignored, then aliases mapped to the canonical name. "feeding america", "Feeding America!" and "The Red Cross"/"American Red Cross" each count once. Typed names must contain letters and may not be web/email addresses or placeholders such as "undecided".
- **Not chosen yet:** stored as `charity_status = 'undecided'` with no name (`selected_charity = ''`, `charity_key = NULL`). It is never displayed as a charity and never counted. The certificate then reads "for pledging 1% of creator income to a charity they will choose".
- **Choosing later (no portal):** the success page tells the person to email grants@influencersinvolved.org with their Pioneer ID. An administrator updates the record with recipe 5 in `worker/admin-queries.sql`, which sets the name and `charity_status = 'selected'`.

## Social profile fields
Platform and handle/channel are required. **Profile URL is optional**: validated (must be a full `https://` link, no credentials) only when supplied, stored as NULL otherwise, and never generated from a handle. Public-listing permission rules are unchanged (public choice + verified email + per-account approval).

## Deferred
No questions about income, monthly or annual giving, or amounts; no "Total Raised" metric.
