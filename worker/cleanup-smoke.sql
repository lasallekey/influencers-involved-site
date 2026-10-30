-- Removes only the automated smoke-test records (synthetic addresses smoke+...@example.invalid).
DELETE FROM social_accounts WHERE pioneer_id IN (SELECT pioneer_id FROM pioneers WHERE private_email LIKE 'smoke+%@example.invalid');
DELETE FROM email_verifications WHERE pioneer_id IN (SELECT pioneer_id FROM pioneers WHERE private_email LIKE 'smoke+%@example.invalid');
DELETE FROM pioneers WHERE private_email LIKE 'smoke+%@example.invalid';
