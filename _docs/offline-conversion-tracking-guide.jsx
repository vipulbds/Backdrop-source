import { useState, useEffect } from "react";

const TABS = ["Overview", "Shopify Code", "GTM Setup", "Database Schema", "CSV Upload", "Automation", "Checklist"];

const CODE_BLOCKS = {
  step1_gclid_capture: `<!-- ============================================
  STEP 1: MASTER GCLID CAPTURE SCRIPT
  Paste in theme.liquid inside <head>
  Captures: gclid, gbraid, wbraid, fbclid, msclkid, li_fat_id
============================================ -->
<script>
(function() {
  'use strict';

  // ---- Cookie helpers ----
  function setCookie(name, value, days) {
    if (!value) return;
    var expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; expires=' + expires.toUTCString() +
      '; path=/; SameSite=Lax; Secure';
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : '';
  }

  function getParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch(e) { return ''; }
  }

  // ---- Capture all click IDs ----
  var ids = {
    gclid:      getParam('gclid'),
    gbraid:     getParam('gbraid'),
    wbraid:     getParam('wbraid'),
    fbclid:     getParam('fbclid'),
    msclkid:    getParam('msclkid'),
    li_fat_id:  getParam('li_fat_id'),
    utm_source:   getParam('utm_source'),
    utm_medium:   getParam('utm_medium'),
    utm_campaign: getParam('utm_campaign'),
    utm_content:  getParam('utm_content'),
    landing_page: window.location.href
  };

  // Store in cookies for 90 days
  // Only overwrite if new value present (preserve original click)
  Object.keys(ids).forEach(function(key) {
    if (ids[key] && !getCookie('bs_' + key)) {
      setCookie('bs_' + key, ids[key], 90);
    }
    // Always update landing page
    if (key === 'landing_page') {
      setCookie('bs_landing_page', ids[key], 90);
    }
  });

  // Also store in sessionStorage as backup
  try {
    if (ids.gclid)   sessionStorage.setItem('bs_gclid', ids.gclid);
    if (ids.gbraid)  sessionStorage.setItem('bs_gbraid', ids.gbraid);
    if (ids.wbraid)  sessionStorage.setItem('bs_wbraid', ids.wbraid);
  } catch(e) {}

  // ---- Global getter for all tracking data ----
  window.BSTracking = {
    get: function() {
      return {
        gclid:        getCookie('bs_gclid')      || sessionStorage.getItem('bs_gclid') || '',
        gbraid:       getCookie('bs_gbraid')     || sessionStorage.getItem('bs_gbraid') || '',
        wbraid:       getCookie('bs_wbraid')     || sessionStorage.getItem('bs_wbraid') || '',
        fbclid:       getCookie('bs_fbclid')     || '',
        msclkid:      getCookie('bs_msclkid')    || '',
        li_fat_id:    getCookie('bs_li_fat_id')  || '',
        utm_source:   getCookie('bs_utm_source')   || '',
        utm_medium:   getCookie('bs_utm_medium')   || '',
        utm_campaign: getCookie('bs_utm_campaign') || '',
        landing_page: getCookie('bs_landing_page') || ''
      };
    },
    hasAdClick: function() {
      var t = this.get();
      return !!(t.gclid || t.gbraid || t.wbraid || t.fbclid || t.msclkid || t.li_fat_id);
    }
  };

  window.dataLayer = window.dataLayer || [];
})();
</script>`,

  step2_hidden_fields: `<!-- ============================================
  STEP 2: HIDDEN FIELDS + FORM TRACKING
  Paste in theme.liquid before </body>
  Populates hidden gclid fields on ALL forms
============================================ -->
<script>
document.addEventListener('DOMContentLoaded', function() {

  var APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL'; // Replace after Step 4

  // ---- Populate hidden fields on all forms ----
  function populateHiddenFields() {
    var tracking = window.BSTracking ? window.BSTracking.get() : {};
    var fields = {
      'gclid':        tracking.gclid,
      'gbraid':       tracking.gbraid,
      'wbraid':       tracking.wbraid,
      'fbclid':       tracking.fbclid,
      'msclkid':      tracking.msclkid,
      'li_fat_id':    tracking.li_fat_id,
      'utm_source':   tracking.utm_source,
      'utm_medium':   tracking.utm_medium,
      'utm_campaign': tracking.utm_campaign,
      'landing_page': tracking.landing_page
    };

    Object.keys(fields).forEach(function(fieldName) {
      var existing = document.querySelectorAll('input[name="' + fieldName + '"]');
      existing.forEach(function(el) {
        if (fields[fieldName]) el.value = fields[fieldName];
      });
    });
  }

  populateHiddenFields();

  // ---- Fire conversion on form submit ----
  function fireConversion(conversionName, formEl) {
    var tracking = window.BSTracking ? window.BSTracking.get() : {};
    if (!window.BSTracking || !window.BSTracking.hasAdClick()) return;

    var payload = {
      conversion_name: conversionName,
      timestamp: new Date().toISOString(),
      page_url: window.location.href,
      // Customer data
      email:   getFieldVal(formEl, ['email', 'contact[email]', 'Email']),
      name:    getFieldVal(formEl, ['name', 'contact[name]', 'Name', 'full_name']),
      phone:   getFieldVal(formEl, ['phone', 'contact[phone]', 'Phone']),
      message: getFieldVal(formEl, ['body', 'contact[body]', 'message', 'Message']),
      // All tracking IDs
      gclid:        tracking.gclid,
      gbraid:       tracking.gbraid,
      wbraid:       tracking.wbraid,
      fbclid:       tracking.fbclid,
      msclkid:      tracking.msclkid,
      li_fat_id:    tracking.li_fat_id,
      utm_source:   tracking.utm_source,
      utm_medium:   tracking.utm_medium,
      utm_campaign: tracking.utm_campaign,
      landing_page: tracking.landing_page
    };

    // Push to GTM
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'bs_offline_conversion',
      conversion_name: conversionName,
      gclid: tracking.gclid,
      gbraid: tracking.gbraid,
      customer_email: payload.email
    });

    // Send to Apps Script (Google Sheet database)
    if (APPS_SCRIPT_URL !== 'YOUR_APPS_SCRIPT_URL') {
      navigator.sendBeacon(APPS_SCRIPT_URL, JSON.stringify(payload));
    }

    console.log('[BS Tracking] Conversion fired:', payload);
  }

  function getFieldVal(form, names) {
    for (var i = 0; i < names.length; i++) {
      var el = form.querySelector(
        'input[name="' + names[i] + '"], textarea[name="' + names[i] + '"], select[name="' + names[i] + '"]'
      );
      if (el && el.value) return el.value;
    }
    return '';
  }

  // ---- CHECKPOINT 1: Quote Request Form ----
  bindForm(['#quote-form', '.quote-request-form', 'form.quote', '[data-form="quote"]'],
    'Quote Request');

  // ---- CHECKPOINT 2: Free 2D Mockup Form ----
  bindForm(['#mockup-form', '.mockup-form', 'form.mockup', '[data-form="mockup"]', '#2d-mockup-form'],
    'Free 2D Mockup');

  // ---- CHECKPOINT 3: Contact Us Form ----
  bindForm(['#contact-form', 'form[action="/contact"]', '.contact-form', '#ContactForm'],
    'Contact Us');

  // ---- CHECKPOINT 4: Custom Inquiry Form ----
  bindForm(['#inquiry-form', '.inquiry-form', 'form.inquiry', '[data-form="inquiry"]'],
    'Custom Inquiry');

  // ---- CHECKPOINT 5: Add to Cart ----
  document.querySelectorAll(
    '[name="add"], #AddToCart, .btn-add-to-cart, .product-form__submit, [data-testid="add-to-cart"]'
  ).forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!window.BSTracking || !window.BSTracking.hasAdClick()) return;
      var tracking = window.BSTracking.get();
      var productTitle = '';
      if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
        productTitle = window.ShopifyAnalytics.meta.product.title || '';
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'bs_offline_conversion',
        conversion_name: 'Add To Cart',
        gclid: tracking.gclid,
        product_name: productTitle
      });
    });
  });

  // ---- CHECKPOINT 6: Phone click ----
  document.querySelectorAll('a[href^="tel:"]').forEach(function(link) {
    link.addEventListener('click', function() {
      if (window.BSTracking && window.BSTracking.hasAdClick()) {
        window.dataLayer.push({ event: 'bs_offline_conversion', conversion_name: 'Phone Click' });
      }
    });
  });

  // ---- CHECKPOINT 7: WhatsApp click ----
  document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach(function(link) {
    link.addEventListener('click', function() {
      if (window.BSTracking && window.BSTracking.hasAdClick()) {
        window.dataLayer.push({ event: 'bs_offline_conversion', conversion_name: 'WhatsApp Click' });
      }
    });
  });

  function bindForm(selectors, conversionName) {
    selectors.forEach(function(sel) {
      var form = document.querySelector(sel);
      if (form) {
        form.addEventListener('submit', function() {
          fireConversion(conversionName, form);
        });
      }
    });
  }

});
</script>`,

  step3_liquid_snippet: `<!-- ============================================
  STEP 3: HIDDEN FIELDS SNIPPET
  Create a new snippet: snippets/bs-tracking-fields.liquid
  Include inside every form: {% render 'bs-tracking-fields' %}
============================================ -->

<!-- Backdropsource Ad Tracking Hidden Fields -->
<input type="hidden" name="gclid"        id="bs_gclid"        value="">
<input type="hidden" name="gbraid"       id="bs_gbraid"       value="">
<input type="hidden" name="wbraid"       id="bs_wbraid"       value="">
<input type="hidden" name="fbclid"       id="bs_fbclid"       value="">
<input type="hidden" name="msclkid"      id="bs_msclkid"      value="">
<input type="hidden" name="li_fat_id"    id="bs_li_fat_id"    value="">
<input type="hidden" name="utm_source"   id="bs_utm_source"   value="">
<input type="hidden" name="utm_medium"   id="bs_utm_medium"   value="">
<input type="hidden" name="utm_campaign" id="bs_utm_campaign" value="">
<input type="hidden" name="landing_page" id="bs_landing_page" value="">`,

  apps_script: `// ============================================
// GOOGLE APPS SCRIPT - MASTER DATABASE
// Deploy as Web App → Anyone → Execute as Me
// ============================================

var SPREADSHEET_ID = 'YOUR_GOOGLE_SHEET_ID';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Route to correct sheet based on event type
    if (data.event_type === 'draft_order_paid') {
      return logDraftOrder(ss, data);
    } else {
      return logLead(ss, data);
    }
  } catch(err) {
    return respond({ status: 'error', message: err.toString() });
  }
}

// ---- LOG LEAD ----
function logLead(ss, data) {
  var sheet = getOrCreateSheet(ss, 'Leads');

  if (sheet.getLastRow() === 0) {
    var headers = [
      'Lead ID', 'Timestamp', 'Conversion Name',
      'Name', 'Email', 'Phone', 'Message',
      'GCLID', 'GBRAID', 'WBRAID',
      'FBCLID', 'MSCLKID', 'LI_FAT_ID',
      'UTM Source', 'UTM Medium', 'UTM Campaign',
      'Landing Page',
      'Draft Order ID',    // Sales team fills
      'Draft Order Paid',  // Sales team fills
      'Google Uploaded', 'Meta Uploaded', 'Bing Uploaded', 'LinkedIn Uploaded'
    ];
    sheet.appendRow(headers);
    styleHeader(sheet, headers.length);
  }

  // Check duplicate by email + conversion name (within 1 hour)
  var existing = sheet.getDataRange().getValues();
  var oneHourAgo = new Date(Date.now() - 3600000);
  for (var i = 1; i < existing.length; i++) {
    if (existing[i][4] === data.email &&
        existing[i][2] === data.conversion_name &&
        new Date(existing[i][1]) > oneHourAgo) {
      return respond({ status: 'duplicate' });
    }
  }

  var leadId = 'L-' + Date.now();
  var formatted = formatTime(data.timestamp);

  sheet.appendRow([
    leadId, formatted, data.conversion_name || '',
    data.name || '', data.email || '', data.phone || '', data.message || '',
    data.gclid || '', data.gbraid || '', data.wbraid || '',
    data.fbclid || '', data.msclkid || '', data.li_fat_id || '',
    data.utm_source || '', data.utm_medium || '', data.utm_campaign || '',
    data.landing_page || '',
    '', '', // Draft Order ID + Paid
    'NO', 'NO', 'NO', 'NO' // Upload statuses
  ]);

  return respond({ status: 'success', lead_id: leadId });
}

// ---- LOG DRAFT ORDER (called when paid) ----
function logDraftOrder(ss, data) {
  var sheet = getOrCreateSheet(ss, 'Draft Orders');

  if (sheet.getLastRow() === 0) {
    var headers = [
      'Draft Order ID', 'Lead ID', 'Paid Timestamp',
      'Revenue', 'Currency', 'Customer Email', 'Customer Name',
      'GCLID', 'GBRAID', 'WBRAID',
      'Google Uploaded', 'Meta Uploaded', 'Bing Uploaded', 'LinkedIn Uploaded',
      'Upload Timestamp'
    ];
    sheet.appendRow(headers);
    styleHeader(sheet, headers.length);
  }

  // Deduplication — never upload same Draft Order twice
  var existing = sheet.getDataRange().getValues();
  for (var i = 1; i < existing.length; i++) {
    if (existing[i][0] === data.draft_order_id) {
      return respond({ status: 'duplicate', message: 'Draft Order already logged' });
    }
  }

  sheet.appendRow([
    data.draft_order_id || '',
    data.lead_id || '',
    formatTime(data.paid_at),
    data.revenue || 0,
    data.currency || 'INR',
    data.email || '',
    data.name || '',
    data.gclid || '',
    data.gbraid || '',
    data.wbraid || '',
    'NO', 'NO', 'NO', 'NO', ''
  ]);

  return respond({ status: 'success' });
}

// ---- EXPORT: Google Ads CSV ----
function exportGoogleAdsCSV() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Draft Orders');
  if (!sheet) return;

  var exportSheet = getOrCreateSheet(ss, 'Export - Google Ads');
  exportSheet.clearContents();

  exportSheet.appendRow(['Parameters:EntityType=OFFLINECONVERSION;TimeZone=Asia/Kolkata;']);
  exportSheet.appendRow([
    'Google Click ID', 'Conversion Name', 'Conversion Time',
    'Conversion Value', 'Conversion Currency', 'Order ID'
  ]);

  var data = sheet.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var gclid  = data[i][7];
    var gbraid = data[i][8];
    var wbraid = data[i][9];
    var clickId = gclid || gbraid || wbraid;
    if (clickId && data[i][10] === 'NO') {
      exportSheet.appendRow([
        clickId,
        'Draft Order Sale',
        data[i][2],
        data[i][3],
        data[i][4],
        data[i][0]
      ]);
      // Mark as uploaded
      sheet.getRange(i + 1, 11).setValue('YES');
      sheet.getRange(i + 1, 15).setValue(new Date().toISOString());
      count++;
    }
  }
  Logger.log('Google Ads: exported ' + count + ' conversions');
}

// ---- EXPORT: Meta CSV ----
function exportMetaCSV() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Draft Orders');
  if (!sheet) return;

  var exportSheet = getOrCreateSheet(ss, 'Export - Meta');
  exportSheet.clearContents();
  exportSheet.appendRow(['event_name','event_time','em','ph','fbclid','action_source','value','currency','order_id']);

  var data = sheet.getDataRange().getValues();
  // Also pull fbclid from Leads sheet
  var leadsSheet = ss.getSheetByName('Leads');
  var leadsData  = leadsSheet ? leadsSheet.getDataRange().getValues() : [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][11] === 'NO') {
      var email = data[i][5];
      var fbclid = '';
      // Look up fbclid from leads by email
      for (var j = 1; j < leadsData.length; j++) {
        if (leadsData[j][4] === email) { fbclid = leadsData[j][10]; break; }
      }
      var unixTime = Math.floor(new Date(data[i][2]).getTime() / 1000);
      exportSheet.appendRow([
        'PURCHASE', unixTime,
        hashEmail(email),
        data[i][6] || '',
        fbclid, 'website',
        data[i][3], data[i][4], data[i][0]
      ]);
      sheet.getRange(i + 1, 12).setValue('YES');
    }
  }
}

// ---- EXPORT: Bing CSV ----
function exportBingCSV() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Draft Orders');
  if (!sheet) return;

  var exportSheet = getOrCreateSheet(ss, 'Export - Bing');
  exportSheet.clearContents();
  exportSheet.appendRow(['Microsoft Click ID','Conversion Name','Conversion Time','Conversion Value','Conversion Currency','Order ID']);

  var data = sheet.getDataRange().getValues();
  var leadsSheet = ss.getSheetByName('Leads');
  var leadsData  = leadsSheet ? leadsSheet.getDataRange().getValues() : [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][12] === 'NO') {
      var email = data[i][5];
      var msclkid = '';
      for (var j = 1; j < leadsData.length; j++) {
        if (leadsData[j][4] === email) { msclkid = leadsData[j][11]; break; }
      }
      if (msclkid) {
        exportSheet.appendRow([msclkid,'Draft Order Sale',data[i][2],data[i][3],data[i][4],data[i][0]]);
        sheet.getRange(i + 1, 13).setValue('YES');
      }
    }
  }
}

// ---- EXPORT: LinkedIn CSV ----
function exportLinkedInCSV() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Draft Orders');
  if (!sheet) return;

  var exportSheet = getOrCreateSheet(ss, 'Export - LinkedIn');
  exportSheet.clearContents();
  exportSheet.appendRow(['conversionHappenedAt','conversionType','emailAddress','linkedInClickId','amount','currencyCode','orderId']);

  var data = sheet.getDataRange().getValues();
  var leadsSheet = ss.getSheetByName('Leads');
  var leadsData  = leadsSheet ? leadsSheet.getDataRange().getValues() : [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][13] === 'NO') {
      var email = data[i][5];
      var liId = '';
      for (var j = 1; j < leadsData.length; j++) {
        if (leadsData[j][4] === email) { liId = leadsData[j][12]; break; }
      }
      var unixMs = new Date(data[i][2]).getTime();
      exportSheet.appendRow([unixMs,'PURCHASE',email,liId,data[i][3],data[i][4],data[i][0]]);
      sheet.getRange(i + 1, 14).setValue('YES');
    }
  }
}

// ---- Run all exports ----
function exportAllPlatforms() {
  exportGoogleAdsCSV();
  exportMetaCSV();
  exportBingCSV();
  exportLinkedInCSV();
  Logger.log('All platform exports complete');
}

// ---- Helpers ----
function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function formatTime(ts) {
  return Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ssZ");
}

function styleHeader(sheet, colCount) {
  sheet.getRange(1, 1, 1, colCount)
    .setBackground('#1a1a2e').setFontColor('#ffffff')
    .setFontWeight('bold').setFrozenRows(1);
}

function hashEmail(email) {
  // SHA-256 hash for Meta enhanced matching
  var raw = email.toLowerCase().trim();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return bytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`,

  zapier_webhook: `// ============================================
// ZAPIER / MAKE.COM AUTOMATION
// Trigger: Shopify Draft Order → Status becomes "paid"
// Action: POST to your Apps Script endpoint
// ============================================

// Zapier "Code by Zapier" step — paste this:
const draftOrder = inputData.draft_order;

// Look up GCLID from your Leads sheet
// (Add a Zapier "Lookup Spreadsheet Row" step before this
//  to find the row matching customer email)
const gclid     = inputData.gclid_from_sheet     || '';
const gbraid    = inputData.gbraid_from_sheet    || '';
const wbraid    = inputData.wbraid_from_sheet    || '';
const lead_id   = inputData.lead_id_from_sheet   || '';

const payload = {
  event_type:     'draft_order_paid',
  draft_order_id: draftOrder.name,             // e.g. DO-1001
  lead_id:        lead_id,
  paid_at:        draftOrder.updated_at,
  revenue:        parseFloat(draftOrder.total_price),
  currency:       draftOrder.currency,
  email:          draftOrder.email,
  name:           draftOrder.billing_address
                    ? draftOrder.billing_address.name
                    : '',
  gclid:          gclid,
  gbraid:         gbraid,
  wbraid:         wbraid
};

// POST to Apps Script
const response = await fetch('YOUR_APPS_SCRIPT_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

const result = await response.json();
output = { status: result.status, draft_order_id: payload.draft_order_id };`,

  gtm_config: `// ============================================
// GTM CONFIGURATION GUIDE
// ============================================

// ---- VARIABLE 1: GCLID from Cookie ----
// Type: 1st Party Cookie
// Cookie Name: bs_gclid
// Variable Name: Cookie - BS GCLID

// ---- VARIABLE 2: GBRAID from Cookie ----
// Type: 1st Party Cookie
// Cookie Name: bs_gbraid
// Variable Name: Cookie - BS GBRAID

// ---- VARIABLE 3: WBRAID from Cookie ----
// Type: 1st Party Cookie
// Cookie Name: bs_wbraid
// Variable Name: Cookie - BS WBRAID

// ---- VARIABLE 4: DataLayer - Conversion Name ----
// Type: Data Layer Variable
// Variable Name: DLV - Conversion Name
// Data Layer Variable Name: conversion_name

// ---- VARIABLE 5: DataLayer - Customer Email ----
// Type: Data Layer Variable
// Variable Name: DLV - Customer Email
// Data Layer Variable Name: customer_email

// ---- TRIGGER 1: All BS Conversions ----
// Type: Custom Event
// Event Name: bs_offline_conversion
// Name: Custom Event - BS Offline Conversion

// ---- TRIGGER 2: Quote Request ----
// Type: Custom Event
// Event Name: bs_offline_conversion
// Conditions: conversion_name equals Quote Request

// ---- TAG 1: Google Ads - Draft Order Sale ----
// Type: Google Ads Conversion Tracking
// Conversion ID: [from Google Ads]
// Conversion Label: [from Google Ads]
// Conversion Name: Draft Order Sale
// Provide GCLID: {{Cookie - BS GCLID}}
// Firing Trigger: Custom Event - BS Offline Conversion

// ---- TAG 2: Google Ads Enhanced Conversions ----
// Type: Google Ads Enhanced Conversions
// Email: {{DLV - Customer Email}}
// Firing: same trigger

// ---- TAG 3: Meta Pixel - Lead ----
// Type: Custom HTML
const metaTag = \`
<script>
fbq('track', 'Lead', {
  content_name: '{{DLV - Conversion Name}}',
  content_category: 'Ad Lead'
});
<\/script>
\`;

// ---- TAG 4: Microsoft UET - Goal ----
// Type: Microsoft Advertising UET Event
// Goal Name: Draft Order Sale
// Event Value: dynamic`
};

const CSV_EXAMPLES = {
  google: `Parameters:EntityType=OFFLINECONVERSION;TimeZone=Asia/Kolkata;

Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID
ABC123XYZgoogle001,Draft Order Sale,2026-06-12 15:30:00+05:30,45000,INR,DO-1001
DEF456UVWgoogle002,Draft Order Sale,2026-06-13 11:00:00+05:30,32000,INR,DO-1002
GHI789RST003,Draft Order Sale,2026-06-14 09:15:00+05:30,28500,USD,DO-1003`,

  meta: `event_name,event_time,em,ph,fbclid,action_source,value,currency,order_id
PURCHASE,1749724200,a665a45920422f9d417e4867efdc4fb8f04e1053a8d30d5d6b8e19dff1e4b29,+911234567890,FB_CLICK_001,website,45000,INR,DO-1001
PURCHASE,1749810600,b3a8e0e1f9ab1bdb4475f4ef31e57e6fdfc8a7f5e1e4e7b3b9e2d4c6a8f0e2,+911234567891,FB_CLICK_002,website,32000,INR,DO-1002`,

  bing: `Microsoft Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID
BING_MSCLKID_001,Draft Order Sale,2026-06-12 15:30:00+05:30,45000,INR,DO-1001
BING_MSCLKID_002,Draft Order Sale,2026-06-13 11:00:00+05:30,32000,INR,DO-1002`,

  linkedin: `conversionHappenedAt,conversionType,emailAddress,linkedInClickId,amount,currencyCode,orderId
1749724200000,PURCHASE,customer@email.com,LI_FAT_ID_001,45000,INR,DO-1001
1749810600000,PURCHASE,customer2@email.com,LI_FAT_ID_002,32000,INR,DO-1002`
};

const CHECKLIST_ITEMS = [
  { phase: "Google Ads Setup", items: [
    "Enable Auto-tagging in Google Ads Account Settings",
    "Create conversion action 'Draft Order Sale' — Category: Purchase",
    "Set conversion value to Dynamic",
    "Set Count to One",
    "Mark 'Draft Order Sale' as Primary conversion",
    "Create secondary conversions: Quote Request, Free 2D Mockup, Contact Us, Add to Cart",
    "Set attribution window to 90 days for Draft Order Sale"
  ]},
  { phase: "Shopify Code", items: [
    "Add Master GCLID Capture Script to theme.liquid <head>",
    "Add Form Tracking Script to theme.liquid before </body>",
    "Create snippets/bs-tracking-fields.liquid",
    "Add {% render 'bs-tracking-fields' %} to Quote Request form",
    "Add {% render 'bs-tracking-fields' %} to 2D Mockup form",
    "Add {% render 'bs-tracking-fields' %} to Contact Us form",
    "Add {% render 'bs-tracking-fields' %} to Custom Inquiry form",
    "Test: click ad link, check cookie in browser DevTools → Application → Cookies"
  ]},
  { phase: "GTM Setup", items: [
    "Install GTM head + body snippets in theme.liquid",
    "Create Cookie variables: bs_gclid, bs_gbraid, bs_wbraid",
    "Create DataLayer variables: conversion_name, customer_email",
    "Create trigger: Custom Event 'bs_offline_conversion'",
    "Create Google Ads Conversion tag — Draft Order Sale",
    "Create Enhanced Conversions tag",
    "Create Meta Pixel Lead tag",
    "Create Bing UET tag",
    "Test in GTM Preview Mode",
    "Publish GTM container"
  ]},
  { phase: "Database (Apps Script)", items: [
    "Create Google Sheet with Leads + Draft Orders tabs",
    "Deploy Apps Script as Web App",
    "Set execution to 'Me', access to 'Anyone'",
    "Copy Web App URL → paste into APPS_SCRIPT_URL in Shopify script",
    "Set daily trigger for exportAllPlatforms() function",
    "Test: submit a form → verify row appears in Leads sheet"
  ]},
  { phase: "Automation (Zapier/Make)", items: [
    "Create Zap: Trigger = Shopify Draft Order paid",
    "Add step: Lookup row in Leads sheet by customer email",
    "Add step: POST payload to Apps Script URL",
    "Test with a real Draft Order payment",
    "Verify row appears in Draft Orders sheet with GCLID"
  ]},
  { phase: "Upload & Verify", items: [
    "Upload first test CSV to Google Ads → Goals → Conversions → Import",
    "Check Google Ads for 'Draft Order Sale' conversions (24-48hrs)",
    "Upload Meta CSV via Events Manager → Offline Events",
    "Upload Bing CSV via Microsoft Ads → Offline Conversions",
    "Upload LinkedIn CSV via Campaign Manager → Offline Conversions",
    "Verify attribution rate > 80% (GCLID match rate)",
    "Set up weekly reminder to upload CSVs (or automate via Zapier)"
  ]},
  { phase: "Monitoring", items: [
    "Check missing GCLID rate weekly (should be < 20%)",
    "Monitor Google Ads conversion dashboard",
    "Verify Smart Bidding is receiving signals",
    "Set alert if upload fails",
    "Check for duplicate Draft Order IDs monthly"
  ]}
];

export default function BackdropsourceOCT() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [activeCode, setActiveCode] = useState("step1_gclid_capture");
  const [activePlatform, setActivePlatform] = useState("google");
  const [checkedItems, setCheckedItems] = useState({});
  const [copied, setCopied] = useState("");

  const copyCode = (key, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    });
  };

  const toggleCheck = (key) => {
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalItems = CHECKLIST_ITEMS.reduce((s, p) => s + p.items.length, 0);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const progress = Math.round((checkedCount / totalItems) * 100);

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#0a0a0f", minHeight: "100vh", color: "#e8e8f0" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", borderBottom: "1px solid #2a2a4a", padding: "28px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #4f8ef7, #a855f7)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📦</div>
            <div>
              <div style={{ fontSize: 11, color: "#6b6b9a", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600 }}>Backdropsource</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>Offline Conversion Tracking — Complete Implementation</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
            {[
              { label: "Platforms", value: "Google · Meta · Bing · LinkedIn", color: "#4f8ef7" },
              { label: "Checkpoints", value: "7 conversion events", color: "#a855f7" },
              { label: "Method", value: "GCLID → Draft Order → Upload", color: "#22c55e" }
            ].map(b => (
              <div key={b.label} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 14px" }}>
                <span style={{ color: "#8888aa", fontSize: 11 }}>{b.label}: </span>
                <span style={{ color: b.color, fontSize: 12, fontWeight: 600 }}>{b.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#111120", borderBottom: "1px solid #1e1e3a", padding: "0 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "14px 18px", background: "none", border: "none",
              borderBottom: activeTab === tab ? "2px solid #4f8ef7" : "2px solid transparent",
              color: activeTab === tab ? "#4f8ef7" : "#6b6b9a",
              fontWeight: activeTab === tab ? 600 : 400,
              fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.15s"
            }}>{tab}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px" }}>

        {/* OVERVIEW TAB */}
        {activeTab === "Overview" && (
          <div>
            {/* Flow Diagram */}
            <div style={{ background: "#111120", border: "1px solid #1e1e3a", borderRadius: 12, padding: 28, marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: "#6b6b9a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20, fontWeight: 600 }}>End-to-End Attribution Flow</div>
              <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 12 }}>
                {[
                  { icon: "🖱️", label: "Ad Click", sub: "GCLID generated" },
                  { icon: "🌐", label: "Landing Page", sub: "Cookie stored 90d" },
                  { icon: "📋", label: "Form Submit", sub: "GCLID + Lead saved" },
                  { icon: "📞", label: "Sales Call", sub: "Team qualifies lead" },
                  { icon: "🛒", label: "Draft Order", sub: "GCLID linked" },
                  { icon: "💳", label: "Payment", sub: "Draft Order paid" },
                  { icon: "📤", label: "Upload", sub: "4 platforms notified" },
                  { icon: "🤖", label: "Smart Bidding", sub: "Google optimizes" },
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ textAlign: "center", minWidth: 80 }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>{step.icon}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#e8e8f0" }}>{step.label}</div>
                      <div style={{ fontSize: 10, color: "#6b6b9a" }}>{step.sub}</div>
                    </div>
                    {i < 7 && <div style={{ color: "#2a2a4a", fontSize: 20, margin: "0 4px", marginBottom: 20 }}>→</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Conversion Checkpoints */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: "#6b6b9a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16, fontWeight: 600 }}>7 Conversion Checkpoints</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {[
                  { name: "Quote Request Form", icon: "📋", type: "Primary", desc: "Customer requests a quote", platforms: "G · M · B · Li" },
                  { name: "Free 2D Mockup Form", icon: "🎨", type: "Primary", desc: "Customer requests mockup", platforms: "G · M · B · Li" },
                  { name: "Contact Us Form", icon: "✉️", type: "Primary", desc: "General inquiry submitted", platforms: "G · M · B · Li" },
                  { name: "Custom Inquiry Form", icon: "💬", type: "Primary", desc: "Custom project inquiry", platforms: "G · M · B · Li" },
                  { name: "Add to Cart", icon: "🛒", type: "Secondary", desc: "Product added, no checkout", platforms: "G · M" },
                  { name: "Phone Click", icon: "📞", type: "Secondary", desc: "Customer clicks phone number", platforms: "G" },
                  { name: "WhatsApp Click", icon: "💚", type: "Secondary", desc: "Customer clicks WhatsApp", platforms: "G · M" },
                ].map((cp, i) => (
                  <div key={i} style={{ background: "#111120", border: "1px solid #1e1e3a", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 22 }}>{cp.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8f0" }}>{cp.name}</div>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: cp.type === "Primary" ? "rgba(79,142,247,0.15)" : "rgba(168,85,247,0.15)", color: cp.type === "Primary" ? "#4f8ef7" : "#a855f7", fontWeight: 600 }}>{cp.type}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b6b9a", marginBottom: 8 }}>{cp.desc}</div>
                    <div style={{ fontSize: 11, color: "#4f8ef7" }}>Platforms: {cp.platforms}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {[
                { name: "Google Ads", color: "#4f8ef7", id: "GCLID / GBRAID / WBRAID", upload: "CSV or API", window: "90 days" },
                { name: "Meta Ads", color: "#a855f7", id: "FBCLID + Hashed Email", upload: "CSV via Events Manager", window: "90 days" },
                { name: "Microsoft Bing", color: "#f59e0b", id: "MSCLKID", upload: "CSV import", window: "90 days" },
                { name: "LinkedIn Ads", color: "#0ea5e9", id: "LI_FAT_ID + Email", upload: "CSV via Campaign Mgr", window: "90 days" },
              ].map((p, i) => (
                <div key={i} style={{ background: "#111120", border: `1px solid ${p.color}33`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: p.color, marginBottom: 10 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#6b6b9a", marginBottom: 4 }}>Click ID: <span style={{ color: "#e8e8f0" }}>{p.id}</span></div>
                  <div style={{ fontSize: 11, color: "#6b6b9a", marginBottom: 4 }}>Upload: <span style={{ color: "#e8e8f0" }}>{p.upload}</span></div>
                  <div style={{ fontSize: 11, color: "#6b6b9a" }}>Window: <span style={{ color: "#22c55e" }}>{p.window}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SHOPIFY CODE TAB */}
        {activeTab === "Shopify Code" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { key: "step1_gclid_capture", label: "Step 1: GCLID Capture (Head)" },
                { key: "step2_hidden_fields", label: "Step 2: Form Tracking (Body)" },
                { key: "step3_liquid_snippet", label: "Step 3: Liquid Snippet" },
              ].map(btn => (
                <button key={btn.key} onClick={() => setActiveCode(btn.key)} style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid",
                  borderColor: activeCode === btn.key ? "#4f8ef7" : "#2a2a4a",
                  background: activeCode === btn.key ? "rgba(79,142,247,0.1)" : "transparent",
                  color: activeCode === btn.key ? "#4f8ef7" : "#6b6b9a",
                  fontSize: 12, cursor: "pointer", fontWeight: 500
                }}>{btn.label}</button>
              ))}
            </div>

            <div style={{ background: "#0d0d1a", border: "1px solid #1e1e3a", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "#111120", borderBottom: "1px solid #1e1e3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#6b6b9a", fontFamily: "monospace" }}>
                  {activeCode === "step1_gclid_capture" && "theme.liquid → inside <head>"}
                  {activeCode === "step2_hidden_fields" && "theme.liquid → before </body>"}
                  {activeCode === "step3_liquid_snippet" && "snippets/bs-tracking-fields.liquid → new file"}
                </div>
                <button onClick={() => copyCode(activeCode, CODE_BLOCKS[activeCode])} style={{
                  padding: "6px 14px", background: copied === activeCode ? "#22c55e" : "#4f8ef7",
                  border: "none", borderRadius: 6, color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600
                }}>{copied === activeCode ? "✓ Copied!" : "Copy Code"}</button>
              </div>
              <pre style={{ margin: 0, padding: 24, overflowX: "auto", fontSize: 11.5, lineHeight: 1.7, color: "#c8c8e8", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {CODE_BLOCKS[activeCode]}
              </pre>
            </div>

            {activeCode === "step1_gclid_capture" && (
              <div style={{ marginTop: 16, background: "rgba(79,142,247,0.05)", border: "1px solid rgba(79,142,247,0.2)", borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 600, color: "#4f8ef7", marginBottom: 8, fontSize: 13 }}>📌 What this does</div>
                <div style={{ fontSize: 12, color: "#8888aa", lineHeight: 1.8 }}>
                  Captures GCLID, GBRAID, WBRAID (Google), FBCLID (Meta), MSCLKID (Bing), LI_FAT_ID (LinkedIn) from the URL on every page load.
                  Stores in cookies for 90 days. Only saves the FIRST click ID (preserves original ad attribution).
                  Exposes <code style={{ background: "#1a1a2e", padding: "1px 6px", borderRadius: 4, color: "#4f8ef7" }}>window.BSTracking.get()</code> globally for form scripts to use.
                </div>
              </div>
            )}
            {activeCode === "step2_hidden_fields" && (
              <div style={{ marginTop: 16, background: "rgba(79,142,247,0.05)", border: "1px solid rgba(79,142,247,0.2)", borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 600, color: "#4f8ef7", marginBottom: 8, fontSize: 13 }}>📌 Form selectors — update for your theme</div>
                <div style={{ fontSize: 12, color: "#8888aa", lineHeight: 1.8 }}>
                  Open your Quote/Mockup/Contact forms, right-click → Inspect, find the <code style={{ background: "#1a1a2e", padding: "1px 6px", borderRadius: 4, color: "#4f8ef7" }}>{"<form>"}</code> element and copy its <code style={{ background: "#1a1a2e", padding: "1px 6px", borderRadius: 4, color: "#4f8ef7" }}>id</code> or <code style={{ background: "#1a1a2e", padding: "1px 6px", borderRadius: 4, color: "#4f8ef7" }}>class</code>.
                  Update the selectors in the bindForm() calls. Replace <code style={{ background: "#1a1a2e", padding: "1px 6px", borderRadius: 4, color: "#4f8ef7" }}>YOUR_APPS_SCRIPT_URL</code> after deploying Step 4.
                </div>
              </div>
            )}
          </div>
        )}

        {/* GTM SETUP TAB */}
        {activeTab === "GTM Setup" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {[
                { title: "Variables to Create", color: "#4f8ef7", items: [
                  "1st Party Cookie → bs_gclid → 'Cookie - BS GCLID'",
                  "1st Party Cookie → bs_gbraid → 'Cookie - BS GBRAID'",
                  "1st Party Cookie → bs_wbraid → 'Cookie - BS WBRAID'",
                  "DataLayer Var → conversion_name → 'DLV - Conversion Name'",
                  "DataLayer Var → customer_email → 'DLV - Customer Email'",
                  "DataLayer Var → gclid → 'DLV - GCLID'"
                ]},
                { title: "Triggers to Create", color: "#a855f7", items: [
                  "Custom Event → bs_offline_conversion → 'All BS Conversions'",
                  "Custom Event → bs_offline_conversion + conversion_name = Quote Request",
                  "Custom Event → bs_offline_conversion + conversion_name = Free 2D Mockup",
                  "Custom Event → bs_offline_conversion + conversion_name = Contact Us",
                  "Custom Event → bs_offline_conversion + conversion_name = Draft Order Sale"
                ]},
                { title: "Tags to Create", color: "#22c55e", items: [
                  "Google Ads Conversion → 'Draft Order Sale' → fires on All BS Conversions",
                  "Google Ads Enhanced Conversions → email + phone → same trigger",
                  "Meta Pixel → Lead event → fires on form submissions",
                  "Microsoft UET → Conversion Goal → fires on All BS Conversions",
                  "LinkedIn Insight Tag → Conversion → fires on All BS Conversions"
                ]},
                { title: "GTM Install in Shopify", color: "#f59e0b", items: [
                  "Go to Online Store → Themes → Edit Code",
                  "Open theme.liquid",
                  "Paste GTM <head> snippet right after <head> tag",
                  "Paste GTM <noscript> snippet right after <body> tag",
                  "Save file",
                  "Test with GTM Preview Mode before publishing"
                ]}
              ].map((section, i) => (
                <div key={i} style={{ background: "#111120", border: `1px solid ${section.color}22`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: section.color, marginBottom: 14 }}>{section.title}</div>
                  {section.items.map((item, j) => (
                    <div key={j} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                      <span style={{ color: section.color, fontSize: 10, marginTop: 4 }}>▸</span>
                      <span style={{ fontSize: 12, color: "#8888aa", lineHeight: 1.6 }}>{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ background: "#0d0d1a", border: "1px solid #1e1e3a", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "#111120", borderBottom: "1px solid #1e1e3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#6b6b9a", fontFamily: "monospace" }}>GTM Configuration Reference</span>
                <button onClick={() => copyCode("gtm", CODE_BLOCKS.gtm_config)} style={{ padding: "6px 14px", background: copied === "gtm" ? "#22c55e" : "#4f8ef7", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  {copied === "gtm" ? "✓ Copied!" : "Copy"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: 24, overflowX: "auto", fontSize: 11.5, lineHeight: 1.7, color: "#c8c8e8", whiteSpace: "pre-wrap" }}>
                {CODE_BLOCKS.gtm_config}
              </pre>
            </div>
          </div>
        )}

        {/* DATABASE SCHEMA TAB */}
        {activeTab === "Database Schema" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              {[
                { title: "LEADS TABLE", color: "#4f8ef7", fields: [
                  { name: "Lead ID", type: "TEXT", note: "Auto-generated: L-timestamp" },
                  { name: "Timestamp", type: "DATETIME", note: "Form submission time" },
                  { name: "Conversion Name", type: "TEXT", note: "Quote Request / 2D Mockup / etc" },
                  { name: "Name", type: "TEXT", note: "Customer full name" },
                  { name: "Email", type: "TEXT", note: "Customer email — used for matching" },
                  { name: "Phone", type: "TEXT", note: "Customer phone" },
                  { name: "Message", type: "TEXT", note: "Form message/details" },
                  { name: "GCLID", type: "TEXT", note: "Google click ID ← CRITICAL" },
                  { name: "GBRAID", type: "TEXT", note: "iOS app click ID" },
                  { name: "WBRAID", type: "TEXT", note: "iOS Safari click ID" },
                  { name: "FBCLID", type: "TEXT", note: "Meta click ID" },
                  { name: "MSCLKID", type: "TEXT", note: "Bing click ID" },
                  { name: "LI_FAT_ID", type: "TEXT", note: "LinkedIn click ID" },
                  { name: "UTM Source", type: "TEXT", note: "google / facebook / bing" },
                  { name: "UTM Medium", type: "TEXT", note: "cpc / email / organic" },
                  { name: "UTM Campaign", type: "TEXT", note: "Campaign name" },
                  { name: "Landing Page", type: "URL", note: "First page visited" },
                  { name: "Draft Order ID", type: "TEXT", note: "Sales team fills after creating DO" },
                  { name: "Draft Order Paid", type: "TEXT", note: "YES / NO" },
                  { name: "Google Uploaded", type: "TEXT", note: "YES / NO" },
                  { name: "Meta Uploaded", type: "TEXT", note: "YES / NO" },
                  { name: "Bing Uploaded", type: "TEXT", note: "YES / NO" },
                  { name: "LinkedIn Uploaded", type: "TEXT", note: "YES / NO" },
                ]},
                { title: "DRAFT ORDERS TABLE", color: "#22c55e", fields: [
                  { name: "Draft Order ID", type: "TEXT", note: "e.g. DO-1001 — unique key" },
                  { name: "Lead ID", type: "TEXT", note: "Links back to Leads table" },
                  { name: "Paid Timestamp", type: "DATETIME", note: "When payment was received" },
                  { name: "Revenue", type: "NUMBER", note: "Actual amount paid" },
                  { name: "Currency", type: "TEXT", note: "INR / USD / GBP / AUD / CAD" },
                  { name: "Customer Email", type: "TEXT", note: "For Meta + LinkedIn matching" },
                  { name: "Customer Name", type: "TEXT", note: "Customer full name" },
                  { name: "GCLID", type: "TEXT", note: "Copied from Lead ← CRITICAL" },
                  { name: "GBRAID", type: "TEXT", note: "Copied from Lead" },
                  { name: "WBRAID", type: "TEXT", note: "Copied from Lead" },
                  { name: "Google Uploaded", type: "TEXT", note: "YES / NO" },
                  { name: "Meta Uploaded", type: "TEXT", note: "YES / NO" },
                  { name: "Bing Uploaded", type: "TEXT", note: "YES / NO" },
                  { name: "LinkedIn Uploaded", type: "TEXT", note: "YES / NO" },
                  { name: "Upload Timestamp", type: "DATETIME", note: "When CSV was uploaded" },
                ]}
              ].map((table, i) => (
                <div key={i} style={{ background: "#111120", border: `1px solid ${table.color}33`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", background: `${table.color}11`, borderBottom: `1px solid ${table.color}33` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: table.color }}>{table.title}</span>
                  </div>
                  <div style={{ maxHeight: 400, overflowY: "auto" }}>
                    {table.fields.map((field, j) => (
                      <div key={j} style={{ padding: "8px 20px", borderBottom: "1px solid #0f0f1f", display: "flex", gap: 10, alignItems: "baseline" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#e8e8f0", minWidth: 140 }}>{field.name}</span>
                        <span style={{ fontSize: 10, color: table.color, background: `${table.color}15`, padding: "1px 6px", borderRadius: 4, minWidth: 60, textAlign: "center" }}>{field.type}</span>
                        <span style={{ fontSize: 11, color: "#6b6b9a" }}>{field.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Apps Script */}
            <div style={{ background: "#0d0d1a", border: "1px solid #1e1e3a", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "#111120", borderBottom: "1px solid #1e1e3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#6b6b9a", fontFamily: "monospace" }}>Google Apps Script — Complete Code</span>
                <button onClick={() => copyCode("apps", CODE_BLOCKS.apps_script)} style={{ padding: "6px 14px", background: copied === "apps" ? "#22c55e" : "#4f8ef7", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  {copied === "apps" ? "✓ Copied!" : "Copy Code"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: 24, overflowX: "auto", fontSize: 11.5, lineHeight: 1.7, color: "#c8c8e8", whiteSpace: "pre-wrap", maxHeight: 500, wordBreak: "break-word" }}>
                {CODE_BLOCKS.apps_script}
              </pre>
            </div>
          </div>
        )}

        {/* CSV UPLOAD TAB */}
        {activeTab === "CSV Upload" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { key: "google", label: "🔵 Google Ads", color: "#4f8ef7" },
                { key: "meta", label: "🟣 Meta Ads", color: "#a855f7" },
                { key: "bing", label: "🟡 Bing Ads", color: "#f59e0b" },
                { key: "linkedin", label: "🔷 LinkedIn", color: "#0ea5e9" },
              ].map(p => (
                <button key={p.key} onClick={() => setActivePlatform(p.key)} style={{
                  padding: "8px 18px", borderRadius: 8, border: "1px solid",
                  borderColor: activePlatform === p.key ? p.color : "#2a2a4a",
                  background: activePlatform === p.key ? `${p.color}15` : "transparent",
                  color: activePlatform === p.key ? p.color : "#6b6b9a",
                  fontSize: 12, cursor: "pointer", fontWeight: 500
                }}>{p.label}</button>
              ))}
            </div>

            {/* Upload Instructions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={{ background: "#111120", border: "1px solid #1e1e3a", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0", marginBottom: 14 }}>
                  {activePlatform === "google" && "Google Ads — Upload Steps"}
                  {activePlatform === "meta" && "Meta — Upload Steps"}
                  {activePlatform === "bing" && "Bing Ads — Upload Steps"}
                  {activePlatform === "linkedin" && "LinkedIn — Upload Steps"}
                </div>
                {activePlatform === "google" && ["Go to Google Ads → Goals → Conversions","Click '+ New Conversion' → Import → Other data sources","Choose 'Track conversions from clicks'","Name: Draft Order Sale","Upload your CSV file","Click Apply","Wait 24-48 hours for data to appear","Verify in Conversion report"].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ background: "#4f8ef7", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i+1}</span>
                    <span style={{ fontSize: 12, color: "#8888aa" }}>{s}</span>
                  </div>
                ))}
                {activePlatform === "meta" && ["Go to Events Manager → your Pixel","Click 'Offline Events' tab","Click 'Upload Events'","Select CSV file","Map columns: event_name, event_time, em (hashed email)","Click Upload","Meta matches via FBCLID + hashed email"].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ background: "#a855f7", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i+1}</span>
                    <span style={{ fontSize: 12, color: "#8888aa" }}>{s}</span>
                  </div>
                ))}
                {activePlatform === "bing" && ["Go to Microsoft Ads → Tools → Conversion Goals","Click 'Offline Conversions'","Click 'Upload' → choose CSV","Conversion Name must match exactly","Wait 24-48 hours","Check Conversion Goals report"].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ background: "#f59e0b", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i+1}</span>
                    <span style={{ fontSize: 12, color: "#8888aa" }}>{s}</span>
                  </div>
                ))}
                {activePlatform === "linkedin" && ["Go to Campaign Manager → Analyze","Click 'Conversion Tracking' → Offline Conversions","Click 'Upload File'","Required: conversionHappenedAt (Unix ms), emailAddress","LinkedIn matches via LI_FAT_ID + email","Wait 24-48 hours for processing"].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ background: "#0ea5e9", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i+1}</span>
                    <span style={{ fontSize: 12, color: "#8888aa" }}>{s}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: "#111120", border: "1px solid #1e1e3a", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0", marginBottom: 14 }}>Critical Rules</div>
                {activePlatform === "google" && [
                  { rule: "Timezone must match account timezone", color: "#f87171" },
                  { rule: "Upload within 90 days of ad click", color: "#f87171" },
                  { rule: "Conversion Name must EXACTLY match Google Ads", color: "#f87171" },
                  { rule: "Use Draft Order ID as Order ID for deduplication", color: "#fbbf24" },
                  { rule: "First line must be the Parameters: line", color: "#fbbf24" },
                  { rule: "File encoding must be UTF-8", color: "#4f8ef7" },
                  { rule: "Max file size: 150MB", color: "#4f8ef7" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ color: r.color, fontSize: 14 }}>●</span>
                    <span style={{ fontSize: 12, color: "#8888aa" }}>{r.rule}</span>
                  </div>
                ))}
                {activePlatform === "meta" && [
                  { rule: "Email must be SHA-256 hashed (lowercase, trimmed)", color: "#f87171" },
                  { rule: "event_time must be Unix timestamp (seconds)", color: "#f87171" },
                  { rule: "Upload within 7 days for best match rates", color: "#fbbf24" },
                  { rule: "event_name must be uppercase: PURCHASE", color: "#fbbf24" },
                  { rule: "action_source = 'website'", color: "#4f8ef7" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ color: r.color, fontSize: 14 }}>●</span>
                    <span style={{ fontSize: 12, color: "#8888aa" }}>{r.rule}</span>
                  </div>
                ))}
                {activePlatform === "bing" && [
                  { rule: "Conversion Name must match Bing conversion goal exactly", color: "#f87171" },
                  { rule: "Time format: YYYY-MM-DD HH:MM:SS+OFFSET", color: "#f87171" },
                  { rule: "MSCLKID valid for 90 days", color: "#fbbf24" },
                  { rule: "Enable auto-tagging in Bing Ads account settings first", color: "#fbbf24" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ color: r.color, fontSize: 14 }}>●</span>
                    <span style={{ fontSize: 12, color: "#8888aa" }}>{r.rule}</span>
                  </div>
                ))}
                {activePlatform === "linkedin" && [
                  { rule: "conversionHappenedAt = Unix milliseconds (not seconds)", color: "#f87171" },
                  { rule: "Email is plain text (not hashed) for LinkedIn", color: "#f87171" },
                  { rule: "Must have Insight Tag installed on site", color: "#fbbf24" },
                  { rule: "LI_FAT_ID valid for 30 days only", color: "#f87171" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ color: r.color, fontSize: 14 }}>●</span>
                    <span style={{ fontSize: 12, color: "#8888aa" }}>{r.rule}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#0d0d1a", border: "1px solid #1e1e3a", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "#111120", borderBottom: "1px solid #1e1e3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#6b6b9a", fontFamily: "monospace" }}>
                  {activePlatform === "google" && "Google Ads CSV Format"}
                  {activePlatform === "meta" && "Meta Offline Events CSV Format"}
                  {activePlatform === "bing" && "Microsoft Bing CSV Format"}
                  {activePlatform === "linkedin" && "LinkedIn Offline Conversions CSV Format"}
                </span>
                <button onClick={() => copyCode("csv_" + activePlatform, CSV_EXAMPLES[activePlatform])} style={{ padding: "6px 14px", background: copied === "csv_" + activePlatform ? "#22c55e" : "#4f8ef7", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  {copied === "csv_" + activePlatform ? "✓ Copied!" : "Copy CSV"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: 24, fontSize: 12, lineHeight: 1.8, color: "#c8c8e8", overflowX: "auto", whiteSpace: "pre" }}>
                {CSV_EXAMPLES[activePlatform]}
              </pre>
            </div>
          </div>
        )}

        {/* AUTOMATION TAB */}
        {activeTab === "Automation" && (
          <div>
            <div style={{ background: "#111120", border: "1px solid #1e1e3a", borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e8e8f0", marginBottom: 20 }}>Zapier / Make.com Automation Flow</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { step: "TRIGGER", title: "Shopify: Draft Order Paid", desc: "Fires when a Draft Order status changes to paid", color: "#22c55e" },
                  { step: "ACTION 1", title: "Google Sheets: Lookup Row", desc: "Find row in Leads sheet where Email = draft order email → get GCLID, Lead ID", color: "#4f8ef7" },
                  { step: "ACTION 2", title: "Code / Formatter", desc: "Build the payload: combine GCLID + revenue + currency + Draft Order ID", color: "#a855f7" },
                  { step: "ACTION 3", title: "Webhooks: POST", desc: "POST payload to your Apps Script URL → logs to Draft Orders sheet", color: "#f59e0b" },
                  { step: "ACTION 4", title: "Google Sheets: Update Row", desc: "Update Leads sheet: set Draft Order ID + Draft Order Paid = YES", color: "#0ea5e9" },
                  { step: "DAILY TRIGGER", title: "Schedule: Every Day 9am", desc: "Run exportAllPlatforms() in Apps Script → creates 4 platform CSV sheets", color: "#f87171" },
                  { step: "WEEKLY REMINDER", title: "Email Alert", desc: "Remind team to download + upload CSVs to all 4 platforms", color: "#6b6b9a" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 90, padding: "4px 10px", background: `${item.color}15`, border: `1px solid ${item.color}40`, borderRadius: 6, textAlign: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: item.color }}>{item.step}</span>
                    </div>
                    <div style={{ background: "#0d0d1a", border: "1px solid #1e1e3a", borderRadius: 8, padding: "12px 16px", flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e8e8f0", marginBottom: 4 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: "#6b6b9a" }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#0d0d1a", border: "1px solid #1e1e3a", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "#111120", borderBottom: "1px solid #1e1e3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#6b6b9a", fontFamily: "monospace" }}>Zapier Code Step — Draft Order Paid Handler</span>
                <button onClick={() => copyCode("zapier", CODE_BLOCKS.zapier_webhook)} style={{ padding: "6px 14px", background: copied === "zapier" ? "#22c55e" : "#4f8ef7", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  {copied === "zapier" ? "✓ Copied!" : "Copy Code"}
                </button>
              </div>
              <pre style={{ margin: 0, padding: 24, fontSize: 11.5, lineHeight: 1.7, color: "#c8c8e8", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {CODE_BLOCKS.zapier_webhook}
              </pre>
            </div>
          </div>
        )}

        {/* CHECKLIST TAB */}
        {activeTab === "Checklist" && (
          <div>
            {/* Progress */}
            <div style={{ background: "#111120", border: "1px solid #1e1e3a", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e8e8f0" }}>Implementation Progress</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: progress === 100 ? "#22c55e" : "#4f8ef7" }}>{checkedCount} / {totalItems} ({progress}%)</span>
              </div>
              <div style={{ background: "#0a0a0f", borderRadius: 100, height: 10, overflow: "hidden" }}>
                <div style={{ width: progress + "%", height: "100%", background: progress === 100 ? "#22c55e" : "linear-gradient(90deg, #4f8ef7, #a855f7)", borderRadius: 100, transition: "width 0.4s ease" }} />
              </div>
            </div>

            {CHECKLIST_ITEMS.map((phase, pi) => {
              const phaseChecked = phase.items.filter((_, ii) => checkedItems[`${pi}-${ii}`]).length;
              return (
                <div key={pi} style={{ background: "#111120", border: "1px solid #1e1e3a", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", background: "#111120", borderBottom: "1px solid #1e1e3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: phaseChecked === phase.items.length ? "#22c55e" : "#e8e8f0" }}>{phase.phase}</span>
                    <span style={{ fontSize: 12, color: "#6b6b9a" }}>{phaseChecked} / {phase.items.length}</span>
                  </div>
                  {phase.items.map((item, ii) => {
                    const key = `${pi}-${ii}`;
                    const checked = checkedItems[key];
                    return (
                      <div key={ii} onClick={() => toggleCheck(key)} style={{ padding: "12px 20px", borderBottom: ii < phase.items.length - 1 ? "1px solid #0f0f1f" : "none", display: "flex", gap: 12, alignItems: "center", cursor: "pointer", background: checked ? "rgba(34,197,94,0.04)" : "transparent", transition: "background 0.15s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? "#22c55e" : "#2a2a4a"}`, background: checked ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                          {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 12, color: checked ? "#4a9a5a" : "#8888aa", textDecoration: checked ? "line-through" : "none" }}>{item}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
