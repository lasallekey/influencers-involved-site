const SPREADSHEET_ID = '1XUaEu9b-4CMyr6x7qYLUgpBxOr-j9uzIVzAB6Nj3NRM';
const PRIVATE_SHEET = 'Pioneers Private';
const CONSENT_VERSION = '2026-07-27-v2';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const p = e && e.parameter ? e.parameter : {};
    const required = [
      'pledgeId',
      'displayName',
      'profileUrl',
      'platform',
      'email',
      'cause',
      'pledgeDate',
      'publicDisplayPreference'
    ];
    const missing = required.filter(key => !String(p[key] || '').trim());

    if (missing.length) {
      return textResponse('Missing required fields: ' + missing.join(', '));
    }
    if (!isValidEmail(p.email)) {
      return textResponse('Invalid email address.');
    }
    if (!/^https:\/\//i.test(String(p.profileUrl))) {
      return textResponse('Profile URL must begin with https://');
    }

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PRIVATE_SHEET);
    if (!sheet) throw new Error('Registry sheet not found.');
    if (findRowByValue(sheet, 1, p.pledgeId) > 0) {
      return textResponse('Duplicate pledge ID.');
    }

    const now = new Date().toISOString();
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
      CONSENT_VERSION,
      safeCell(p.referralSource || p.utmSource || 'Direct')
    ];

    sheet.appendRow(row);
    return textResponse('Pledge retained.');
  } catch (error) {
    console.error(error);
    return textResponse('Submission error. Please try again.');
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'health').toLowerCase();
  if (action === 'stats') return statsResponse(e);
  return ContentService.createTextOutput('II Pioneer Registry service is active.');
}

function statsResponse(e) {
  const data = buildPublicStats();
  const callback = sanitizeCallback(e && e.parameter ? e.parameter.callback : '');

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(data) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildPublicStats() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PRIVATE_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return emptyStats();

  const headers = headerMap(values[0]);
  const platformSet = new Set();
  const countrySet = new Set();
  const pioneers = [];
  let total = 0;
  let contactable = 0;
  let publicCount = 0;

  values.slice(1).forEach(row => {
    const pledgeId = value(row, headers, 'Pledge ID');
    const status = value(row, headers, 'Registry Status');
    if (!pledgeId || status === 'Withdrawn') return;

    total++;

    const email = value(row, headers, 'Email (Private)');
    const nextConsent = value(row, headers, 'Next-Phase Contact Consent');
    const publicConsent = value(row, headers, 'Public Listing Consent');
    const display = value(row, headers, 'Public Display Preference');
    const platform = value(row, headers, 'Primary Platform');
    const country = value(row, headers, 'Country');

    if (email && nextConsent === 'Yes') contactable++;
    if (platform) platformSet.add(platform);
    if (country) countrySet.add(country);

    const canList =
      publicConsent === 'Yes' &&
      !['Anonymous in totals', 'Private'].includes(display);

    if (canList) {
      publicCount++;
      pioneers.push({
        pledgeId,
        name: display === 'Handle only' ? '' : value(row, headers, 'Public Creator Name'),
        handle: value(row, headers, 'Social Handle'),
        profileUrl: value(row, headers, 'Social Profile URL'),
        platform,
        cause: value(row, headers, 'Cause / Charity'),
        pledgeDate: value(row, headers, 'Pledge Date')
      });
    }
  });

  pioneers.sort((a, b) => String(b.pledgeDate).localeCompare(String(a.pledgeDate)));

  return {
    generatedAt: new Date().toISOString(),
    totalPledges: total,
    contactablePioneers: contactable,
    publiclyListedPioneers: publicCount,
    platformsRepresented: platformSet.size,
    countriesRepresented: countrySet.size,
    pioneers: pioneers.slice(0, 100)
  };
}

function findRowByValue(sheet, columnNumber, target) {
  if (!target || sheet.getLastRow() < 2) return -1;
  const values = sheet
    .getRange(2, columnNumber, sheet.getLastRow() - 1, 1)
    .getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(target)) return i + 2;
  }
  return -1;
}

function headerMap(headers) {
  const map = {};
  headers.forEach((name, index) => {
    map[name] = index;
  });
  return map;
}

function value(row, map, name) {
  const index = map[name];
  return index === undefined ? '' : String(row[index] || '').trim();
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

function yesNo(input) {
  return ['true', 'yes', '1', 'on'].includes(
    String(input || '').toLowerCase()
  ) ? 'Yes' : 'No';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(email || '').trim()
  );
}

function sanitizeCallback(callback) {
  const value = String(callback || '').trim();
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(value) ? value : '';
}

function textResponse(message) {
  return ContentService
    .createTextOutput(message)
    .setMimeType(ContentService.MimeType.TEXT);
}

function emptyStats() {
  return {
    generatedAt: new Date().toISOString(),
    totalPledges: 0,
    contactablePioneers: 0,
    publiclyListedPioneers: 0,
    platformsRepresented: 0,
    countriesRepresented: 0,
    pioneers: []
  };
}
