/* ════════════════════════════════════════════════════════════════════
   PRINTFABRIX — shared form validation   (theme asset: pf-forms.js)
   ────────────────────────────────────────────────────────────────────
   Self-contained. No build step, no bundled dependencies, no blocking
   network calls.

   WHAT IT DOES
     Email  — format, common-typo suggestion, disposable-mailbox
              blocklist, and a live deliverability check that looks up
              the domain's MX records over DNS-over-HTTPS.
     Phone  — country flag + dial-code picker covering every dialling
              territory, pre-selected from the visitor's IP, validated
              against that country's mobile length / leading-digit
              rules. Obvious fakes (all-same or sequential digits) are
              rejected everywhere.

   BUILT TO STAY OUT OF THE CRITICAL PATH
     • Exits immediately on pages with no marked fields.
     • Styles are injected only when a field is actually enhanced.
     • The 240-row picker list is built on first open, not on page load.
     • Filtering toggles rows instead of re-rendering the list.
     • IP geolocation fires when a phone field first becomes visible,
       so a product page nobody interacts with makes zero requests.
     • libphonenumber-js is optional polish, fetched on first focus.
       Every country validates locally without it.

   USAGE
     1. Load once per page (deferred):
          {{ 'pf-forms.js' | asset_url | script_tag }}
     2. Mark the inputs:
          <input type="email" data-pf-email data-pf-required>
          <input type="tel"   data-pf-phone data-pf-required>
        Wrap each field in [data-pf-field] (or .pf-fg) so the inline
        message has somewhere to live.
     3. Gate your own submit:
          PFForms.check(el)            -> true/false, paints the message
          PFForms.getPhone(el)         -> "+91 9812345670"
          PFForms.getCountry(el)       -> "IN"
          PFForms.setMsg(el,type,text) -> 'bad' | 'ok' | 'checking'
          PFForms.init(root)           -> enhance an injected form
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PFForms) return;

  var SEL = '[data-pf-email],[data-pf-phone]';

  /* ═══════════════════════════════════════════════════════════════════
     COUNTRY TABLE
     iso | name | dial | minDigits | maxDigits | leadPattern | example

     minDigits/maxDigits are the NATIONAL number length (dial code and
     any trunk "0" removed). leadPattern is a regex body anchored at the
     start, describing which prefixes are mobile. Both may be empty, in
     which case only a loose length check applies.
     Example is optional — a mask is generated from the rule when blank.
     ═══════════════════════════════════════════════════════════════════ */
  var ROWS = [
    'AD|Andorra|376|6|6|[36]|',
    'AE|United Arab Emirates|971|9|9|5|50 123 4567',
    'AF|Afghanistan|93|9|9|7|',
    'AG|Antigua & Barbuda|1|10|10||',
    'AI|Anguilla|1|10|10||',
    'AL|Albania|355|9|9|6|',
    'AM|Armenia|374|8|8|[3-9]|',
    'AO|Angola|244|9|9|9|',
    'AR|Argentina|54|10|11||11 1234 5678',
    'AS|American Samoa|1|10|10||',
    'AT|Austria|43|9|13|6|0660 1234567',
    'AU|Australia|61|9|9|4|0412 345 678',
    'AW|Aruba|297|7|7|[569]|',
    'AX|Åland Islands|358|9|10|[45]|',
    'AZ|Azerbaijan|994|9|9|[4-7]|',
    'BA|Bosnia & Herzegovina|387|8|9|6|',
    'BB|Barbados|1|10|10||',
    'BD|Bangladesh|880|10|10|1|01712 345678',
    'BE|Belgium|32|9|9|4|0470 12 34 56',
    'BF|Burkina Faso|226|8|8|[567]|',
    'BG|Bulgaria|359|9|9|[78]|',
    'BH|Bahrain|973|8|8|3|3600 1234',
    'BI|Burundi|257|8|8|[67]|',
    'BJ|Benin|229|8|10|[469]|',
    'BL|St. Barthélemy|590|9|9|6|',
    'BM|Bermuda|1|10|10||',
    'BN|Brunei|673|7|7|[78]|',
    'BO|Bolivia|591|8|8|[67]|',
    'BQ|Caribbean Netherlands|599|7|7||',
    'BR|Brazil|55|10|11|[1-9]|11 91234 5678',
    'BS|Bahamas|1|10|10||',
    'BT|Bhutan|975|8|8|[17]|',
    'BW|Botswana|267|8|8|7|',
    'BY|Belarus|375|9|9|[234]|',
    'BZ|Belize|501|7|7|6|',
    'CA|Canada|1|10|10||(416) 555-0123',
    'CD|Congo (DRC)|243|9|9|[89]|',
    'CF|Central African Republic|236|8|8|7|',
    'CG|Congo|242|9|9|0[1-6]|',
    'CH|Switzerland|41|9|9|7|078 123 45 67',
    'CI|Côte d’Ivoire|225|10|10|0|',
    'CK|Cook Islands|682|5|5||',
    'CL|Chile|56|9|9|9|9 1234 5678',
    'CM|Cameroon|237|9|9|6|',
    'CN|China|86|11|11|1[3-9]|131 2345 6789',
    'CO|Colombia|57|10|10|3|300 123 4567',
    'CR|Costa Rica|506|8|8|[5-8]|',
    'CU|Cuba|53|8|8|5|',
    'CV|Cape Verde|238|7|7|[59]|',
    'CW|Curaçao|599|7|8||',
    'CY|Cyprus|357|8|8|9|',
    'CZ|Czechia|420|9|9|[67]|601 123 456',
    'DE|Germany|49|10|11|1[5-7]|01512 3456789',
    'DJ|Djibouti|253|8|8|77|',
    'DK|Denmark|45|8|8||20 12 34 56',
    'DM|Dominica|1|10|10||',
    'DO|Dominican Republic|1|10|10||',
    'DZ|Algeria|213|9|9|[567]|',
    'EC|Ecuador|593|9|9|9|',
    'EE|Estonia|372|7|8|[58]|',
    'EG|Egypt|20|10|10|1|100 123 4567',
    'ER|Eritrea|291|7|7|[178]|',
    'ES|Spain|34|9|9|[67]|612 345 678',
    'ET|Ethiopia|251|9|9|9|',
    'FI|Finland|358|9|10|[45]|040 123 4567',
    'FJ|Fiji|679|7|7|[7-9]|',
    'FK|Falkland Islands|500|5|5||',
    'FM|Micronesia|691|7|7||',
    'FO|Faroe Islands|298|6|6||',
    'FR|France|33|9|9|[67]|06 12 34 56 78',
    'GA|Gabon|241|8|8|[0-7]|',
    'GB|United Kingdom|44|10|10|7|07700 900123',
    'GD|Grenada|1|10|10||',
    'GE|Georgia|995|9|9|5|',
    'GF|French Guiana|594|9|9|6|',
    'GG|Guernsey|44|10|10|7|',
    'GH|Ghana|233|9|9|[235]|24 123 4567',
    'GI|Gibraltar|350|8|8|5|',
    'GL|Greenland|299|6|6||',
    'GM|Gambia|220|7|7|[2-9]|',
    'GN|Guinea|224|9|9|6|',
    'GP|Guadeloupe|590|9|9|6|',
    'GQ|Equatorial Guinea|240|9|9|[26]|',
    'GR|Greece|30|10|10|6|691 234 5678',
    'GT|Guatemala|502|8|8|[3-5]|',
    'GU|Guam|1|10|10||',
    'GW|Guinea-Bissau|245|9|9|[59]|',
    'GY|Guyana|592|7|7|6|',
    'HK|Hong Kong|852|8|8|[569]|5123 4567',
    'HN|Honduras|504|8|8|[389]|',
    'HR|Croatia|385|8|9|9|',
    'HT|Haiti|509|8|8|[34]|',
    'HU|Hungary|36|9|9|[237]|20 123 4567',
    'ID|Indonesia|62|9|12|8|0812 3456 7890',
    'IE|Ireland|353|9|9|8|087 123 4567',
    'IL|Israel|972|9|9|5|050 123 4567',
    'IM|Isle of Man|44|10|10|7|',
    'IN|India|91|10|10|[6-9]|98765 43210',
    'IQ|Iraq|964|10|10|7|',
    'IR|Iran|98|10|10|9|',
    'IS|Iceland|354|7|7|[6-8]|',
    'IT|Italy|39|9|11|3|312 345 6789',
    'JE|Jersey|44|10|10|7|',
    'JM|Jamaica|1|10|10||',
    'JO|Jordan|962|9|9|7|',
    'JP|Japan|81|10|11|[789]|090 1234 5678',
    'KE|Kenya|254|9|9|[17]|712 345 678',
    'KG|Kyrgyzstan|996|9|9|[5-9]|',
    'KH|Cambodia|855|8|9|[1-9]|',
    'KI|Kiribati|686|8|8||',
    'KM|Comoros|269|7|7|3|',
    'KN|St. Kitts & Nevis|1|10|10||',
    'KR|South Korea|82|9|10|1|010 1234 5678',
    'KW|Kuwait|965|8|8|[569]|500 12345',
    'KY|Cayman Islands|1|10|10||',
    'KZ|Kazakhstan|7|10|10|7|',
    'LA|Laos|856|9|10|2|',
    'LB|Lebanon|961|7|8|[37]|',
    'LC|St. Lucia|1|10|10||',
    'LI|Liechtenstein|423|7|7|7|',
    'LK|Sri Lanka|94|9|9|7|077 123 4567',
    'LR|Liberia|231|8|9|[4-8]|',
    'LS|Lesotho|266|8|8|[56]|',
    'LT|Lithuania|370|8|8|6|',
    'LU|Luxembourg|352|9|9|6|',
    'LV|Latvia|371|8|8|2|',
    'LY|Libya|218|9|9|9|',
    'MA|Morocco|212|9|9|[67]|612 345 678',
    'MC|Monaco|377|8|9|[4-6]|',
    'MD|Moldova|373|8|8|[67]|',
    'ME|Montenegro|382|8|8|6|',
    'MF|St. Martin|590|9|9|6|',
    'MG|Madagascar|261|9|9|3|',
    'MH|Marshall Islands|692|7|7||',
    'MK|North Macedonia|389|8|8|7|',
    'ML|Mali|223|8|8|[6-9]|',
    'MM|Myanmar|95|8|10|9|',
    'MN|Mongolia|976|8|8|[5-9]|',
    'MO|Macau|853|8|8|6|',
    'MP|Northern Mariana Islands|1|10|10||',
    'MQ|Martinique|596|9|9|6|',
    'MR|Mauritania|222|8|8|[2-4]|',
    'MS|Montserrat|1|10|10||',
    'MT|Malta|356|8|8|[79]|',
    'MU|Mauritius|230|8|8|5|',
    'MV|Maldives|960|7|7|[79]|',
    'MW|Malawi|265|9|9|[89]|',
    'MX|Mexico|52|10|10||55 1234 5678',
    'MY|Malaysia|60|9|10|1|12 345 6789',
    'MZ|Mozambique|258|9|9|8|',
    'NA|Namibia|264|9|9|[68]|',
    'NC|New Caledonia|687|6|6|[7-9]|',
    'NE|Niger|227|8|8|[89]|',
    'NG|Nigeria|234|10|10|[789]|802 123 4567',
    'NI|Nicaragua|505|8|8|[578]|',
    'NL|Netherlands|31|9|9|6|06 12345678',
    'NO|Norway|47|8|8|[49]|406 12 345',
    'NP|Nepal|977|10|10|9|980 1234567',
    'NR|Nauru|674|7|7||',
    'NU|Niue|683|4|4||',
    'NZ|New Zealand|64|8|10|2|021 234 5678',
    'OM|Oman|968|8|8|[79]|9212 3456',
    'PA|Panama|507|8|8|6|',
    'PE|Peru|51|9|9|9|912 345 678',
    'PF|French Polynesia|689|8|8|[89]|',
    'PG|Papua New Guinea|675|8|8|[78]|',
    'PH|Philippines|63|10|10|9|917 123 4567',
    'PK|Pakistan|92|10|10|3|0300 1234567',
    'PL|Poland|48|9|9|[4-9]|512 345 678',
    'PM|St. Pierre & Miquelon|508|6|6||',
    'PR|Puerto Rico|1|10|10||',
    'PS|Palestine|970|9|9|5|',
    'PT|Portugal|351|9|9|9|912 345 678',
    'PW|Palau|680|7|7||',
    'PY|Paraguay|595|9|9|9|',
    'QA|Qatar|974|8|8|[3567]|3312 3456',
    'RE|Réunion|262|9|9|6|',
    'RO|Romania|40|9|9|7|712 345 678',
    'RS|Serbia|381|8|9|6|',
    'RU|Russia|7|10|10|9|912 345-67-89',
    'RW|Rwanda|250|9|9|7|',
    'SA|Saudi Arabia|966|9|9|5|50 123 4567',
    'SB|Solomon Islands|677|7|7|[78]|',
    'SC|Seychelles|248|7|7|2|',
    'SD|Sudan|249|9|9|[19]|',
    'SE|Sweden|46|9|9|7|070 123 45 67',
    'SG|Singapore|65|8|8|[89]|8123 4567',
    'SI|Slovenia|386|8|8|[3-7]|',
    'SK|Slovakia|421|9|9|9|',
    'SL|Sierra Leone|232|8|8|[2-9]|',
    'SM|San Marino|378|8|10|[36]|',
    'SN|Senegal|221|9|9|7|',
    'SO|Somalia|252|8|9|[6-9]|',
    'SR|Suriname|597|7|7|[78]|',
    'SS|South Sudan|211|9|9|9|',
    'ST|São Tomé & Príncipe|239|7|7|9|',
    'SV|El Salvador|503|8|8|[67]|',
    'SX|Sint Maarten|1|10|10||',
    'SY|Syria|963|9|9|9|',
    'SZ|Eswatini|268|8|8|7|',
    'TC|Turks & Caicos Islands|1|10|10||',
    'TD|Chad|235|8|8|[679]|',
    'TG|Togo|228|8|8|[79]|',
    'TH|Thailand|66|9|9|[689]|081 234 5678',
    'TJ|Tajikistan|992|9|9|[59]|',
    'TL|Timor-Leste|670|8|8|7|',
    'TM|Turkmenistan|993|8|8|6|',
    'TN|Tunisia|216|8|8|[2459]|',
    'TO|Tonga|676|5|7||',
    'TR|Türkiye|90|10|10|5|532 123 4567',
    'TT|Trinidad & Tobago|1|10|10||',
    'TW|Taiwan|886|9|9|9|912 345 678',
    'TZ|Tanzania|255|9|9|[67]|',
    'UA|Ukraine|380|9|9|[3-9]|050 123 4567',
    'UG|Uganda|256|9|9|7|',
    'US|United States|1|10|10||(555) 234-5678',
    'UY|Uruguay|598|8|8|9|',
    'UZ|Uzbekistan|998|9|9|[3-9]|',
    'VA|Vatican City|39|9|11|3|',
    'VC|St. Vincent & Grenadines|1|10|10||',
    'VE|Venezuela|58|10|10|[24]|',
    'VG|British Virgin Islands|1|10|10||',
    'VI|U.S. Virgin Islands|1|10|10||',
    'VN|Vietnam|84|9|10|[3-9]|091 234 5678',
    'VU|Vanuatu|678|7|7|[57]|',
    'WF|Wallis & Futuna|681|6|6||',
    'WS|Samoa|685|7|7||',
    'XK|Kosovo|383|8|9|4|',
    'YE|Yemen|967|9|9|7|',
    'YT|Mayotte|262|9|9|6|',
    'ZA|South Africa|27|9|9|[6-8]|071 234 5678',
    'ZM|Zambia|260|9|9|[79]|',
    'ZW|Zimbabwe|263|9|9|7|'
  ];

  /* Shown first in the picker — the markets PrintFabrix ships to most. */
  var PINNED = ['US', 'CA', 'GB', 'AU', 'IN', 'AE', 'DE', 'FR'];
  var DEFAULT_RULE = { min: 7, max: 15 };

  var COUNTRIES = [], BY_ISO = {};
  ROWS.forEach(function (row) {
    var p = row.split('|');
    var c = {
      iso: p[0], name: p[1], code: '+' + p[2],
      min: +p[3] || DEFAULT_RULE.min,
      max: +p[4] || DEFAULT_RULE.max,
      lead: p[5] ? new RegExp('^' + p[5]) : null,
      leadRaw: p[5] || '',
      ex: p[6] || ''
    };
    COUNTRIES.push(c);
    // first definition wins: +44 GB before its crown dependencies
    if (!BY_ISO[c.iso]) BY_ISO[c.iso] = c;
  });
  COUNTRIES.sort(function (a, b) {
    var ai = PINNED.indexOf(a.iso), bi = PINNED.indexOf(b.iso);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.name.localeCompare(b.name);
  });

  /* A country with no explicit example gets a shape hint instead of an
     invented number: leading digit (when unambiguous) + grouped Xs. */
  function maskFor(c) {
    if (c.ex) return c.ex;
    var head = /^\d/.test(c.leadRaw) ? c.leadRaw.charAt(0) : '';
    var body = new Array(Math.max(c.min - head.length, 0) + 1).join('X');
    var out = (head + body).replace(/(.{3})(?=.)/g, '$1 ')
                           .replace(/ (\S)$/, '$1');   // no orphan last group
    return out || 'Mobile number';
  }
  function flagUrl(iso) { return 'https://flagcdn.com/' + iso.toLowerCase() + '.svg'; }

  /* ═══════════ email ═══════════ */
  var EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

  var TYPOS = {
    'gmail.con':'gmail.com','gmail.co':'gmail.com','gmial.com':'gmail.com','gmal.com':'gmail.com',
    'gmail.cm':'gmail.com','gnail.com':'gmail.com','gmaill.com':'gmail.com','gmailcom':'gmail.com',
    'gmail.om':'gmail.com','gamil.com':'gmail.com',
    'yahoo.con':'yahoo.com','yaho.com':'yahoo.com','yahooo.com':'yahoo.com','yhaoo.com':'yahoo.com','yahoo.co':'yahoo.com',
    'hotmail.con':'hotmail.com','hotmal.com':'hotmail.com','hotmial.com':'hotmail.com','hotmaill.com':'hotmail.com','hotmail.co':'hotmail.com',
    'outlook.con':'outlook.com','outlok.com':'outlook.com','outloo.com':'outlook.com','outlook.co':'outlook.com',
    'icloud.con':'icloud.com','iclod.com':'icloud.com','icloud.co':'icloud.com',
    'live.con':'live.com','aol.con':'aol.com','proton.con':'proton.me','rediffmail.con':'rediffmail.com'
  };

  var DISPOSABLE_SET = {};
  ('mailinator.com mailinator.net tempmail.com temp-mail.org temp-mail.io tempmail.net ' +
   '10minutemail.com 10minutemail.net guerrillamail.com guerrillamail.net sharklasers.com grr.la ' +
   'yopmail.com yopmail.fr throwaway.email throwawaymail.com maildrop.cc mailcatch.com mailnesia.com ' +
   'trashmail.com trashmail.net dispostable.com discard.email dropmail.me spam4.me spamgourmet.com ' +
   'mintemail.com mohmal.com fakeinbox.com getnada.com nada.email getairmail.com tempinbox.com ' +
   'tmail.io tmpmail.org mail.tm 33mail.com burnermail.io anonymbox.com jetable.org spambog.com ' +
   'tempr.email emailondeck.com inboxkitten.com mailpoof.com'
  ).split(' ').forEach(function (d) { DISPOSABLE_SET[d] = 1; });
  var DISPOSABLE_PAT = /(tempmail|temp-mail|tmpmail|10minute|20minute|30minute|throwaway|mailinator|yopmail|guerrilla|sharklaser|trashmail|dispostable|fakeinbox|fake-mail|wegwerf|getairmail|mintemail|harakiri|disposable|tempinbox|mailtemp|discardmail|dropmail|mailpoof|mailcatch|maildrop|mohmal|inboxbear|inboxkitten|mailnesia|burnermail|spamgourmet|spam4me)/i;

  function domainOf(email) {
    var at = String(email).lastIndexOf('@');
    return at < 0 ? '' : String(email).slice(at + 1).toLowerCase().trim();
  }
  function isDisposable(email) {
    var d = domainOf(email);
    if (!d) return false;
    if (DISPOSABLE_SET[d] || DISPOSABLE_PAT.test(d)) return true;
    var parts = d.split('.');                     // foo.mailinator.com
    for (var i = 1; i < parts.length - 1; i++) {
      if (DISPOSABLE_SET[parts.slice(i).join('.')]) return true;
    }
    return false;
  }
  function typoSuggestion(email) {
    var v = String(email).trim(), at = v.lastIndexOf('@');
    if (at < 0) return null;
    var d = v.slice(at + 1).toLowerCase();
    return TYPOS[d] ? v.slice(0, at + 1) + TYPOS[d] : null;
  }

  /* true = deliverable, false = cannot receive mail, null = inconclusive
     (blocked / timed out — never block the customer on that). */
  var mxCache = {};
  function checkMX(domain) {
    if (Object.prototype.hasOwnProperty.call(mxCache, domain)) return Promise.resolve(mxCache[domain]);
    return new Promise(function (resolve) {
      var ctrl, signal;
      try { ctrl = new AbortController(); signal = ctrl.signal; } catch (e) {}
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); resolve(null); }, 5000);
      fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX', { signal: signal })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { clearTimeout(timer); resolve(d); })
        .catch(function () { clearTimeout(timer); resolve(null); });
    }).then(function (d) {
      var verdict = null;
      if (d) {
        if (d.Status === 3) {
          verdict = false;                                   // NXDOMAIN
        } else if (d.Status === 0 && Array.isArray(d.Answer) && d.Answer.length) {
          verdict = d.Answer.some(function (a) {
            if (a.type !== 15) return false;                 // 15 = MX
            var host = String(a.data || '').trim().split(/\s+/).pop().replace(/\.$/, '').toLowerCase();
            return host && host !== 'localhost' && host !== '0.0.0.0' && host !== '127.0.0.1';
          });
        } else if (d.Status === 0) {
          verdict = false;                                   // resolves, no MX
        }
      }
      mxCache[domain] = verdict;
      return verdict;
    });
  }

  /* ═══════════ phone ═══════════ */
  var libRequested = false;
  function loadLib() {
    if (libRequested) return;
    libRequested = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/libphonenumber-js@1.11.4/bundle/libphonenumber-max.js';
    s.async = true;
    document.head.appendChild(s);
  }

  /* A typed number can be read more than one way: "+91 98…" carries the
     dial code, "07700…" carries a trunk zero, and in Kazakhstan (+7) the
     national number itself starts with 7 — stripping blindly would eat a
     real digit. So build every plausible reading and let the country's
     own rule pick the one that fits, rather than guessing up front. */
  function readings(value, country) {
    var digits = String(value).replace(/\D/g, '');
    var dial = String(country && country.code || '').replace(/\D/g, '');
    // some countries (Congo, Côte d'Ivoire…) have a significant leading 0
    var keepZero = !!(country && /^0/.test(country.leadRaw));
    var out = [];
    function add(d) {
      if (d && out.indexOf(d) === -1) out.push(d);
      if (!keepZero && d && d.length > 1 && d.charAt(0) === '0') {
        var s = d.slice(1);
        if (out.indexOf(s) === -1) out.push(s);
      }
    }
    if (dial && digits.length > dial.length && digits.indexOf(dial) === 0) add(digits.slice(dial.length));
    add(digits);
    return out;
  }
  function isObviousFake(digits) {
    if (/^(\d)\1+$/.test(digits)) return true;             // 6666666666
    if ('01234567890'.indexOf(digits) >= 0) return true;   // 1234567890
    if ('09876543210'.indexOf(digits) >= 0) return true;   // 9876543210
    return false;
  }
  function validatePhone(value, country) {
    var c = country || DEFAULT_RULE;
    var list = readings(value, country);
    var fits = null;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (d.length < c.min || d.length > c.max) continue;
      if (c.lead && !c.lead.test(d)) continue;
      fits = d;
      break;
    }
    if (fits === null) return false;
    if (isObviousFake(fits)) return false;
    if (window.libphonenumber && typeof window.libphonenumber.parsePhoneNumberFromString === 'function') {
      try {
        var pn = window.libphonenumber.parsePhoneNumberFromString(String(value), country && country.iso);
        if (pn && typeof pn.isValid === 'function' && !pn.isValid()) return false;
      } catch (e) {}
    }
    return true;
  }
  /* Turn the leading-digit pattern into something a human can act on:
     "[6-9]" -> "6, 7, 8 or 9";  "1[3-9]" -> "13-19";  "7" -> "7". */
  function leadHint(raw) {
    var m = /^\[(\d)-(\d)\]$/.exec(raw);
    if (m) {
      var list = [];
      for (var d = +m[1]; d <= +m[2]; d++) list.push(d);
      return list.slice(0, -1).join(', ') + ' or ' + list[list.length - 1];
    }
    m = /^\[(\d+)\]$/.exec(raw);
    if (m) {
      var ds = m[1].split('');
      return ds.slice(0, -1).join(', ') + ' or ' + ds[ds.length - 1];
    }
    if (/^\d+$/.test(raw)) return raw;
    return '';
  }
  /* WORDING ONLY. This used to read the country rule back to the visitor
     ("a valid 10-digit mobile number starting with 6, 7, 8 or 9"), which is
     our own validation table talking out loud. THE RULES ARE UNCHANGED —
     validatePhone still checks length and leading digit per country and
     still rejects exactly what it rejected before. Only the sentence shown
     when it fails is now the same plain one everywhere.
     `leadHint` is left in place, unused, rather than deleted along with the
     rules it used to describe. */
  function phoneErrorFor(c) {
    return 'Please enter a valid mobile number.';
  }

  /* ═══════════ inline messages ═══════════ */
  function fieldOf(input) {
    return input.closest('[data-pf-field]') || input.closest('.pf-fg') || input.parentNode;
  }
  function msgNode(input) {
    var host = fieldOf(input);
    var m = host.querySelector(':scope > .pff-msg');
    if (!m) { m = document.createElement('div'); m.className = 'pff-msg'; host.appendChild(m); }
    return m;
  }
  function setMsg(input, type, text) {
    var m = msgNode(input);
    m.className = 'pff-msg pff-show pff-t-' + type;
    m.textContent = text;
  }
  function clearMsg(input) {
    var m = msgNode(input);
    m.className = 'pff-msg';
    m.textContent = '';
  }
  function markPhone(input, bad) {
    input.classList.toggle('pff-bad', bad);
    var w = input.closest('.pff-phone');
    if (w) w.classList.toggle('pff-bad', bad);
  }

  /* ═══════════ email field ═══════════ */
  function emailVerdict(input) {
    var v = (input.value || '').trim();
    if (!v) return { state: input.hasAttribute('data-pf-required') ? 'required' : 'empty' };
    if (!EMAIL_RE.test(v)) return { state: 'bad', msg: 'Please enter a valid email address.' };
    var sug = typoSuggestion(v);
    if (sug) return { state: 'bad', msg: 'Did you mean ' + sug + '?' };
    if (isDisposable(v)) return { state: 'bad', msg: 'Temporary / disposable mailboxes are not accepted.' };
    if (mxCache[domainOf(v)] === false) return { state: 'bad', msg: 'Please enter a valid email address.' };
    return { state: 'ok' };
  }
  function paintEmail(input, showOk) {
    var r = emailVerdict(input);
    if (r.state === 'empty')    { input.classList.remove('pff-bad'); clearMsg(input); return true; }
    if (r.state === 'required') { input.classList.add('pff-bad'); setMsg(input, 'bad', 'Please enter your email.'); return false; }
    if (r.state === 'bad')      { input.classList.add('pff-bad'); setMsg(input, 'bad', r.msg); return false; }
    input.classList.remove('pff-bad');
    /* Nothing to say when it is fine — say nothing. showOk stays in the
       signature so every existing caller remains valid. */
    clearMsg(input);
    return true;
  }

  var mxTimers = {};
  function scheduleMX(input) {
    var domain = domainOf((input.value || '').trim());
    if (domain.indexOf('.') < 1) return;
    var key = input.__pffId;
    if (mxTimers[key]) clearTimeout(mxTimers[key]);
    setMsg(input, 'checking', 'Checking email domain…');
    mxTimers[key] = setTimeout(function () {
      checkMX(domain).then(function (res) {
        if (domainOf((input.value || '').trim()) !== domain) return;   // moved on
        if (res === false) {
          input.classList.add('pff-bad');
          setMsg(input, 'bad', 'Please enter a valid email address.');
        } else if (res === true) {
          input.classList.remove('pff-bad');
          clearMsg(input);
        } else {
          paintEmail(input, false);
        }
      });
    }, 600);
  }

  /* ═══════════════════════════════════════════════════════════════════
     DOMAIN SUGGESTIONS
     Type "vipul" and it offers vipul@gmail.com, vipul@yahoo.com and so on;
     type "vipul@g" and it narrows to gmail.com. Saves the longest part of
     typing an address and removes a whole class of typo.

     It deliberately goes QUIET once the domain is clearly a real one that
     is not a consumer provider — someone entering vipul@rankhighly.com
     should not be pestered with gmail. Suggestions only appear while the
     domain is empty or still a prefix of a provider we know.
     ═══════════════════════════════════════════════════════════════════ */
  var PROVIDERS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
    'rediffmail.com', 'proton.me', 'aol.com', 'live.com', 'ymail.com',
    'zoho.com', 'gmx.com', 'mail.com', 'yahoo.co.in', 'yahoo.co.uk'
  ];

  function suggestFor(value) {
    var v = String(value || '').trim();
    if (!v || /\s/.test(v)) return [];

    var at = v.indexOf('@');
    var local = at < 0 ? v : v.slice(0, at);
    var domain = at < 0 ? '' : v.slice(at + 1).toLowerCase();

    /* Too little to go on, or more than one @ typed. */
    if (local.length < 2 || v.indexOf('@', at + 1) > -1) return [];

    var matches = PROVIDERS.filter(function (d) {
      return !domain || (d.indexOf(domain) === 0 && d !== domain);
    });

    /* A complete domain of their own — leave them alone. */
    if (!matches.length) return [];

    return matches.slice(0, 6).map(function (d) { return local + '@' + d; });
  }

  function enhanceSuggest(input) {
    var host = fieldOf(input);
    if (!host || !host.appendChild) return;
    host.classList.add('pff-sug-host');

    var box = document.createElement('div');
    box.className = 'pff-sug';
    box.id = 'pff-sug-' + (input.__pffId || 'e');
    box.setAttribute('role', 'listbox');
    box.hidden = true;
    host.appendChild(box);

    var items = [];
    var active = -1;

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', box.id);

    function close() {
      box.hidden = true;
      box.innerHTML = '';
      items = [];
      active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function paint() {
      var list = suggestFor(input.value);
      if (!list.length) return close();

      box.innerHTML = list
        .map(function (addr, i) {
          var cut = addr.indexOf('@');
          return '<button type="button" role="option" class="pff-sug-opt" id="' + box.id + '-' + i +
            '" data-addr="' + addr.replace(/"/g, '&quot;') + '">' +
            '<span class="pff-sug-local">' + addr.slice(0, cut) + '</span>' +
            '<span class="pff-sug-dom">' + addr.slice(cut) + '</span></button>';
        })
        .join('');

      items = Array.prototype.slice.call(box.children);
      active = -1;
      /* Positioned from the input, not the wrapper — the wrapper also holds
         the label above and the message below. */
      box.style.top = input.offsetTop + input.offsetHeight + 4 + 'px';
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function choose(i) {
      var el = items[i];
      if (!el) return;
      input.value = el.getAttribute('data-addr');
      input.dataset.pffTouched = '1';
      close();
      if (paintEmail(input, true)) scheduleMX(input);
    }

    function move(dir) {
      if (!items.length) return;
      if (items[active]) items[active].classList.remove('pff-on');
      active = dir > 0 ? (active + 1) % items.length : active <= 0 ? items.length - 1 : active - 1;
      items[active].classList.add('pff-on');
      input.setAttribute('aria-activedescendant', items[active].id);
    }

    input.addEventListener('input', paint);
    input.addEventListener('focus', paint);

    input.addEventListener('keydown', function (e) {
      if (box.hidden) return;

      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') { close(); return; }

      if (e.key === 'Enter' && active > -1) {
        /* Take the suggestion instead of submitting the form. */
        e.preventDefault();
        e.stopPropagation();
        choose(active);
      }
    });

    /* mousedown, not click: keeps focus in the input so blur never races
       the selection. */
    box.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var opt = e.target.closest ? e.target.closest('.pff-sug-opt') : null;
      if (opt) choose(items.indexOf(opt));
    });

    input.addEventListener('blur', function () {
      setTimeout(close, 120);
    });
  }

  function enhanceEmail(input) {
    enhanceSuggest(input);

    input.addEventListener('input', function () {
      input.dataset.pffTouched = '1';
      if ((input.value || '').indexOf('@') > 0) {
        if (paintEmail(input, false)) scheduleMX(input);
      } else {
        input.classList.remove('pff-bad');
        clearMsg(input);
      }
    });
    input.addEventListener('blur', function () {
      // tabbing through an untouched field shouldn't accuse anyone of
      // leaving it blank — "required" is only enforced on submit
      if (!(input.value || '').trim()) {
        input.classList.remove('pff-bad');
        clearMsg(input);
        return;
      }
      if (paintEmail(input, true)) scheduleMX(input);
    });
  }

  /* ═══════════ phone field ═══════════ */
  /* Cached for a day in localStorage, so a returning visitor resolves
     instantly and the free geo-IP tier isn't burned one call per page. */
  var GEO_KEY = 'pff-geo', GEO_TTL = 864e5;
  var ipLookup = null;
  /* Same object throughout, so PFForms.geoCache stays live for callers
     that need city/state synchronously at submit time. */
  var geoCache = {};
  function fillGeo(g) {
    if (g) { geoCache.iso = g.iso || ''; geoCache.city = g.city || ''; geoCache.region = g.region || ''; }
    return g;
  }
  /* Resolves {iso, city, region}. One lookup serves both the dial-code
     picker and any caller that needs the visitor's city/state. */
  function detectGeo() {
    if (ipLookup) return ipLookup;
    try {
      var raw = localStorage.getItem(GEO_KEY);
      if (raw) {
        var hit = JSON.parse(raw);
        if (hit && hit.iso && BY_ISO[hit.iso] && (Date.now() - hit.t) < GEO_TTL) {
          return (ipLookup = Promise.resolve(fillGeo(hit)));
        }
      }
    } catch (e) {}

    function remember(g) {
      if (g && g.iso) {
        g.t = Date.now();
        try { localStorage.setItem(GEO_KEY, JSON.stringify(g)); } catch (e) {}
      }
      return fillGeo(g);
    }
    ipLookup = fetch('https://ipapi.co/json/', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.country_code) throw 0;
        return remember({ iso: d.country_code, city: d.city || '', region: d.region || '' });
      })
      .catch(function () {
        return fetch('https://api.country.is/')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { return d && d.country ? remember({ iso: d.country, city: '', region: '' }) : null; })
          .catch(function () { return null; });
      });
    return ipLookup;
  }
  function detectCountry() {
    return detectGeo().then(function (g) { return g && g.iso; });
  }

  var warmers = [];

  function enhancePhone(input) {
    var wrap = document.createElement('div');
    wrap.className = 'pff-phone';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pff-cc';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<img alt="" width="22" height="16"><span class="pff-cc-code"></span>' +
      '<svg class="pff-cc-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

    var dd = document.createElement('div');
    dd.className = 'pff-dd';
    dd.hidden = true;
    dd.innerHTML = '<div class="pff-sw">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
      '<input class="pff-search" type="text" placeholder="Search country or code…" aria-label="Search country"></div>' +
      '<div class="pff-list" role="listbox"></div><div class="pff-empty" hidden>No matches</div>';

    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(btn);
    wrap.appendChild(input);
    wrap.appendChild(dd);
    input.classList.add('pff-phone-input');

    var imgEl = btn.querySelector('img');
    var codeEl = btn.querySelector('.pff-cc-code');
    var list = dd.querySelector('.pff-list');
    var emptyEl = dd.querySelector('.pff-empty');
    var searchEl = dd.querySelector('.pff-search');
    var current = BY_ISO.US || COUNTRIES[0];
    var built = false;
    input.__pffCountry = current;

    function apply(c) {
      current = c;
      input.__pffCountry = c;
      imgEl.src = flagUrl(c.iso);
      imgEl.alt = c.iso;
      codeEl.textContent = c.code;
      btn.setAttribute('aria-label', 'Country code: ' + c.name + ' ' + c.code);
      if (!input.value || !input.dataset.pffTouched) input.placeholder = maskFor(c);
      if (built) {
        Array.prototype.forEach.call(list.children, function (el) {
          el.classList.toggle('pff-on', el.dataset.iso === c.iso);
          el.setAttribute('aria-selected', el.dataset.iso === c.iso ? 'true' : 'false');
        });
      }
      if ((input.value || '').trim()) check(input);
    }

    /* 240 rows are built once, on first open — never during page load. */
    function build() {
      if (built) return;
      built = true;
      list.innerHTML = COUNTRIES.map(function (c) {
        return '<button type="button" role="option" aria-selected="' + (c.iso === current.iso) +
          '" class="pff-opt' + (c.iso === current.iso ? ' pff-on' : '') + '" data-iso="' + c.iso +
          '" data-find="' + (c.name + ' ' + c.code + ' ' + c.iso).toLowerCase().replace(/"/g, '') + '">' +
          '<img loading="lazy" decoding="async" src="' + flagUrl(c.iso) + '" alt="" width="24" height="18">' +
          '<span class="pff-nm">' + c.name + '</span><span class="pff-cd">' + c.code + '</span></button>';
      }).join('');
    }
    /* Filtering toggles rows — no innerHTML churn per keystroke. */
    function filter(q) {
      var f = (q || '').toLowerCase().trim();
      var shown = 0;
      Array.prototype.forEach.call(list.children, function (el) {
        var hit = !f || el.dataset.find.indexOf(f) !== -1;
        el.hidden = !hit;
        if (hit) shown++;
      });
      emptyEl.hidden = shown > 0;
    }
    function open() {
      build();
      dd.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      setTimeout(function () { searchEl.focus(); }, 10);
    }
    function close() {
      dd.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      searchEl.value = '';
      if (built) filter('');
    }

    apply(current);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      input.dataset.pffPicked = '1';        // stop a late IP result overriding a manual choice
      if (dd.hidden) open(); else close();
    });
    searchEl.addEventListener('input', function () { filter(searchEl.value); });
    searchEl.addEventListener('click', function (e) { e.stopPropagation(); });
    /* This search box is injected INSIDE the customer's form, so Enter here
       would trigger implicit submission of the whole form while they are only
       filtering countries. Take Enter to mean "pick the top match" instead. */
    searchEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var top = null;
      Array.prototype.some.call(list.children, function (el) {
        if (!el.hidden) { top = el; return true; }
        return false;
      });
      if (top) { apply(BY_ISO[top.dataset.iso] || current); close(); input.focus(); }
    });
    list.addEventListener('click', function (e) {
      var opt = e.target.closest('.pff-opt');
      if (!opt) return;
      apply(BY_ISO[opt.dataset.iso] || current);
      close();
      input.focus();
    });
    document.addEventListener('click', function (e) {
      if (!dd.hidden && !dd.contains(e.target) && !btn.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dd.hidden) close(); });

    input.addEventListener('focus', loadLib, { once: true });
    input.addEventListener('touchstart', loadLib, { once: true, passive: true });
    input.addEventListener('input', function () {
      input.dataset.pffTouched = '1';
      if ((input.value || '').trim()) check(input);
      else { markPhone(input, false); clearMsg(input); }
    });
    input.addEventListener('blur', function () { if ((input.value || '').trim()) check(input); });

    /* Geolocate only once the field can actually be seen — a product page
       whose mockup modal is never opened makes no request at all. Callers
       that know the field is about to appear can call PFForms.warm()
       first, which avoids showing the default flag for a frame. */
    function geo() {
      return detectCountry().then(function (iso) {
        if (iso && BY_ISO[iso] && !input.dataset.pffPicked) apply(BY_ISO[iso]);
      }).catch(function () {});
    }
    warmers.push(geo);

    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (en) { return en.isIntersecting; })) { io.disconnect(); geo(); }
      });
      io.observe(input);
      input.addEventListener('focus', geo, { once: true });
      btn.addEventListener('click', geo, { once: true });
    } else {
      geo();
    }
  }

  /* Start geolocation now and resolve every enhanced phone field. */
  function warm() {
    detectCountry();
    return Promise.all(warmers.map(function (fn) { try { return fn(); } catch (e) { return null; } }));
  }

  /* ═══════════ styles — injected on first enhance, not on load ═══════════ */
  var cssDone = false;
  function injectCSS() {
    if (cssDone) return;
    cssDone = true;
    var css = [
      '.pff-phone{position:relative;display:flex!important;align-items:stretch!important;width:100%!important;margin:0}',
      /* Trimmed: flag + dial code was eating ~120px of a phone-width row,
         leaving the number itself squeezed. Padding, gap, flag and caret
         come down ~20px in total; the 44px coarse-pointer tap target at
         the bottom of this block is untouched. */
      '.pff-cc{display:inline-flex!important;align-items:center!important;gap:4px!important;',
        'padding:0 6px 0 8px!important;margin:0!important;width:auto!important;height:auto!important;',
        'min-height:0!important;max-width:none!important;flex-shrink:0!important;',
        'border:1.5px solid var(--line,#D9DEE8)!important;border-right:none!important;',
        'border-radius:8px 0 0 8px!important;background:var(--greige,#F4F6FB)!important;',
        'color:var(--ink,#141C33)!important;box-shadow:none!important;cursor:pointer;',
        'font-family:inherit!important;font-size:13px!important;font-weight:400!important;',
        'letter-spacing:normal!important;text-transform:none!important;line-height:1.2!important;',
        'white-space:nowrap!important;-webkit-appearance:none!important;appearance:none!important;transform:none!important}',
      '.pff-cc:hover{background:#EDF0F8!important}',
      '.pff-cc:focus-visible{outline:2px solid var(--cyan,#00A5C4)!important;outline-offset:2px}',
      '.pff-cc img{width:18px!important;height:13px!important;object-fit:cover!important;border-radius:2px!important;',
        'box-shadow:0 0 0 1px rgba(20,28,51,.12)!important;background:#EEF0F4;display:block!important;margin:0!important;max-width:none!important}',
      '.pff-cc-code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px;font-weight:600}',
      '.pff-cc-arr{width:9px;height:9px;color:var(--muted,#6B7590);transition:transform .18s;flex-shrink:0}',
      '.pff-cc[aria-expanded="true"] .pff-cc-arr{transform:rotate(180deg)}',
      '.pff-phone-input{flex:1 1 auto!important;min-width:0!important;width:auto!important;border-left:none!important;',
        'border-top-left-radius:0!important;border-bottom-left-radius:0!important;margin:0!important}',
      '.pff-phone.pff-bad .pff-cc{border-color:#C41E52!important}',

      '.pff-dd{position:absolute;top:calc(100% + 6px);left:0;width:340px;max-width:calc(100vw - 32px);',
        'background:#fff;border:1px solid var(--line,#E2E6EE);border-radius:12px;',
        'box-shadow:0 18px 50px rgba(20,28,51,.18),0 4px 12px rgba(20,28,51,.06);z-index:60;overflow:hidden}',
      '.pff-dd[hidden]{display:none}',
      '.pff-sw{padding:12px 14px;border-bottom:1px solid var(--line,#E2E6EE);display:flex;align-items:center;gap:8px;background:#F8F9FB}',
      '.pff-sw svg{width:14px;height:14px;color:var(--muted,#9BA3B5);flex-shrink:0}',
      '.pff-search{flex:1;border:none!important;background:transparent!important;outline:none!important;',
        'box-shadow:none!important;font-family:inherit;font-size:16px;color:var(--ink,#141C33);',
        'padding:4px 0!important;margin:0!important;height:auto!important;min-height:0!important}',
      '.pff-list{max-height:min(260px,45vh);overflow-y:auto;overscroll-behavior:contain;padding:6px 0;',
        'content-visibility:auto;contain-intrinsic-size:auto 260px}',
      '.pff-opt{display:flex!important;align-items:center!important;gap:10px;width:100%!important;max-width:none!important;',
        'padding:9px 16px!important;margin:0!important;background:none!important;border:none!important;',
        'border-radius:0!important;box-shadow:none!important;min-height:0!important;height:auto!important;',
        'font-family:inherit!important;font-size:13.5px!important;font-weight:400!important;letter-spacing:normal!important;',
        'text-transform:none!important;line-height:1.3!important;color:var(--text,#3A4A6B);text-align:left!important;',
        'cursor:pointer;transform:none!important}',
      '.pff-opt[hidden]{display:none!important}',
      '.pff-opt:hover,.pff-opt.pff-on{background:rgba(225,10,114,.06);color:var(--ink,#141C33)}',
      '.pff-opt img{width:24px;height:18px;object-fit:cover;border-radius:2px;flex-shrink:0;',
        'box-shadow:0 0 0 1px rgba(20,28,51,.1);background:#EEF0F4}',
      '.pff-opt .pff-nm{flex:1;min-width:0}',
      '.pff-opt .pff-cd{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;font-weight:600;',
        'color:var(--muted,#5A6478);background:#F0F2F6;border-radius:6px;padding:3px 8px;flex:none}',
      '.pff-empty{padding:18px 16px;text-align:center;font-size:12px;color:var(--muted,#9BA3B5)}',
      '.pff-empty[hidden]{display:none}',

      '.pff-sug-host{position:relative}',
      '.pff-sug{position:absolute;left:0;right:0;z-index:70;background:#fff;',
        'border:1px solid var(--line,#E2E6EE);border-radius:10px;overflow:hidden;',
        'box-shadow:0 14px 34px rgba(20,28,51,.14),0 2px 6px rgba(20,28,51,.06)}',
      '.pff-sug[hidden]{display:none}',
      '.pff-sug-opt{display:flex!important;align-items:baseline!important;gap:0!important;',
        'width:100%!important;max-width:none!important;padding:9px 12px!important;margin:0!important;',
        'border:none!important;background:none!important;border-radius:0!important;box-shadow:none!important;',
        'min-height:0!important;height:auto!important;font-family:inherit!important;font-size:14px!important;',
        'font-weight:400!important;letter-spacing:normal!important;text-transform:none!important;',
        'line-height:1.35!important;text-align:left!important;cursor:pointer;transform:none!important}',
      '.pff-sug-opt:hover,.pff-sug-opt.pff-on{background:rgba(225,10,114,.07)}',
      '.pff-sug-local{color:var(--muted,#6B7590)}',
      '.pff-sug-dom{font-weight:700;color:var(--ink,#141C33)}',
      '@media (pointer:coarse){.pff-sug-opt{padding-top:12px!important;padding-bottom:12px!important}}',
      '.pff-form-msg{display:none;margin:10px 0 0;font-size:12.5px;font-weight:600;line-height:1.45;color:#C41E52}',
      '.pff-form-msg.pff-show{display:block}',
      '.pff-msg{font-size:11.5px;line-height:1.45;margin-top:5px;display:none}',
      '.pff-msg.pff-show{display:block}',
      '.pff-msg.pff-t-bad{color:#C41E52}',
      '.pff-msg.pff-t-ok{color:#1A7A42;font-weight:600}',
      '.pff-msg.pff-t-checking{color:var(--muted,#9BA3B5)}',
      '.pff-bad{border-color:#C41E52!important}',
      /* narrow screens: pin the sheet to the field's full width */
      '@media (max-width:560px){.pff-dd{width:calc(100vw - 40px);left:auto;right:0}',
        '.pff-list{max-height:min(240px,40vh)}}',
      '@media (pointer:coarse){.pff-cc{min-height:44px}.pff-opt{padding-top:12px!important;padding-bottom:12px!important}}',
      '@media (prefers-reduced-motion:reduce){.pff-cc-arr{transition:none}}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'pf-forms-css';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  /* ═══════════ public API ═══════════ */
  function check(input) {
    var v = (input.value || '').trim();

    if (input.hasAttribute('data-pf-phone')) {
      if (!v) {
        if (input.hasAttribute('data-pf-required')) {
          markPhone(input, true);
          setMsg(input, 'bad', 'Please enter your mobile number.');
          return false;
        }
        markPhone(input, false); clearMsg(input); return true;
      }
      var country = input.__pffCountry || BY_ISO.US;
      if (!validatePhone(v, country)) {
        markPhone(input, true);
        setMsg(input, 'bad', phoneErrorFor(country));
        return false;
      }
      markPhone(input, false);
      /* Nothing to say when it is fine — say nothing. */
      clearMsg(input);
      return true;
    }

    if (input.hasAttribute('data-pf-email')) return paintEmail(input, true);
    return true;
  }
  function getPhone(input) {
    var v = (input.value || '').trim();
    if (!v) return '';
    if (v.charAt(0) === '+') return v;
    var c = input.__pffCountry;
    return c ? c.code + ' ' + v : v;
  }
  function getCountry(input) {
    var c = input.__pffCountry;
    return c ? c.iso : '';
  }

  /* ═══════════════════════════════════════════════════════════════════
     SUBMIT GUARD
     Nothing leaves a form while this file is showing a warning on it.

     WHY IT LIVES HERE AND NOT IN EACH FORM
     Every PF form was gating its own submit with its own copy of this
     logic, and each copy could go stale on its own. The quote modal's
     copy captured its <form> once at parse time; the header then
     re-renders (section hydration, and again on every theme-editor
     change), leaving that reference pointing at a detached node. Warning
     came from the live field — this file finds fields document-wide — but
     the gate was watching a form that no longer existed, so a wrong email
     or an empty required name went straight through. Enter made it worse,
     since implicit submission skips the button entirely.

     Bound to document in the CAPTURE phase, so no re-render can detach it
     and no other handler can stop it first. It early-returns on any form
     with no marked fields, so the theme's own forms are untouched.
     ═══════════════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════════════
     CHECKSUM / ANTI-BOT

     Applied to every form this file guards — the quote modal, the mockup
     modal and the contact form — rather than being hand-written into each
     one. Three gates:

       1. Honeypot. A field only a script can see, injected here so no
          template has to remember it. Filled = not a person.
       2. Floor on time-to-submit. Nobody reads a form and completes it in
          under three seconds; a script does it in milliseconds.
       3. A token over the arming timestamp and the email, written into
          contact[Verification] when all three pass.

     BE CLEAR ABOUT WHAT THIS BUYS YOU
     Every genuine submission arrives carrying a Verification line, so
     anything in your inbox WITHOUT one was POSTed straight at Shopify by
     something that never ran this page's JavaScript. Spam becomes
     filterable at a glance, and the timestamp tells you how long they
     spent filling it in.

     What it cannot do is STOP that direct POST — no client-side check
     can, because the verifying code would have to run on a server we do
     not control. For that, switch on Shopify's own captcha in
     Settings → Customer privacy. This layer stops form-filler bots and
     labels everything else.
     ═══════════════════════════════════════════════════════════════════ */
  var MIN_SECONDS = 3;

  function fnv(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(36);
  }

  /* Give a form its honeypot, its verification field and its clock. */
  function armForm(form) {
    if (!form || form.__pfArmed) return;
    form.__pfArmed = Date.now();

    if (!form.querySelector('[data-pf-hp]')) {
      var hp = document.createElement('div');
      hp.setAttribute('aria-hidden', 'true');
      /* Off-screen rather than display:none — a bot that skips hidden
         inputs will still fill this one. */
      hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
      hp.innerHTML =
        '<label>Website<input type="text" name="pf_website" data-pf-hp tabindex="-1" autocomplete="off"></label>';
      form.appendChild(hp);
    }

    /* Reuse the page's own field when a template already provides one, so
       a form never ends up submitting two Verification values. */
    if (!form.querySelector('[data-pf-verify], [data-pfc-check], input[name="contact[Verification]"]')) {
      var v = document.createElement('input');
      v.type = 'hidden';
      v.name = 'contact[Verification]';
      v.setAttribute('data-pf-verify', '');
      form.appendChild(v);
    }
  }

  function formMsgNode(form) {
    var m = form.querySelector('.pff-form-msg');
    if (!m) {
      m = document.createElement('p');
      m.className = 'pff-form-msg';
      m.setAttribute('role', 'alert');
      form.appendChild(m);
    }
    return m;
  }

  function formMsg(form, text) {
    var m = formMsgNode(form);
    m.textContent = text || '';
    m.className = text ? 'pff-form-msg pff-show' : 'pff-form-msg';
  }

  /* { ok, silent, msg }. Stamps the verification field when it passes. */
  function checksum(form) {
    var hp = form.querySelector('[data-pf-hp]');
    if (hp && (hp.value || '').trim() !== '') return { ok: false, silent: true };

    var started = form.__pfArmed || Date.now();
    var elapsed = (Date.now() - started) / 1000;
    if (elapsed < MIN_SECONDS) {
      return { ok: false, msg: 'That was quicker than a person can type — give it a moment and send again.' };
    }

    var email = form.querySelector('[data-pf-email]');
    var token = fnv(String(started) + '|' + ((email && email.value) || ''));
    var field = form.querySelector('[data-pf-verify], [data-pfc-check], input[name="contact[Verification]"]');
    if (field) field.value = 'ok · ' + elapsed.toFixed(1) + 's · ' + token;

    return { ok: true };
  }

  /* Returns true when this form must NOT be allowed to send, painting the
     messages and focusing the first offender on the way. */
  function shouldBlock(form) {
    if (!form || form.nodeType !== 1 || form.tagName !== 'FORM') return false;

    var fields = form.querySelectorAll(SEL);
    if (!fields.length) return false;                 /* not one of ours */

    var ok = true;

    /* These forms carry novalidate so our messages replace the browser's
       bubbles — which also switches off its `required` enforcement. That
       makes required OUR job: without this, a starred-but-empty Name did
       nothing at all. */
    if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
      ok = false;
      if (typeof form.reportValidity === 'function') form.reportValidity();
    }

    Array.prototype.forEach.call(fields, function (el) {
      if (!check(el)) ok = false;
    });

    /* A warning already on screen always wins. check() cannot see the
       email domain result: scheduleMX() paints that verdict up to a second
       after check() has returned true for a well-formed address. */
    if (form.querySelector('.pff-msg.pff-t-bad')) ok = false;

    /* Checksum last, so a bot never learns which field it got wrong — and
       so a real person sees their field errors before this one. */
    if (ok) {
      var cs = checksum(form);
      if (!cs.ok) {
        ok = false;
        formMsg(form, cs.silent ? '' : cs.msg);
      } else {
        formMsg(form, '');
      }
    }

    if (ok) return false;

    /* Land the cursor on the problem rather than leaving people to hunt. */
    var first = form.querySelector('.pff-bad') || form.querySelector(':invalid');
    if (first && typeof first.focus === 'function') {
      try { first.focus({ preventScroll: false }); } catch (e) { first.focus(); }
    }
    return true;
  }

  function stop(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function formOf(node) {
    while (node && node.nodeType === 1) {
      if (node.tagName === 'FORM') return node;
      node = node.parentNode;
    }
    return null;
  }

  /* THREE LAYERS, ON window, IN CAPTURE
     ────────────────────────────────────────────────────────────────────
     A single submit listener on `document` was not enough, and this is why
     the quote form kept sending after showing its warning:

       · Capture listeners fire in registration order on the same node.
         The theme's JS loads at page load; this file is fetched lazily
         when the quote modal first opens — so the theme's document-level
         handler is registered FIRST. If it calls stopImmediatePropagation
         (themes do, to take a form over for AJAX), a later document
         listener never runs at all.
         Moving to `window` puts us ahead of every document-level listener,
         because capture travels window -> document -> … -> form.

       · Blocking the click and the Enter key as well means the submit
         event need never be created. That also covers a handler that
         calls form.submit() directly, which fires NO submit event and
         cannot be cancelled once reached.
     ──────────────────────────────────────────────────────────────────── */
  function guardSubmit(event) {
    if (shouldBlock(event.target)) stop(event);
  }

  function guardClick(event) {
    var el = event.target;
    var btn = el && el.closest ? el.closest('button, input[type="submit"], input[type="image"]') : null;
    if (!btn) return;
    /* type defaults to submit on <button> inside a form */
    if (btn.tagName === 'BUTTON' && btn.type && btn.type !== 'submit') return;
    if (shouldBlock(btn.form || formOf(btn))) stop(event);
  }

  function guardEnter(event) {
    if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey) return;

    var el = event.target;
    if (!el || !el.form) return;                      /* not a form field */
    if (el.tagName === 'TEXTAREA') return;            /* Enter is a newline */
    /* Our own country filter lives inside the customer's form; Enter there
       means "pick the top match", not "submit", and must not paint errors. */
    if (el.classList && el.classList.contains('pff-search')) return;
    /* An open domain-suggestion list owns Enter — it means "take this
       address". Without this the guard would stopImmediatePropagation and
       the suggestion could never be accepted with the keyboard. */
    if (el.getAttribute && el.getAttribute('aria-expanded') === 'true' && el.hasAttribute('data-pf-email')) return;

    if (shouldBlock(el.form)) stop(event);
  }

  var seq = 0;
  function init(root) {
    var scope = (root && root.querySelectorAll) ? root : document;
    var fields = scope.querySelectorAll(SEL);
    if (!fields.length) return;
    injectCSS();
    Array.prototype.forEach.call(fields, function (el) {
      /* Arm the owning form every pass, not just on first enhance: after a
         re-render the fields are new nodes in a new form element. */
      if (el.form) armForm(el.form);

      if (el.__pffInit) return;
      el.__pffInit = 1;
      el.__pffId = 'f' + (seq++);
      if (el.hasAttribute('data-pf-email')) enhanceEmail(el);
      else enhancePhone(el);
    });
  }

  window.PFForms = {
    /* Bump on every change to the guard. In the console, `PFForms.version`
       tells you instantly whether the asset the browser is running is the
       one you just pasted, or a cached older copy — no more guessing at
       whether a fix is live. */
    version: 6,
    /* Exposed so the suggestion list can be tested without a browser. */
    suggest: suggestFor,
    /* True if this form would be blocked right now. For diagnosing a form
       that sends when it should not: PFForms.willBlock(document.querySelector('.pf-quote-form')) */
    willBlock: shouldBlock,
    init: init,
    warm: warm,
    geo: detectGeo,
    geoCache: geoCache,
    check: check,
    getPhone: getPhone,
    getCountry: getCountry,
    setMsg: setMsg,
    clearMsg: clearMsg,
    countries: COUNTRIES
  };

  window.addEventListener('submit', guardSubmit, true);
  window.addEventListener('click', guardClick, true);
  window.addEventListener('keydown', guardEnter, true);

  /* ═══════════════════════════════════════════════════════════════════
     RE-ENHANCE WHEN THE DOM CHANGES

     This is why the country flag and the email checks kept disappearing.
     init() enhanced the fields once, on load. The header then RE-RENDERS
     itself — Horizon's section hydration runs after load, and the theme
     editor re-renders on every change — which throws those enhanced
     inputs away and inserts brand-new ones in their place. The new nodes
     have never been enhanced: no picker, no flag, no messages, nothing.
     init() had already run and had no reason to run again.

     shopify:section:load below covers the theme editor but NOT hydration,
     so on the live site the form quietly lost its validation.

     Watching for inserted nodes catches every case — hydration, the
     editor, a modal injected later, anything. __pffInit means a field is
     never enhanced twice, and the debounce keeps this cheap: enhancing a
     field itself inserts nodes, so without it this would chase its own
     tail.
     ═══════════════════════════════════════════════════════════════════ */
  var reinitTimer = null;
  function watchDom() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes && records[i].addedNodes.length) {
          if (reinitTimer) return;
          reinitTimer = setTimeout(function () {
            reinitTimer = null;
            init();
          }, 60);
          return;
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    init();
    watchDom();
  }

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
  document.addEventListener('shopify:section:load', function (e) { init(e.target || document); });
})();
