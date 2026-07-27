const SPREADSHEET_ID = '1F6iRlQ4a02JZiAR_hXqjD2E3zFp1UCcDPojcS-53FDo';
const PRIVATE_SHEET = 'Pioneers Private';
const SITE_URL = 'https://influencersinvolved.org';
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwm4mtlV4JgX4ou0WU1Gibvk9DbDVOQuRIlwstQ3im9ojynxNddKKqUetdSvBVNxMbpAA/exec';
const SENDER_ALIAS = 'grants@influencersinvolved.org';
const CONSENT_VERSION = '2026-07-26-v1';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const p = e && e.parameter ? e.parameter : {};
    const required = ['pledgeId', 'displayName', 'profileUrl', 'platform', 'email', 'cause', 'pledgeDate', 'publicDisplayPreference', 'publicListingConsent', 'nextPhaseContactConsent'];
    const missing = required.filter(key => !String(p[key] || '').trim());
    if (missing.length) return textResponse('Missing required fields: ' + missing.join(', '));
    if (!isValidEmail(p.email)) return textResponse('Invalid email address.');
    if (!/^https:\/\//i.test(String(p.profileUrl))) return textResponse('Profile URL must begin with https://');

    assertOrganizationalSenderAvailable();

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PRIVATE_SHEET);
    if (!sheet) throw new Error('Registry sheet not found.');
    if (findRowByValue(sheet, 1, p.pledgeId) > 0) return textResponse('Duplicate pledge ID.');

    const now = new Date().toISOString();
    const token = Utilities.getUuid();
    const pledgeStatement = 'I pledge 1% of my creator income to a cause I believe in.';
    const row = [
      safeCell(p.pledgeId),
      now,
      'Pledged',
      safeCell(p.publicDisplayPreference),
      safeCell(p.displayName),
      safeCell(normalizeHandle(p.handle)),
      safeCell(p.profileUrl),
      safeCell(p.platform),
      safeCell(String(p.email).toLowerCase()),
      yesNo(p.generalContactConsent),
      yesNo(p.nextPhaseContactConsent),
      yesNo(p.publicListingConsent),
      safeCell(p.country),
      safeCell(p.region),
      safeCell(p.audienceBand),
      safeCell(p.cause),
      safeCell(p.pledgeDate),
      pledgeStatement,
      'Not submitted',
      '',
      '',
      '',
      'Website Pioneer Form',
      now,
      'No',
      now,
      token,
      '',
      CONSENT_VERSION,
      safeCell(p.referralSource || p.utmSource || 'Direct')
    ];
    sheet.appendRow(row);
    sendVerificationEmail(String(p.email).toLowerCase(), p.displayName, token, p.pledgeId);
    return textResponse('Pledge retained. Verification email sent.');
  } catch (error) {
    console.error(error);
    return textResponse('Submission error. Please try again.');
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'health').toLowerCase();
  if (action === 'verify') return verifyEmail(e.parameter.token);
  if (action === 'stats') return statsResponse(e);
  return ContentService.createTextOutput('II Pioneer Registry service is active.');
}

function verifyEmail(token) {
  if (!token) return verificationPage(false, 'The verification link is incomplete.');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PRIVATE_SHEET);
  const row = findRowByValue(sheet, 27, token);
  if (row < 2) return verificationPage(false, 'This verification link is invalid or expired.');

  const statusCell = sheet.getRange(row, 3);
  const current = String(statusCell.getValue());
  if (current !== 'Verified Pioneer' && current !== 'Proof Submitted' && current !== 'Withdrawn') statusCell.setValue('Email Verified');
  sheet.getRange(row, 28).setValue(new Date().toISOString());
  sheet.getRange(row, 24).setValue(new Date().toISOString());
  return verificationPage(true, 'Your Pioneer email has been verified. Your place in the registry is confirmed.');
}

function statsResponse(e) {
  const data = buildPublicStats();
  const callback = sanitizeCallback(e && e.parameter ? e.parameter.callback : '');
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildPublicStats() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PRIVATE_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return emptyStats();
  const h = headerMap(values[0]);
  const platformSet = new Set();
  const countrySet = new Set();
  const pioneers = [];
  let total = 0, contactable = 0, publicCount = 0, emailVerified = 0, verifiedActions = 0;

  values.slice(1).forEach(row => {
    const id = value(row, h, 'Pledge ID');
    const status = value(row, h, 'Registry Status');
    if (!id || status === 'Withdrawn') return;
    total++;
    const email = value(row, h, 'Email (Private)');
    const nextConsent = value(row, h, 'Next-Phase Contact Consent');
    const publicConsent = value(row, h, 'Public Listing Consent');
    const display = value(row, h, 'Public Display Preference');
    const verifiedAt = value(row, h, 'Email Verified At (UTC)');
    const proofStatus = value(row, h, 'Proof Status');
    const platform = value(row, h, 'Primary Platform');
    const country = value(row, h, 'Country');

    if (email && nextConsent === 'Yes') contactable++;
    if (verifiedAt || ['Email Verified', 'Proof Submitted', 'Verified Pioneer'].includes(status)) emailVerified++;
    if (proofStatus === 'Verified') verifiedActions++;
    if (platform) platformSet.add(platform);
    if (country) countrySet.add(country);

    const canList = publicConsent === 'Yes' && !['Anonymous in totals', 'Private'].includes(display);
    if (canList) {
      publicCount++;
      pioneers.push({
        pledgeId: id,
        name: display === 'Handle only' ? '' : value(row, h, 'Public Creator Name'),
        handle: value(row, h, 'Social Handle'),
        profileUrl: value(row, h, 'Social Profile URL'),
        platform,
        cause: value(row, h, 'Cause / Charity'),
        pledgeDate: value(row, h, 'Pledge Date'),
        status: publicStatus(status, proofStatus)
      });
    }
  });

  pioneers.sort((a, b) => String(b.pledgeDate).localeCompare(String(a.pledgeDate)));
  return {
    generatedAt: new Date().toISOString(),
    totalPledges: total,
    contactablePioneers: contactable,
    publiclyListedPioneers: publicCount,
    emailVerifiedPioneers: emailVerified,
    verifiedCharitableActions: verifiedActions,
    platformsRepresented: platformSet.size,
    countriesRepresented: countrySet.size,
    pioneers: pioneers.slice(0, 100)
  };
}

function assertOrganizationalSenderAvailable() {
  const aliases = GmailApp.getAliases().map(alias => String(alias).toLowerCase());
  if (!aliases.includes(SENDER_ALIAS.toLowerCase())) {
    throw new Error(
      'The Apps Script deployment account cannot send as ' + SENDER_ALIAS +
      '. Deploy and authorize this script while signed in as ho@influencersinvolved.org, ' +
      'with grants@influencersinvolved.org configured as a Gmail send-as alias.'
    );
  }
}

function sendVerificationEmail(email, displayName, token, pledgeId) {
  const verifyUrl = WEB_APP_URL + '?action=verify&token=' + encodeURIComponent(token);
  const subject = 'Confirm your place as an Influencers Involved Pioneer';
  const body = [
    'Hello ' + displayName + ',',
    '',
    'You took the 1% Influence Pledge and claimed a place in the Pioneer Stage.',
    '',
    'Confirm your email and Pioneer Registry record:',
    verifyUrl,
    '',
    'Pledge ID: ' + pledgeId,
    '',
    'This confirmation allows Influencers Involved to count your pledge accurately and contact you about the next stage when you have chosen to receive those updates.',
    '',
    'Influencers Involved',
    SITE_URL
  ].join('\n');

  GmailApp.sendEmail(email, subject, body, {
    from: SENDER_ALIAS,
    name: 'Influencers Involved',
    replyTo: SENDER_ALIAS
  });
}

function verificationPage(success, message) {
  const color = success ? '#13795b' : '#c9382e';
  const title = success ? 'You are confirmed as a Pioneer.' : 'Verification could not be completed.';
  return HtmlService.createHtmlOutput(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#f4f7fa;color:#10243a;margin:0;padding:40px"><main style="max-width:680px;margin:auto;background:white;border-radius:24px;padding:36px;box-shadow:0 18px 50px rgba(11,32,53,.12)"><div style="font-weight:900;color:#0b2035;font-size:22px">Influencers Involved</div><p style="color:${color};font-weight:900;font-size:28px">${title}</p><p style="font-size:18px;line-height:1.6">${message}</p><a href="${SITE_URL}" style="display:inline-block;background:#f05245;color:white;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:999px">Return to the Pioneer Stage</a></main></body></html>`);
}

function findRowByValue(sheet, columnNumber, target) {
  if (!target || sheet.getLastRow() < 2) return -1;
  const values = sheet.getRange(2, columnNumber, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) if (String(values[i][0]) === String(target)) return i + 2;
  return -1;
}

function headerMap(headers) {
  const map = {};
  headers.forEach((name, index) => { map[name] = index; });
  return map;
}

function value(row, map, name) {
  const index = map[name];
  return index === undefined ? '' : String(row[index] || '').trim();
}

function publicStatus(registryStatus, proofStatus) {
  if (proofStatus === 'Verified' || registryStatus === 'Verified Pioneer') return 'Verified Pioneer';
  if (registryStatus === 'Email Verified' || registryStatus === 'Proof Submitted') return 'Confirmed Pioneer';
  return 'Pioneer Pledge';
}

function safeCell(input) {
  const text = String(input || '').trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function normalizeHandle(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  return text.startsWith('@') ? text : '@' + text;
}

function yesNo(value) {
  return ['true', 'yes', '1', 'on'].includes(String(value || '').toLowerCase()) ? 'Yes' : 'No';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function sanitizeCallback(callback) {
  const value = String(callback || '').trim();
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(value) ? value : '';
}

function textResponse(message) {
  return ContentService.createTextOutput(message).setMimeType(ContentService.MimeType.TEXT);
}

function emptyStats() {
  return {generatedAt:new Date().toISOString(),totalPledges:0,contactablePioneers:0,publiclyListedPioneers:0,emailVerifiedPioneers:0,verifiedCharitableActions:0,platformsRepresented:0,countriesRepresented:0,pioneers:[]};
}
