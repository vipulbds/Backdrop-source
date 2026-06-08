/* ════════════════════════════════════════════════════════════════════
   BACKDROPSOURCE — shared form validation  (theme asset: bds-forms.js)
   ────────────────────────────────────────────────────────────────────
   Same validation the Contact page uses, reusable on ANY form:
     • Email: format + common-typo suggestion + disposable blocklist +
       live deliverability (MX lookup via Google DNS-over-HTTPS).
     • Phone: country flag + dial-code selector (searchable), auto-set
       from the visitor's IP, per-country length / leading-digit rules,
       upgraded by libphonenumber-js once it lazy-loads.

   USAGE (in any section):
     1. Load this asset once:
        <script src="{{ 'bds-forms.js' | asset_url }}" defer></script>
     2. Mark inputs:
        <input type="email" data-bds-email ...>
        <input type="tel"   data-bds-phone ...>
        (add data-required to make them mandatory)
     3. To gate your own submit/step:  window.BDSForms.check(inputEl)
        returns true/false and shows the inline message.
        window.BDSForms.getPhone(el) -> "+1 5551234567"
        window.BDSForms.getCountry(el) -> "US"

   No build step, no dependencies (libphonenumber-js is loaded on demand).
   ════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.BDSForms) return;

  /* ---- injected styles (scoped with .bdsf-) ---- */
  var CSS =
  ".bdsf-phone{position:relative;display:flex!important;align-items:stretch!important;width:100%!important;margin:0}" +
  /* harden against the theme's global button styles bleeding in */
  ".bdsf-cc{display:inline-flex!important;align-items:center!important;gap:6px!important;padding:0 10px 0 12px!important;margin:0!important;width:auto!important;height:auto!important;min-height:0!important;max-width:none!important;border:1.5px solid #d9dee8!important;border-right:none!important;border-radius:8px 0 0 8px!important;background:#f4f6fb!important;color:#1a1d26!important;box-shadow:none!important;cursor:pointer;font-family:inherit!important;font-size:13px!important;font-weight:400!important;letter-spacing:normal!important;text-transform:none!important;line-height:1.2!important;white-space:nowrap!important;flex-shrink:0!important;-webkit-appearance:none!important;appearance:none!important;transform:none!important}" +
  ".bdsf-cc:hover{background:#eef1f7!important}" +
  ".bdsf-cc:focus{outline:none!important;border-color:#1B3A6B!important;box-shadow:none!important;z-index:2}" +
  ".bdsf-cc img{width:22px!important;height:16px!important;object-fit:cover!important;border-radius:2px!important;box-shadow:0 0 0 1px rgba(15,25,50,.12)!important;background:#eef0f4;display:block!important;margin:0!important;max-width:none!important}" +
  ".bdsf-cc-code{font-size:13px;font-weight:700;letter-spacing:-.01em}" +
  ".bdsf-cc-arr{width:10px;height:10px;color:#9BA3B5;transition:transform .2s;flex-shrink:0}" +
  ".bdsf-cc[aria-expanded=true] .bdsf-cc-arr{transform:rotate(180deg)}" +
  ".bdsf-phone-input{flex:1 1 auto!important;min-width:0!important;width:auto!important;border-left:none!important;border-top-left-radius:0!important;border-bottom-left-radius:0!important;margin:0!important}" +
  ".bdsf-phone.bdsf-bad .bdsf-cc{border-color:#C41E52!important}" +
  ".bdsf-dd{position:absolute;top:calc(100% + 6px);left:0;width:340px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e2e6ee;border-radius:12px;box-shadow:0 18px 50px rgba(15,25,45,.18),0 4px 12px rgba(15,25,45,.06);z-index:60;overflow:hidden}" +
  ".bdsf-dd[hidden]{display:none}" +
  ".bdsf-sw{position:relative;padding:12px 14px;border-bottom:1px solid #e2e6ee;display:flex;align-items:center;gap:8px;background:#f8f9fb}" +
  ".bdsf-sw svg{width:14px;height:14px;color:#9BA3B5;flex-shrink:0}" +
  ".bdsf-search{flex:1;border:none!important;background:transparent!important;outline:none!important;box-shadow:none!important;font-family:inherit;font-size:13px;color:#1a1d26;padding:4px 0!important;margin:0!important;height:auto!important;min-height:0!important}" +
  ".bdsf-list{max-height:260px;overflow-y:auto;padding:6px 0}" +
  ".bdsf-opt{display:flex!important;align-items:center!important;gap:10px;width:100%!important;max-width:none!important;padding:9px 16px!important;margin:0!important;background:none!important;border:none!important;border-radius:0!important;box-shadow:none!important;min-height:0!important;height:auto!important;font-family:inherit!important;font-size:13.5px!important;font-weight:400!important;letter-spacing:normal!important;text-transform:none!important;line-height:1.3!important;color:#3a4a6b;text-align:left!important;cursor:pointer;transform:none!important}" +
  ".bdsf-opt:hover,.bdsf-opt.active{background:rgba(196,30,82,.06);color:#1a1d26}" +
  ".bdsf-opt img{width:24px;height:18px;object-fit:cover;border-radius:2px;flex-shrink:0;box-shadow:0 0 0 1px rgba(15,25,50,.1);background:#eef0f4}" +
  ".bdsf-opt .nm{flex:1}" +
  ".bdsf-opt .cd{font-size:12px;font-weight:600;color:#5a6478;background:#f0f2f6;border-radius:6px;padding:3px 8px}" +
  ".bdsf-empty{padding:18px 16px;text-align:center;font-size:12px;color:#9BA3B5}" +
  ".bdsf-msg{font-size:11px;line-height:1.4;margin-top:5px;display:none}" +
  ".bdsf-msg.show{display:block}" +
  ".bdsf-msg.bad{color:#C41E52}" +
  ".bdsf-msg.ok{color:#1A7A42;font-weight:600}" +
  ".bdsf-msg.checking{color:#9BA3B5}" +
  ".bdsf-bad{border-color:#C41E52!important}" +
  ".bdsf-cc.bdsf-bad{border-color:#C41E52!important}";
  var st = document.createElement('style'); st.id = 'bdsf-css'; st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);

  /* ---- country data ---- */
  var COUNTRIES = [
    {iso:'US',name:'United States',code:'+1'},{iso:'CA',name:'Canada',code:'+1'},
    {iso:'GB',name:'United Kingdom',code:'+44'},{iso:'AU',name:'Australia',code:'+61'},
    {iso:'NZ',name:'New Zealand',code:'+64'},{iso:'IE',name:'Ireland',code:'+353'},
    {iso:'IN',name:'India',code:'+91'},{iso:'PK',name:'Pakistan',code:'+92'},
    {iso:'BD',name:'Bangladesh',code:'+880'},{iso:'LK',name:'Sri Lanka',code:'+94'},
    {iso:'NP',name:'Nepal',code:'+977'},{iso:'DE',name:'Germany',code:'+49'},
    {iso:'FR',name:'France',code:'+33'},{iso:'IT',name:'Italy',code:'+39'},
    {iso:'ES',name:'Spain',code:'+34'},{iso:'PT',name:'Portugal',code:'+351'},
    {iso:'NL',name:'Netherlands',code:'+31'},{iso:'BE',name:'Belgium',code:'+32'},
    {iso:'CH',name:'Switzerland',code:'+41'},{iso:'AT',name:'Austria',code:'+43'},
    {iso:'SE',name:'Sweden',code:'+46'},{iso:'NO',name:'Norway',code:'+47'},
    {iso:'DK',name:'Denmark',code:'+45'},{iso:'FI',name:'Finland',code:'+358'},
    {iso:'PL',name:'Poland',code:'+48'},{iso:'CZ',name:'Czech Republic',code:'+420'},
    {iso:'GR',name:'Greece',code:'+30'},{iso:'TR',name:'Turkey',code:'+90'},
    {iso:'RU',name:'Russia',code:'+7'},{iso:'UA',name:'Ukraine',code:'+380'},
    {iso:'RO',name:'Romania',code:'+40'},{iso:'HU',name:'Hungary',code:'+36'},
    {iso:'BG',name:'Bulgaria',code:'+359'},{iso:'AE',name:'United Arab Emirates',code:'+971'},
    {iso:'SA',name:'Saudi Arabia',code:'+966'},{iso:'QA',name:'Qatar',code:'+974'},
    {iso:'KW',name:'Kuwait',code:'+965'},{iso:'BH',name:'Bahrain',code:'+973'},
    {iso:'OM',name:'Oman',code:'+968'},{iso:'IL',name:'Israel',code:'+972'},
    {iso:'EG',name:'Egypt',code:'+20'},{iso:'ZA',name:'South Africa',code:'+27'},
    {iso:'NG',name:'Nigeria',code:'+234'},{iso:'KE',name:'Kenya',code:'+254'},
    {iso:'GH',name:'Ghana',code:'+233'},{iso:'MA',name:'Morocco',code:'+212'},
    {iso:'CN',name:'China',code:'+86'},{iso:'HK',name:'Hong Kong',code:'+852'},
    {iso:'TW',name:'Taiwan',code:'+886'},{iso:'JP',name:'Japan',code:'+81'},
    {iso:'KR',name:'South Korea',code:'+82'},{iso:'SG',name:'Singapore',code:'+65'},
    {iso:'MY',name:'Malaysia',code:'+60'},{iso:'TH',name:'Thailand',code:'+66'},
    {iso:'ID',name:'Indonesia',code:'+62'},{iso:'PH',name:'Philippines',code:'+63'},
    {iso:'VN',name:'Vietnam',code:'+84'},{iso:'MX',name:'Mexico',code:'+52'},
    {iso:'BR',name:'Brazil',code:'+55'},{iso:'AR',name:'Argentina',code:'+54'},
    {iso:'CL',name:'Chile',code:'+56'},{iso:'CO',name:'Colombia',code:'+57'},
    {iso:'PE',name:'Peru',code:'+51'}
  ];
  function flagUrl(iso){ return 'https://flagcdn.com/' + iso.toLowerCase() + '.svg'; }

  var MOBILE_EXAMPLES = {
    US:'(555) 234-5678',CA:'(416) 555-0123',GB:'07700 900123',IE:'087 123 4567',
    AU:'0412 345 678',NZ:'021 234 5678',IN:'98765 43210',PK:'0300 1234567',
    BD:'01712 345678',LK:'077 123 4567',NP:'980 1234567',DE:'01512 3456789',
    FR:'06 12 34 56 78',IT:'312 345 6789',ES:'612 345 678',PT:'912 345 678',
    NL:'06 12345678',BE:'0470 12 34 56',CH:'078 123 45 67',AT:'0660 1234567',
    SE:'070 123 45 67',NO:'406 12 345',DK:'20 12 34 56',FI:'040 123 4567',
    PL:'512 345 678',CZ:'601 123 456',GR:'691 234 5678',TR:'532 123 4567',
    RU:'912 345-67-89',UA:'050 123 4567',RO:'712 345 678',HU:'20 123 4567',
    BG:'87 123 4567',AE:'050 123 4567',SA:'50 123 4567',QA:'3312 3456',
    KW:'500 12345',BH:'3600 1234',OM:'9212 3456',IL:'050 123 4567',EG:'100 123 4567',
    ZA:'071 234 5678',NG:'802 123 4567',KE:'712 345 678',GH:'24 123 4567',
    MA:'612 345 678',CN:'131 2345 6789',HK:'5123 4567',TW:'912 345 678',
    JP:'090 1234 5678',KR:'010 1234 5678',SG:'8123 4567',MY:'12 345 6789',
    TH:'081 234 5678',ID:'0812 3456 7890',PH:'917 123 4567',VN:'091 234 5678',
    MX:'55 1234 5678',BR:'11 91234 5678',AR:'11 1234 5678',CL:'9 1234 5678',
    CO:'300 123 4567',PE:'912 345 678'
  };
  var MOBILE_RULES = {
    US:{min:10,max:10},CA:{min:10,max:10},GB:{min:10,max:10},IE:{min:9,max:9},
    AU:{min:9,max:9},NZ:{min:8,max:10},IN:{min:10,max:10,regex:/^[6-9]/},
    PK:{min:10,max:10,regex:/^3/},BD:{min:10,max:10,regex:/^1/},LK:{min:9,max:9,regex:/^7/},
    NP:{min:10,max:10,regex:/^9/},DE:{min:10,max:11,regex:/^1[5-7]/},FR:{min:9,max:9,regex:/^[67]/},
    IT:{min:9,max:11,regex:/^3/},ES:{min:9,max:9,regex:/^[67]/},PT:{min:9,max:9,regex:/^9/},
    NL:{min:9,max:9,regex:/^6/},BE:{min:9,max:9,regex:/^4/},CH:{min:9,max:9,regex:/^7/},
    AT:{min:9,max:13,regex:/^6/},SE:{min:9,max:9,regex:/^7/},NO:{min:8,max:8,regex:/^[49]/},
    DK:{min:8,max:8},FI:{min:9,max:10,regex:/^4/},PL:{min:9,max:9,regex:/^[4-9]/},
    CZ:{min:9,max:9,regex:/^[67]/},GR:{min:10,max:10,regex:/^6/},TR:{min:10,max:10,regex:/^5/},
    RU:{min:10,max:10,regex:/^9/},UA:{min:9,max:9,regex:/^[3-9]/},RO:{min:9,max:9,regex:/^7/},
    HU:{min:9,max:9,regex:/^[237]/},BG:{min:9,max:9,regex:/^[78]/},AE:{min:9,max:9,regex:/^5/},
    SA:{min:9,max:9,regex:/^5/},QA:{min:8,max:8,regex:/^[3567]/},KW:{min:8,max:8,regex:/^[569]/},
    BH:{min:8,max:8,regex:/^3/},OM:{min:8,max:8,regex:/^[79]/},IL:{min:9,max:9,regex:/^5/},
    EG:{min:10,max:10,regex:/^1/},ZA:{min:9,max:9,regex:/^[6-8]/},NG:{min:10,max:10,regex:/^[789]/},
    KE:{min:9,max:9,regex:/^7/},GH:{min:9,max:9,regex:/^[235]/},MA:{min:9,max:9,regex:/^[67]/},
    CN:{min:11,max:11,regex:/^1[3-9]/},HK:{min:8,max:8,regex:/^[569]/},TW:{min:9,max:9,regex:/^9/},
    JP:{min:10,max:11,regex:/^[789]/},KR:{min:9,max:10,regex:/^1/},SG:{min:8,max:8,regex:/^[89]/},
    MY:{min:9,max:10,regex:/^1/},TH:{min:9,max:9,regex:/^[689]/},ID:{min:9,max:12,regex:/^8/},
    PH:{min:10,max:10,regex:/^9/},VN:{min:9,max:10,regex:/^[3-9]/},MX:{min:10,max:10},
    BR:{min:10,max:11,regex:/^[1-9]/},AR:{min:10,max:11},CL:{min:9,max:9,regex:/^9/},
    CO:{min:10,max:10,regex:/^3/},PE:{min:9,max:9,regex:/^9/},_default:{min:7,max:15}
  };

  /* ---- email helpers ---- */
  var EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  var EMAIL_TYPOS = {
    'gmail.con':'gmail.com','gmail.co':'gmail.com','gmial.com':'gmail.com','gmal.com':'gmail.com','gmail.cm':'gmail.com','gnail.com':'gmail.com','gmaill.com':'gmail.com','gmailcom':'gmail.com',
    'yahoo.con':'yahoo.com','yaho.com':'yahoo.com','yahooo.com':'yahoo.com','yhaoo.com':'yahoo.com','yahoo.co':'yahoo.com',
    'hotmail.con':'hotmail.com','hotmal.com':'hotmail.com','hotmial.com':'hotmail.com','hotmaill.com':'hotmail.com','hotmail.co':'hotmail.com',
    'outlook.con':'outlook.com','outlok.com':'outlook.com','outloo.com':'outlook.com','outlook.co':'outlook.com',
    'icloud.con':'icloud.com','iclod.com':'icloud.com','icloud.co':'icloud.com',
    'live.con':'live.com','aol.con':'aol.com','proton.con':'proton.me'
  };
  var DISPOSABLE = new Set(['mailinator.com','mailinator.net','tempmail.com','temp-mail.org','temp-mail.io','tempmail.net','10minutemail.com','10minutemail.net','guerrillamail.com','guerrillamail.net','sharklasers.com','grr.la','yopmail.com','yopmail.fr','throwaway.email','throwawaymail.com','maildrop.cc','mailcatch.com','mailnesia.com','trashmail.com','trashmail.net','dispostable.com','discard.email','dropmail.me','spam4.me','spamgourmet.com','mintemail.com','mohmal.com','fakeinbox.com','getnada.com','nada.email','getairmail.com','tempinbox.com','tmail.io','tmpmail.org','mail.tm','33mail.com','burnermail.io','anonymbox.com','jetable.org','spambog.com','tempr.email','emailondeck.com','inboxkitten.com','mailpoof.com']);
  var DISPOSABLE_PAT = /(tempmail|temp-mail|tmpmail|10minute|20minute|30minute|throwaway|mailinator|yopmail|guerrilla|sharklaser|trashmail|dispostable|fakeinbox|fake-mail|wegwerf|getairmail|mintemail|harakiri|disposable|tempinbox|mailtemp|discardmail|dropmail|mailpoof|mailcatch|maildrop|mohmal|inboxbear|inboxkitten|mailnesia|burnermail|spamgourmet|spam4me)/i;
  function isDisposable(email){
    var at=email.lastIndexOf('@'); if(at<0) return false;
    var d=email.slice(at+1).toLowerCase().trim(); if(!d) return false;
    if(DISPOSABLE.has(d)||DISPOSABLE_PAT.test(d)) return true;
    var parts=d.split('.'); for(var i=0;i<parts.length-1;i++){ if(DISPOSABLE.has(parts.slice(i).join('.'))) return true; }
    return false;
  }
  function typoSuggestion(email){
    var v=String(email).trim(), at=v.lastIndexOf('@'); if(at<0) return null;
    var d=v.slice(at+1).toLowerCase(); return EMAIL_TYPOS[d] ? v.slice(0,at+1)+EMAIL_TYPOS[d] : null;
  }
  var mxCache = {};
  function dohMX(domain){
    return new Promise(function(resolve){
      var ctrl, signal; try{ ctrl=new AbortController(); signal=ctrl.signal; }catch(e){}
      var t=setTimeout(function(){ if(ctrl)ctrl.abort(); resolve(null); },5000);
      fetch('https://dns.google/resolve?name='+encodeURIComponent(domain)+'&type=MX',{signal:signal})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(d){ clearTimeout(t); resolve(d); })
        .catch(function(){ clearTimeout(t); resolve(null); });
    });
  }
  function checkMX(domain){
    if(mxCache.hasOwnProperty(domain)) return Promise.resolve(mxCache[domain]);
    return dohMX(domain).then(function(d){
      if(!d){ mxCache[domain]=null; return null; }
      if(d.Status===3){ mxCache[domain]=false; return false; }
      if(d.Status===0 && Array.isArray(d.Answer) && d.Answer.length){
        var real=d.Answer.filter(function(a){
          if(a.type!==15) return false;
          var ex=String(a.data||'').trim().split(/\s+/).pop().replace(/\.$/,'').toLowerCase();
          return ex && ex!=='localhost' && ex!=='0.0.0.0' && ex!=='127.0.0.1';
        });
        mxCache[domain]=real.length>0; return mxCache[domain];
      }
      if(d.Status===0){ mxCache[domain]=false; return false; }
      mxCache[domain]=null; return null;
    });
  }

  /* ---- libphonenumber-js (lazy) ---- */
  var libTriggered=false;
  function loadLib(){ if(libTriggered) return; libTriggered=true; var s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/libphonenumber-js@1.11.4/bundle/libphonenumber-max.js'; s.async=true; document.head.appendChild(s); }

  function validateMobileLegacy(value, iso, dialCode){
    var dialDigits=(dialCode||'').replace(/\D/g,''), digits=value.replace(/\D/g,'');
    if(dialDigits && digits.length>dialDigits.length && digits.indexOf(dialDigits)===0) digits=digits.slice(dialDigits.length);
    if(digits.length>1 && digits.charAt(0)==='0') digits=digits.slice(1);
    var r=MOBILE_RULES[iso]||MOBILE_RULES._default;
    if(digits.length<r.min||digits.length>r.max) return false;
    if(r.regex && !r.regex.test(digits)) return false;
    // Reject obviously fake numbers: all-identical digits (6666666666, 0000000000),
    // or a simple ascending/descending run (1234567890, 9876543210, etc.)
    if(/^(\d)\1+$/.test(digits)) return false;
    if('01234567890'.indexOf(digits) >= 0 || '09876543210'.indexOf(digits) >= 0) return false;
    return true;
  }
  function validateMobile(value, iso, dialCode){
    if(!validateMobileLegacy(value, iso, dialCode)) return false;
    if(window.libphonenumber && typeof window.libphonenumber.parsePhoneNumberFromString==='function'){
      try{ var pn=window.libphonenumber.parsePhoneNumberFromString(String(value), iso); if(pn && typeof pn.isValid==='function' && !pn.isValid()) return false; }catch(e){}
    }
    return true;
  }

  /* ---- shared message node ---- */
  function msgNode(input){
    var host=input.closest('.bds-fg')||input.closest('.bds-field')||input.parentNode;
    var m=host.querySelector(':scope > .bdsf-msg');
    if(!m){ m=document.createElement('div'); m.className='bdsf-msg'; host.appendChild(m); }
    return m;
  }
  function setMsg(input, type, text){
    var m=msgNode(input);
    m.className='bdsf-msg show '+type; m.textContent=text;
  }
  function clearMsg(input){ var m=msgNode(input); m.className='bdsf-msg'; m.textContent=''; }
  function phoneBad(input, bad){ input.classList.toggle('bdsf-bad', bad); var w=input.closest('.bdsf-phone'); if(w) w.classList.toggle('bdsf-bad', bad); }

  /* ════ EMAIL ════ */
  function emailSync(input){
    var v=(input.value||'').trim();
    if(!v) return { state: input.hasAttribute('data-required') ? 'required' : 'empty' };
    if(!EMAIL_RE.test(v)) return { state:'bad', msg:'Please enter a valid e-mail address.' };
    var sug=typoSuggestion(v); if(sug) return { state:'bad', msg:'Did you mean '+sug+'? Please check the address.' };
    if(isDisposable(v)) return { state:'bad', msg:'Temporary / disposable mailboxes are not accepted.' };
    var domain=(v.split('@')[1]||'').toLowerCase();
    if(mxCache[domain]===false) return { state:'bad', msg:"This e-mail domain can't receive mail. Please check it." };
    return { state:'ok', domain:domain };
  }
  function paintEmail(input, withGreen){
    var r=emailSync(input);
    if(r.state==='empty'){ input.classList.remove('bdsf-bad'); clearMsg(input); return true; }
    if(r.state==='required'){ input.classList.add('bdsf-bad'); setMsg(input,'bad','Please enter your e-mail.'); return false; }
    if(r.state==='bad'){ input.classList.add('bdsf-bad'); setMsg(input,'bad',r.msg); return false; }
    input.classList.remove('bdsf-bad');
    if(withGreen) setMsg(input,'ok','✓ Email looks good'); else clearMsg(input);
    return true;
  }
  var mxTimers={};
  function scheduleMX(input){
    var domain=((input.value||'').trim().split('@')[1]||'').toLowerCase();
    if(domain.indexOf('.')<1) return;
    var id=input.__bdsId;
    if(mxTimers[id]) clearTimeout(mxTimers[id]);
    setMsg(input,'checking','Checking e-mail domain…');
    mxTimers[id]=setTimeout(function(){
      checkMX(domain).then(function(res){
        var cur=((input.value||'').trim().split('@')[1]||'').toLowerCase();
        if(cur!==domain) return;
        if(res===false){ input.classList.add('bdsf-bad'); setMsg(input,'bad',"This e-mail domain can't receive mail. Please check it."); }
        else if(res===true){ input.classList.remove('bdsf-bad'); setMsg(input,'ok','✓ Email looks good'); }
        else { paintEmail(input,false); }
      });
    },600);
  }
  function enhanceEmail(input){
    input.addEventListener('input', function(){
      if((input.value||'').indexOf('@')>0){ if(paintEmail(input,false)) scheduleMX(input); }
      else { input.classList.remove('bdsf-bad'); clearMsg(input); }
    });
    input.addEventListener('blur', function(){
      if(paintEmail(input,true) && (input.value||'').trim()){ scheduleMX(input); }
    });
  }

  /* ════ PHONE ════ */
  function enhancePhone(input){
    var wrap=document.createElement('div'); wrap.className='bdsf-phone';
    var btn=document.createElement('button');
    btn.type='button'; btn.className='bdsf-cc'; btn.setAttribute('aria-haspopup','listbox'); btn.setAttribute('aria-expanded','false');
    btn.innerHTML='<img alt="" width="22" height="16"><span class="bdsf-cc-code">+1</span><svg class="bdsf-cc-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';
    var dd=document.createElement('div'); dd.className='bdsf-dd'; dd.hidden=true;
    dd.innerHTML='<div class="bdsf-sw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input class="bdsf-search" type="text" placeholder="Search country or code…"></div><div class="bdsf-list"></div>';

    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(btn); wrap.appendChild(input); wrap.appendChild(dd);
    input.classList.add('bdsf-phone-input');

    var imgEl=btn.querySelector('img'), codeEl=btn.querySelector('.bdsf-cc-code'),
        list=dd.querySelector('.bdsf-list'), searchEl=dd.querySelector('.bdsf-search');
    var state={iso:'US',code:'+1',name:'United States'}; input.__bdsState=state;

    function applyCountry(c){
      state.iso=c.iso; state.code=c.code; state.name=c.name;
      imgEl.src=flagUrl(c.iso); imgEl.alt=c.iso; codeEl.textContent=c.code;
      btn.setAttribute('aria-label','Country: '+c.name+' '+c.code);
      if(!input.value || !input.dataset.bdsTouched) input.placeholder=MOBILE_EXAMPLES[c.iso]||'000 000 0000';
      Array.prototype.forEach.call(list.children, function(b){ if(b.dataset) b.classList.toggle('active', b.dataset.iso===c.iso); });
      if(input.value.trim()) check(input);
    }
    function render(filter){
      var q=(filter||'').toLowerCase().trim();
      var matches=COUNTRIES.filter(function(c){ return !q || c.name.toLowerCase().indexOf(q)!==-1 || c.code.indexOf(q)!==-1 || c.iso.toLowerCase().indexOf(q)!==-1; });
      if(!matches.length){ list.innerHTML='<div class="bdsf-empty">No matches</div>'; return; }
      list.innerHTML=matches.map(function(c){
        return '<button type="button" class="bdsf-opt'+(c.iso===state.iso?' active':'')+'" data-iso="'+c.iso+'" data-code="'+c.code+'"><img loading="lazy" src="'+flagUrl(c.iso)+'" alt="'+c.iso+'" width="24" height="18"><span class="nm">'+c.name+'</span><span class="cd">'+c.code+'</span></button>';
      }).join('');
    }
    function open(){ dd.hidden=false; btn.setAttribute('aria-expanded','true'); setTimeout(function(){ searchEl.focus(); },10); }
    function close(){ dd.hidden=true; btn.setAttribute('aria-expanded','false'); searchEl.value=''; render(''); }

    applyCountry(COUNTRIES[0]); render('');

    btn.addEventListener('click', function(e){ e.stopPropagation(); if(dd.hidden) open(); else close(); });
    searchEl.addEventListener('input', function(){ render(searchEl.value); });
    searchEl.addEventListener('click', function(e){ e.stopPropagation(); });
    list.addEventListener('click', function(e){ var o=e.target.closest('.bdsf-opt'); if(!o) return; applyCountry({iso:o.dataset.iso,code:o.dataset.code,name:o.querySelector('.nm').textContent}); close(); input.focus(); });
    document.addEventListener('click', function(e){ if(!dd.hidden && !dd.contains(e.target) && !btn.contains(e.target)) close(); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && !dd.hidden) close(); });

    input.addEventListener('focus', loadLib, {once:true});
    input.addEventListener('touchstart', loadLib, {once:true, passive:true});
    input.addEventListener('input', function(){ input.dataset.bdsTouched='1'; if(input.value.trim()) check(input); else { input.classList.remove('bdsf-bad'); clearMsg(input); } });
    input.addEventListener('blur', function(){ if(input.value.trim()) check(input); });

    // IP geolocation → default country (best-effort, silent)
    try{
      fetch('https://ipapi.co/json/',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(d){
        if(d && d.country_code){ var c=COUNTRIES.find(function(x){return x.iso===d.country_code;}); if(c) applyCountry(c); }
      }).catch(function(){
        fetch('https://api.country.is/').then(function(r){ return r.ok?r.json():null; }).then(function(d){
          if(d && d.country){ var c=COUNTRIES.find(function(x){return x.iso===d.country;}); if(c) applyCountry(c); }
        }).catch(function(){});
      });
    }catch(e){}
  }

  /* ════ public check ════ */
  function check(input){
    var v=(input.value||'').trim();
    if(input.hasAttribute('data-bds-phone')){
      if(!v){ if(input.hasAttribute('data-required')){ phoneBad(input,true); setMsg(input,'bad','Please enter your mobile number.'); return false; } phoneBad(input,false); clearMsg(input); return true; }
      var stt=input.__bdsState||{iso:'US',code:'+1'};
      if(!validateMobile(v, stt.iso, stt.code)){
        var r=MOBILE_RULES[stt.iso]||MOBILE_RULES._default;
        var msg=r.min===r.max ? ('Enter a valid '+r.min+'-digit mobile number.') : ('Enter a valid mobile number ('+r.min+'–'+r.max+' digits).');
        phoneBad(input,true); setMsg(input,'bad',msg); return false;
      }
      phoneBad(input,false); setMsg(input,'ok','✓ Number looks valid'); return true;
    }
    if(input.hasAttribute('data-bds-email')){ return paintEmail(input,true); }
    return true;
  }
  function getPhone(input){
    var v=(input.value||'').trim(); if(!v) return '';
    if(v.charAt(0)==='+') return v;
    var stt=input.__bdsState; return stt ? (stt.code+' '+v) : v;
  }
  function getCountry(input){ var stt=input.__bdsState; return stt?stt.iso:''; }

  var idc=0;
  function init(root){
    var scope=root&&root.querySelectorAll?root:document;
    scope.querySelectorAll('[data-bds-email]').forEach(function(el){ if(!el.__bdsInit){ el.__bdsInit=1; el.__bdsId='e'+(idc++); enhanceEmail(el); } });
    scope.querySelectorAll('[data-bds-phone]').forEach(function(el){ if(!el.__bdsInit){ el.__bdsInit=1; el.__bdsId='p'+(idc++); enhancePhone(el); } });
  }

  window.BDSForms = { init:init, check:check, getPhone:getPhone, getCountry:getCountry };
  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', function(){ init(); });
  document.addEventListener('shopify:section:load', function(e){ init(e.target||document); });
})();
