-- Authorized admin recipes. Run in Cloudflare dashboard → Workers & Pages → D1 → ii-pioneer-registry → Console,
-- or:  npx wrangler d1 execute ii-pioneer-registry --remote --file worker/admin-queries.sql   (one statement at a time is easiest)
-- Export to CSV:  npx wrangler d1 execute ii-pioneer-registry --remote --json --command "<query>"   (or use "Export" in the dashboard)
-- Never paste results into public places (GitHub issues, PRs, chat). They contain private email addresses.

-- 1. Contactable collaborators: verified, active, and explicitly opted in to collaboration email.
SELECT pioneer_id, creator_name, private_email, collaboration_interest, collaboration_types
FROM pioneers
WHERE registration_status = 'Active' AND email_verification_status = 'Verified' AND collab_contact_opt_in = 1
ORDER BY submitted_at;
-- ...only those interested in fundraising (swap 'fundraising' for 'content' or 'awareness'):
--   AND collaboration_types LIKE '%"fundraising"%'

-- 2. News/program-update subscribers: verified, active, opted in.
SELECT pioneer_id, creator_name, private_email, general_opt_in_at
FROM pioneers
WHERE registration_status = 'Active' AND email_verification_status = 'Verified' AND general_email_opt_in = 1;

-- 3. Verification emails that still need attention (pending, not recently resent).
SELECT p.pioneer_id, p.private_email, MAX(v.created_at) AS last_link, v.send_status
FROM pioneers p JOIN email_verifications v ON v.pioneer_id = p.pioneer_id
WHERE p.registration_status = 'Active' AND p.email_verification_status = 'Pending'
GROUP BY p.pioneer_id HAVING last_link < datetime('now', '-2 days');

-- 4. Registry totals (what the public site is allowed to show, plus raw counts for staff).
SELECT (SELECT COUNT(*) FROM pioneers WHERE registration_status='Active') AS pioneers,
       (SELECT COUNT(*) FROM social_accounts s JOIN pioneers p ON p.pioneer_id=s.pioneer_id WHERE p.registration_status='Active') AS accounts,
       (SELECT COUNT(*) FROM pioneers WHERE registration_status='Active' AND email_verification_status='Verified') AS verified,
       (SELECT COUNT(*) FROM pioneers WHERE registration_status='Active' AND privacy_preference='anonymous') AS anonymous;

-- 5. Everything held about one person (for an access / correction request). Replace the email.
SELECT * FROM pioneers WHERE private_email = 'person@example.com';
SELECT s.* FROM social_accounts s JOIN pioneers p ON p.pioneer_id = s.pioneer_id WHERE p.private_email = 'person@example.com';

-- 5. Set or change a Pioneer's charity (someone who chose "not yet", or who asked to change). Check the Pioneer ID first.
--   UPDATE pioneers SET selected_charity='Feeding America', charity_status='selected', charity_key='feeding america' WHERE pioneer_id='II-XXXX-XXXX';
--   (charity_key = lowercase name, punctuation removed, "&" -> "and", no leading "the"; see docs/REGISTRY.md.) People who have not chosen yet:
SELECT pioneer_id, creator_name, private_email, submitted_at FROM pioneers WHERE charity_status='undecided' AND registration_status='Active' AND is_test=0 ORDER BY submitted_at;

-- 6. Registry visibility check: how many registrations are eligible (the public dashboard appears at 20).
SELECT COUNT(*) AS eligible, (COUNT(*) >= 20) AS dashboard_visible FROM pioneers WHERE registration_status='Active' AND is_test=0;

-- 7. Flag or unflag a test registration (flagged records never count). Own-mailbox tests: use name+test1@... addresses.
--   UPDATE pioneers SET is_test=1 WHERE private_email='person@example.com';
--   UPDATE pioneers SET is_test=0 WHERE private_email='person@example.com';
SELECT pioneer_id, private_email, submitted_at FROM pioneers WHERE is_test=1 ORDER BY submitted_at DESC LIMIT 50;

-- ── Privacy requests (run only after confirming the requester controls the address) ──
-- Withdraw a registration: removes them from counts and public listing, stops optional email, frees the address.
--   UPDATE pioneers SET registration_status='Withdrawn', general_email_opt_in=0, collab_contact_opt_in=0, optional_withdrawn_at=datetime('now') WHERE private_email='person@example.com';
-- Erase completely (cascades to accounts and verification rows):
--   DELETE FROM pioneers WHERE private_email='person@example.com';
-- Correct a charity or name:
--   UPDATE pioneers SET selected_charity='New Charity' WHERE pioneer_id='II-XXXX-XXXX';
