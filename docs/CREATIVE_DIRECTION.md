# Creative direction (agreed summary — read this instead of the external references)

**Principle:** less explanation, more inspiration, connection and participation. II should feel like a welcoming movement of creators, not an organization handing out an information package. Source: owner's design addendum (30 Oct 2026) + brief. The 18-tab workbook and `CLAUDE.md` stay authoritative for functionality, privacy, security and operations. Nothing here changes the seven pages, the pledge model, registration, consents, certificates or the Worker + D1 backend.

## Voice
- Talk to people: "you", "your", "we". Short headline, then one or two plain sentences. No jargon, no repeated mission statements, no over-promising.
- Details live where they belong (Challenge page, form help, Transparency, Privacy) — never pushed into the emotional story, never removed.
- Be concrete about what participating means: pledge 1% of creator income, give it **directly** to a charity you choose, invite others if you like. Avoid generic motivational slogans.

## Non-negotiable honesty
- II never appears to collect, hold, redistribute or verify a creator's 1%. Gifts to II (Zeffy) fund II's work and are described as separate.
- Never imply campaigns, sponsor programs, charity partners or influencers are already active. Corporate/charity routes say "talk to us" and go to `/contact/`.
- No fabricated testimonials, partners, logos, Pioneer names/counts, impact statistics, or "real people" imagery. Illustrations are conceptual and never presented as Pioneers, donors, partners or beneficiaries. Synthetic/test counts never appear in public content.
- Causes/campaigns section: omitted until real, verified campaigns exist.

## Visual identity
- Logo, blue `#005eca`, navy `#012f70`, leaf green `#7bdc0a`, white. Bold blue hero fields with white type; navy for text; green for the primary action and small bursts of energy.
- Type: Bricolage Grotesque (display, all pages) and Source Sans 3 (text). Both self-hosted (OFL), no third-party requests.
- People first: original flat illustrations of diverse, smiling people (kit of 6 busts + headphones in `src/pages/home.html`, classes `.pa`–`.ph` in `src/static/home.css`). Avoid card grids, abstract diagrams, gradients, glass, decorative animation. One orchestrated motion moment (hero entrance); respects `prefers-reduced-motion`.

## Homepage narrative (4 short sections + closing)
1. **Hero** — "Turn your influence into impact." One sentence that states the 1% challenge, one primary action ("Become a Pioneer"), a quiet "See how it works" link, and a illustrated creator sharing a pledge with a smiling crowd.
2. **How it works** — three illustrated steps: pledge and join → give directly → share and invite. Link to the Challenge page for detail.
3. **Find your place** — four rows (not boxes), mapped only to existing pages: creators → `/challenge/#join`; companies and charities → `/contact/`; donors → `/donate/`.
4. **Trust strip** — Illinois nonprofit, 501(c)(3), EIN, "we never collect your 1%", link to Transparency.
5. **Closing invitation** — "Be one of the first Pioneers." + the same single action.

## Interior pages (same language, different stories)
Shared layer: `src/static/movement.css` (people kit, buttons, hero, bands, steps, rows, checklist) + `src/partials/people.html` (SVG symbols, included with `{{people}}`). Each page has a blue hero with its own original scene, then its own compositions. Do not copy the homepage sections; reuse the kit. Animate only an outer `<g class="prop">`; put any tilt on an inner group, because a CSS animation's final `transform` overrides an SVG `transform` attribute on the same element.
- **Challenge:** hero = creator holding a Pioneer certificate; illustrated three-step journey; "after you join" rows; green "A pledge, not a payment" band; the registration form is deliberately calm (white, standard fields; categorized charity list with search and a prominent "not chosen yet" option; optional profile URL). The "Our Pioneer Community" dashboard (four figures in one row) appears only after 20 eligible registrations; see `docs/REGISTRY.md`.
- **About:** "A movement of creators who give"; emblem over a growing crowd; one-to-many ripple of avatars; plain legal facts (name, status, EIN, address, contact). **No individual leadership names, titles, initials or bios are published**; closing invitation.
- **Transparency:** speech bubble with three checks; two full-bleed halves that make the key distinction visible (your 1% → your charity vs gifts → II); friendly checklist of commitments.
- **Donate:** person holding a big heart; prominent Zeffy buttons (hero and after "what a gift helps us do"); no impact claims; green band separating a creator's pledge from gifts to II; approved international notice verbatim; no PayPal.
- **Contact:** "Let's talk." with waving people; the homepage's "Find your place" rows as mailto links with a subject per audience (creators, charities, companies, funders, other), one inbox.
- **Privacy:** shorter hero (shield), a three-line plain summary, and a sticky table of contents; every original disclosure kept in full.
Rules that keep scenes readable: people in front of the blue hero use `pi`/`pj`/`pc`/`pe`/`ph` (never the blue-topped `pa`/`pg`, which vanish into the background); illustrated characters are never presented as real Pioneers, donors, partners or beneficiaries.

## Assets: source and rights
| Asset | Source / license |
|---|---|
| II logos (horizontal, vertical, emblem) | Owner-supplied, approved brand files |
| People illustrations, hearts, phone mock-ups | Original SVG drawn for this project; owned by II, no third-party assets |
| Bricolage Grotesque, Source Sans 3 | SIL Open Font License 1.1 (license files in `src/static/fonts/`) |
| Photography | **None yet** — future improvement: real, consented photos of II-approved creators or licensed editorial images, always labeled/used as illustrative |

## Reference research notes
The four primary references (charity: water, Tiltify Impact, GlobalGiving, Pledge) were **not reachable from the cloud session** (outside the allowed network domains), so the techniques below come from the owner's addendum, not a first-hand review: charity: water — human emotional storytelling and short purpose-first invitations; Tiltify Impact — creator energy and collaboration (without implying II has active campaigns); GlobalGiving — approachable pathways and trust (without showing projects II does not have); Pledge — simple visitor pathways and quickly understood actions. Nothing was copied.

## Status
Homepage approved by the owner and applied site-wide (interior pages harmonized, footer tagline "Turn your influence into impact."). The design is frozen: only functional, responsive, accessibility or consistency fixes.
