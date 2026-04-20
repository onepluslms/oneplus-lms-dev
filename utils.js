// ── utils.js — oPLUS LMS v20.00 ──────────────────────────────────────────
// Shared helpers: timestamp, Firestore safety, PDF/XLSX lazy load, misc


// ── TIMESTAMP ───────────────────────────────────────────────────
// ── TIMESTAMP ──
function fmtTimestamp(d) {
  d = d || new Date();
  var dd = String(d.getDate()).padStart(2,'0');
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  var yy = d.getFullYear();
  var hh = String(d.getHours()).padStart(2,'0');
  var mm = String(d.getMinutes()).padStart(2,'0');
  return dd+'-'+mo+'-'+yy+' '+hh+':'+mm+' IST';
}

var curPanel = 'standard'; // active panel for current order

function getPanelRate(dept, name) {
  if (!_dataLoaded) return null;
  var key = (dept||'').toUpperCase() + '|' + (name||'').toUpperCase();
  var p = PANELS[key];
  if (!p) return null;
  if (curPanel === 'jk') return p.jk || null;
  if (curPanel === 'du') return p.du || null;
  if (curPanel === 'sh') return p.sh || null;
  return null; // standard = use CATALOGUE rate
}

function setPanelButtons() {
  ['standard','jk','du','sh'].forEach(function(id) {
    var btn = document.getElementById('panel-btn-'+id);
    if (!btn) return;
    var active = curPanel === id;
    btn.style.background = active ? '#fff' : 'transparent';
    btn.style.color = active ? 'var(--accent)' : '#fff';
    btn.style.borderColor = active ? '#fff' : 'rgba(255,255,255,0.35)';
    btn.style.fontWeight = active ? '700' : '400';
  });
  var pname = document.getElementById('step2-panel-name');
  if (pname) pname.textContent = PANEL_NAMES[curPanel] || 'Standard';
}
function setPanelAndRecalc(panel) {
  curPanel = panel;
  // If doctor field already has a value, validate it against the new panel
  var refField = document.getElementById('pt-ref');
  var currentDoc = refField ? refField.value.trim() : '';
  if (currentDoc && !doctorAllowedForPanel(panel, currentDoc)) {
    if (refField) refField.value = '';
    toast('\u26a0 ' + (PANEL_NAMES[panel]||panel) + ' panel: previous doctor cleared — not authorised for this panel', 'warn');
  }
  var pname = document.getElementById('step2-panel-name');
  if (pname) pname.textContent = PANEL_NAMES[panel] || 'Standard';
  // Update button styles
  setPanelButtons();
  // Recalculate test rates in selTests
  selTests = selTests.map(function(t) {
    var pr = getPanelRate(t.dept, t.name);
    return Object.assign({}, t, { rate: pr !== null ? pr : t.stdRate });
  });
  renderSelTests();
  calcBill();
}


var orderHits = [];
function searchTests(q) {
  var el = document.getElementById('test-suggest');
  if (!q || q.length < 1) { el.style.display = 'none'; return; }
  if (!_dataLoaded) {
    el.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text3)">&#8987; Loading catalogue...</div>';
    el.style.display = 'block';
    onDataReady(function(){ var cur = document.getElementById('test-q'); if(cur && cur.value) searchTests(cur.value); });
    return;
  }
  var lq = q.toLowerCase().trim();
  // Ranked: name starts-with (0) > name contains (1) > short matches (2)
  var scored = [];
  CATALOGUE.forEach(function(t) {
    var n = t.name.toLowerCase();
    var s = (t.short||'').toLowerCase();
    if (n.indexOf(lq) === 0) scored.push({t:t, rank:0});
    else if (n.indexOf(lq) >= 0) scored.push({t:t, rank:1});
    else if (s && s.indexOf(lq) >= 0) scored.push({t:t, rank:2});
  });
  scored.sort(function(a,b){ return a.rank-b.rank; });
  orderHits = scored.slice(0,10).map(function(x){ return x.t; });
  if (!orderHits.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  var html = '';
  for (var i = 0; i < orderHits.length; i++) {
    var t = orderHits[i];
    // Apply panel rate if active
    var key = (t.dept||'').toUpperCase()+'|'+(t.name||'').toUpperCase();
    var p = PANELS[key];
    var panelRate = p ? (curPanel==='jk'?p.jk:curPanel==='du'?p.du:curPanel==='sh'?p.sh:null) : null;
    var displayRate = panelRate !== null && panelRate !== undefined ? panelRate : t.rate;
    var rateStr = displayRate !== null && displayRate !== undefined ? 'Rs.'+displayRate : 'Call for rate';
    var rateColor = displayRate !== null && displayRate !== undefined ? '#1A4A3A' : '#9C917E';
    html += '<div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:1px solid #eee;background:#fff" onclick="addOrderHit(' + i + ')">';
    html += '<div><div style="font-size:14px;font-weight:500;color:#1C1810">' + esc(t.name) + '</div>';
    html += '<div style="font-size:11px;color:#A09080">' + esc(t.dept) + '</div></div>';
    html += '<div style="font-size:13px;font-weight:500;color:'+rateColor+'">' + rateStr + '</div></div>';
  }
  el.innerHTML = html;
}
function addOrderHit(i) { addTest(orderHits[i]); }


function hideSuggest(e) {
  var el = document.getElementById('test-suggest');
  var inp = document.getElementById('test-q');
  if (el && inp && !el.contains(e.target) && e.target !== inp) {
    el.style.display = 'none';
  }
}
function addTest(t) {
  if (selTests.find(function(x){ return x.name===t.name; })) { toast('Already added','warn'); return; }
  var stdRate = t.rate || 0;
  var pr = getPanelRate(t.dept, t.name);
  var effective = Object.assign({}, t, { stdRate: stdRate, rate: pr !== null ? pr : stdRate });
  selTests.push(effective);
  document.getElementById('test-q').value='';
  document.getElementById('test-suggest').style.display='none';
  renderTests();
}
function removeTest(i) { selTests.splice(i,1); renderTests(); }
function renderTests() {
  var total = selTests.reduce(function(s,t){ return s+(t.rate||0); },0);
  var el = document.getElementById('sel-tests');
  el.innerHTML = selTests.length ? selTests.map(function(t,i){
    var rateDisplay = (t.rate !== null && t.rate !== undefined) ? 'Rs.'+(t.rate||0) : 'Call for rate';
    return '<div class="chip"><div><div style="font-size:13px;font-weight:500">'+esc(t.name)+'</div><div style="font-size:11px;color:var(--text3);font-family:var(--mono)">'+esc(t.dept)+'</div></div><div style="display:flex;align-items:center;gap:8px"><div style="font-size:13px;color:var(--text2)">'+rateDisplay+'</div><button class="chip-del" onclick="removeTest('+i+')">x</button></div></div>';
  }).join('') : '<div style="color:var(--text3);font-size:13px;text-align:center;padding:12px">No tests selected</div>';
  var strip=document.getElementById('est-strip');
  var btn=document.getElementById('step2-btn');
  if (selTests.length>0) {
    strip.style.display='flex';
    document.getElementById('est-amt').textContent='Rs.'+total.toLocaleString('en-IN');
    btn.disabled=false;
  } else { strip.style.display='none'; btn.disabled=true; }
}


// ── FIRESTORE SAFETY ────────────────────────────────────────────
// ── FIRESTORE SAFETY: strip undefined values recursively ────────────────
function cleanForFirestore(obj) {
  if (Array.isArray(obj)) {
    return obj.map(function(v) { return cleanForFirestore(v); });
  }
  if (obj !== null && typeof obj === 'object' &&
      !(obj.constructor && obj.constructor.name === 'FieldValue') &&
      !(typeof obj.toMillis === 'function')) {
    var clean = {};
    Object.keys(obj).forEach(function(k) {
      var v = obj[k];
      if (v !== undefined) clean[k] = cleanForFirestore(v);
    });
    return clean;
  }
  return obj === undefined ? null : obj;
}


// ── LAZY-LOAD PDF/XLSX ──────────────────────────────────────────
// ── LAZY-LOAD PDF AND XLSX LIBRARIES ─────────────────────────────────────
var _pdfLibsLoaded = false;
var _pdfLibsLoading = false;
var _pdfLibCallbacks = [];
function loadPDFLibs(cb) {
  if (_pdfLibsLoaded) { cb(); return; }
  _pdfLibCallbacks.push(cb);
  if (_pdfLibsLoading) return;
  _pdfLibsLoading = true;
  var s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  s1.onload = function() {
    var s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s2.onload = function() {
      _pdfLibsLoaded = true; _pdfLibsLoading = false;
      _pdfLibCallbacks.forEach(function(fn){ fn(); }); _pdfLibCallbacks = [];
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}
var _xlsxLoaded = false;
function loadXLSX(cb) {
  if (_xlsxLoaded) { cb(); return; }
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = function() { _xlsxLoaded = true; cb(); };
  document.head.appendChild(s);
}

function downloadTRFpdf() {
  if (!_pdfLibsLoaded) { loadPDFLibs(function(){ downloadTRFpdf(); }); toast('Loading PDF library...','ok'); return; }
  var o = curDetailOrder || lastOrder;
  if (!o) { toast('No order loaded','warn'); return; }
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({unit:'mm', format:'a4'});
  var pw = 210, ph = 297, ml = 15, mr = 15, mt = 15;
  var cw = pw - ml - mr;
  var y = mt;

  // Urgent banner
  if (o.urgent) {
    doc.setFillColor(239, 68, 68);
    doc.roundedRect(ml, y, cw, 10, 2, 2, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text('URGENT - PRIORITY PROCESSING', pw/2, y+7, {align:'center'});
    y += 14;
  }

  // Header
  doc.setFillColor(26, 74, 58);
  doc.roundedRect(ml, y, cw, 22, 3, 3, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(14);
  doc.text('OnePLUS Ultrasound Lab', ml+6, y+8);
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text('47, Harsh Vihar, Pitampura, Delhi-34  |  011-4248 0101  |  dr.nitinagarwal@gmail.com', ml+6, y+15);
  doc.text('Test Request Form (TRF)', pw-mr-6, y+8, {align:'right'});
  doc.text('Date: '+(o.date||''), pw-mr-6, y+14, {align:'right'});
  y += 28;

  // Patient details box
  doc.setDrawColor(220,220,220); doc.setTextColor(50,50,50);
  doc.roundedRect(ml, y, cw, 32, 2, 2, 'S');
  doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.setTextColor(150,150,150);
  doc.text('PATIENT DETAILS', ml+4, y+5);
  doc.setTextColor(30,30,30); doc.setFontSize(10);
  doc.setFont('helvetica','bold');
  doc.text(o.patientName||'-', ml+4, y+13);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text('Age/Sex: '+(o.age||'-')+' '+(o.sex||''), ml+4, y+20);
  doc.text('Mobile: '+(o.phone||'-'), ml+4, y+26);
  doc.text('Ref by: '+(o.refBy||'-'), ml+cw/2, y+20);
  doc.text('Source: '+(o.source||'Walk-in'), ml+cw/2, y+26);
  if(o.serialNo) { doc.setFont('helvetica','bold'); doc.text('Serial No: '+o.serialNo, ml, y+34); doc.setFont('helvetica','normal'); }
  if (o.address) { doc.setFontSize(8); doc.text('Address: '+o.address, ml+4, y+31); }
  y += 38;

  // GPS if present
  if (o.gps) {
    doc.setFontSize(8); doc.setTextColor(29,78,216);
    doc.text('GPS: '+o.gps.lat+', '+o.gps.lng+' (±'+o.gps.accuracy+'m)', ml, y);
    doc.setTextColor(30,30,30);
    y += 6;
  }

  // Tests table
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(150,150,150);
  doc.text('TESTS ORDERED', ml, y+4);
  y += 8;
  doc.setFillColor(245,245,245);
  doc.rect(ml, y, cw, 7, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  doc.text('#', ml+2, y+5);
  doc.text('Test Name', ml+10, y+5);
  doc.text('Dept', ml+cw*0.62, y+5);
  doc.text('Rate (Rs.)', pw-mr-2, y+5, {align:'right'});
  y += 9;
  var tests = o.tests||[];
  var total = 0;
  tests.forEach(function(t,i) {
    if (y > ph-40) { doc.addPage(); y = mt; }
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(30,30,30);
    doc.text(String(i+1), ml+2, y+4);
    var name = t.name||''; if(name.length>40) name=name.substring(0,38)+'..';
    doc.text(name, ml+10, y+4);
    var dept = (t.dept||'').substring(0,14);
    doc.text(dept, ml+cw*0.62, y+4);
    doc.text(String(t.rate||0), pw-mr-2, y+4, {align:'right'});
    doc.setDrawColor(235,235,235);
    doc.line(ml, y+7, pw-mr, y+7);
    total += (t.rate||0);
    y += 9;
  });
  y += 4;

  // Billing summary
  doc.setFillColor(26,74,58);
  doc.roundedRect(ml, y, cw, 16, 2, 2, 'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','normal'); doc.setFontSize(9);
  var pdfPayLabel = '';
  if (o.splitPayments) {
    var pp=[]; if(o.splitPayments.cash>0) pp.push('Cash Rs.'+o.splitPayments.cash); if(o.splitPayments.upi>0) pp.push('UPI Rs.'+o.splitPayments.upi); if(o.splitPayments.card>0) pp.push('Card Rs.'+o.splitPayments.card);
    pdfPayLabel = pp.join(' + ');
  } else { pdfPayLabel = (o.payMode||'').toUpperCase(); }
  if (o.discount>0) pdfPayLabel += ' | Discount: Rs.'+o.discount;
  doc.text('Payment: '+pdfPayLabel, ml+4, y+7);
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  if (o.dueAmount > 0) {
    doc.text('Rs. '+(o.paidAmount||0).toLocaleString('en-IN') + ' | DUE Rs.'+(o.dueAmount||0).toLocaleString('en-IN'), pw-mr-4, y+10, {align:'right'});
  } else {
    doc.text('Rs. '+(o.paidAmount||0).toLocaleString('en-IN'), pw-mr-4, y+10, {align:'right'});
  }
  y += 22;

  // Clinical history
  var h = o.history||{};
  var hLines = [];
  if(h.fasting) hLines.push('Fasting: '+h.fasting+(h.fastHours?' ('+h.fastHours+')':''));
  if(h.diagnoses&&h.diagnoses.length) hLines.push('Dx: '+h.diagnoses.join(', '));
  if(h.medications&&h.medications.length) hLines.push('Meds: '+h.medications.join(', '));
  if(h.collectionTime) hLines.push('Collection time: '+h.collectionTime);
  if(h.orderingDoctor) hLines.push('Ordering Dr: '+h.orderingDoctor);
  if(h.clinicalNotes) hLines.push('Notes: '+h.clinicalNotes);
  if(hLines.length) {
    doc.setTextColor(80,80,80); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text('CLINICAL HISTORY', ml, y);
    y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    hLines.forEach(function(l) { doc.setTextColor(30,30,30); doc.text(l, ml, y); y+=5; });
    y += 4;
  }

  // Footer
  doc.setDrawColor(220,220,220); doc.line(ml, y, pw-mr, y); y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(150,150,150);
  doc.text('Collected by: '+(o.createdByName||'-'), ml, y);
  doc.text('Status: '+(o.status||'paid').toUpperCase(), pw-mr, y, {align:'right'});
  y += 5;
  if(o.lastEditedBy) doc.text('Last edited by: '+o.lastEditedBy+' at '+o.lastEditedAt, ml, y);

  // Prescription pages
  var rxPages = (o.rxPhotos && o.rxPhotos.length) ? o.rxPhotos : (o.rxPhoto ? [o.rxPhoto] : []);
  if (rxPages.length > 0) {
    rxPages.forEach(function(src, pi) {
      if (y > ph - 60) { doc.addPage(); y = mt; }
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(150,150,150);
      doc.text('PRESCRIPTION' + (rxPages.length > 1 ? ' — PAGE ' + (pi+1) : ''), ml, y);
      y += 5;
      try {
        var imgH = Math.min(80, (ph - y - 20));
        doc.addImage(src, 'JPEG', ml, y, cw, imgH);
        y += imgH + 6;
      } catch(e) {}
    });
  }

  var filename = 'TRF_'+(o.patientName||'patient').replace(/\s+/g,'_')+'_'+(o.date||'').replace(/\//g,'-')+'.pdf';
  // iOS Safari does not support the download attribute — open blob URL in new tab instead
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    var blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
    toast('PDF opened — use Share to save', 'ok');
  } else {
    doc.save(filename);
    toast('PDF downloaded', 'ok');
  }
}



// ── HELPERS ─────────────────────────────────────────────────────
// ── HELPERS ──
function visitWindow(t) {
  if (!t) return '';
  var parts = t.split(':');
  if (parts.length < 2) return t;
  var h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  var endM = m + 30, endH = h + Math.floor(endM / 60);
  endM = endM % 60; endH = endH % 24;
  var fmt = function(hh, mm) {
    var suffix = hh >= 12 ? 'pm' : 'am';
    var h12 = hh % 12 || 12;
    return h12 + (mm > 0 ? ':' + String(mm).padStart(2,'0') : '') + ' ' + suffix;
  };
  return fmt(h, m) + ' – ' + fmt(endH, endM);
}

function todayStr() {
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg,type) {
  var el=document.getElementById('toast');
  el.textContent=msg;
  el.className='show'+(type?' '+type:'');
  setTimeout(function(){ el.className=''; },2500);
}


