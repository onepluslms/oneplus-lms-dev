// ── pa.js — oPLUS LMS v20.00 ─────────────────────────────────────────────
// Pre-analytical guide, PA editor, AI suggest, rejection, prep instructions

// ── PA GUIDELINES EDITOR + FIRESTORE OVERRIDES ───────────────────────────
var paOverridesCache = {};  // testKey → override doc data
var paeCurrentTest   = null; // currently editing test object

// Load all overrides from Firestore into memory (called at app load)
function loadPAOverrides() {
  db.collection('pa_overrides').get().then(function(snap) {
    snap.forEach(function(d) { paOverridesCache[d.id] = d.data(); });
  }).catch(function() {});
}

// Merge JSON base with Firestore override for a given PA data object
function mergePA(pa, testKey) {
  var ov = paOverridesCache[testKey];
  if (!ov) return pa;
  var merged = Object.assign({}, pa);
  var fields = ['prep','med_avoid','med_note','diet_avoid','diet_note','timing'];
  fields.forEach(function(f) { if (ov[f] !== undefined && ov[f] !== '') merged[f] = ov[f]; });
  return merged;
}

// Get merged PA for a test (used in Collection Guide and preanalytical screen)
function getMergedPA(test) {
  var pa = getPA(test);
  if (!pa) return null;
  var key = (test.name||'').toLowerCase().replace(/[^a-z0-9]/g,'_');
  return mergePA(pa, key);
}

function initPAEditor() {
  document.getElementById('pae-search').value = '';
  document.getElementById('pae-results').innerHTML = '<div class="empty">Search a test above</div>';
  document.getElementById('pae-editor').style.display = 'none';
  document.getElementById('pae-ai-result').style.display = 'none';
  document.getElementById('pae-ai-status').style.display = 'none';
}

function paeSearch(q) {
  var el = document.getElementById('pae-results');
  if (!q || q.length < 2) { el.innerHTML = '<div class="empty">Type at least 2 characters</div>'; return; }
  var lq = q.toLowerCase();
  var hits = (CATALOGUE||[]).filter(function(t) {
    return (t.name||'').toLowerCase().indexOf(lq) >= 0 || (t.short||'').toLowerCase().indexOf(lq) >= 0;
  }).slice(0, 8);
  if (!hits.length) { el.innerHTML = '<div class="empty">No tests found</div>'; return; }
  el.innerHTML = hits.map(function(t, i) {
    var pa = getPA(t);
    var key = (t.name||'').toLowerCase().replace(/[^a-z0-9]/g,'_');
    var hasOverride = !!paOverridesCache[key];
    return '<div style="padding:10px 0;border-bottom:0.5px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="paeOpen('+i+')">'
      + '<div><div style="font-size:13px;font-weight:500">'+esc(t.name)+'</div>'
      + '<div style="font-size:11px;color:var(--text3);font-family:var(--mono)">'+esc(t.dept||'')+'</div></div>'
      + (hasOverride ? '<span style="font-size:10px;background:#7C3AED22;color:#7C3AED;padding:2px 7px;border-radius:10px;font-family:var(--mono)">OVERRIDE</span>' : '')
      + '</div>';
  }).join('');
  window._paeHits = hits;
}

function paeOpen(idx) {
  var t = (window._paeHits||[])[idx];
  if (!t) return;
  paeCurrentTest = t;
  var key = (t.name||'').toLowerCase().replace(/[^a-z0-9]/g,'_');
  var pa = getPA(t) || {};
  var ov = paOverridesCache[key] || {};

  document.getElementById('pae-title').textContent = t.name + ' — ' + (t.dept||'');
  document.getElementById('pae-source').textContent = ov._updatedAt
    ? 'Override saved ' + ov._updatedAt + ' by ' + (ov._updatedBy||'?')
    : 'Showing base JSON — no override saved yet';

  // Populate fields: override takes priority over base
  function val(f) { return ov[f] !== undefined ? ov[f] : (pa[f]||''); }
  document.getElementById('pae-prep').value       = val('prep');
  document.getElementById('pae-med-avoid').value  = val('med_avoid');
  document.getElementById('pae-med-note').value   = val('med_note');
  document.getElementById('pae-diet-avoid').value = val('diet_avoid');
  document.getElementById('pae-diet-note').value  = val('diet_note');
  document.getElementById('pae-editor').style.display = 'block';
  document.getElementById('pae-ai-result').style.display = 'none';
  document.getElementById('pae-ai-status').style.display = 'none';
  document.getElementById('pae-save-status').textContent = '';
  document.getElementById('pae-results').innerHTML = '<div class="empty">Editing: ' + esc(t.name) + ' — search again to change</div>';
}

function paeSave() {
  if (!paeCurrentTest) return;
  var key = (paeCurrentTest.name||'').toLowerCase().replace(/[^a-z0-9]/g,'_');
  var now = new Date();
  var timeStr = now.toLocaleDateString('en-IN') + ' ' + now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  var data = {
    testName:    paeCurrentTest.name,
    dept:        paeCurrentTest.dept||'',
    prep:        document.getElementById('pae-prep').value.trim(),
    med_avoid:   document.getElementById('pae-med-avoid').value.trim(),
    med_note:    document.getElementById('pae-med-note').value.trim(),
    diet_avoid:  document.getElementById('pae-diet-avoid').value.trim(),
    diet_note:   document.getElementById('pae-diet-note').value.trim(),
    _updatedAt:  timeStr,
    _updatedBy:  (curProfile&&curProfile.name)||curUser.email,
    _updatedByUid: curUser.uid
  };
  var statusEl = document.getElementById('pae-save-status');
  statusEl.textContent = 'Saving...';
  db.collection('pa_overrides').doc(key).set(data).then(function() {
    paOverridesCache[key] = data;
    statusEl.textContent = 'Saved ✓ — ' + timeStr;
    document.getElementById('pae-source').textContent = 'Override saved ' + timeStr + ' by ' + data._updatedBy;
    logActivity('staff_edit', 'PA override saved: ' + paeCurrentTest.name);
    toast('PA guidelines updated ✓', 'ok');
  }).catch(function(e) {
    statusEl.textContent = 'Save failed: ' + e.message;
    toast('Save failed', 'err');
  });
}

function paeClearOverride() {
  if (!paeCurrentTest) return;
  if (!confirm('Remove override for ' + paeCurrentTest.name + '? Base JSON values will be restored.')) return;
  var key = (paeCurrentTest.name||'').toLowerCase().replace(/[^a-z0-9]/g,'_');
  db.collection('pa_overrides').doc(key).delete().then(function() {
    delete paOverridesCache[key];
    // Restore base JSON values
    var pa = getPA(paeCurrentTest) || {};
    document.getElementById('pae-prep').value       = pa.prep||'';
    document.getElementById('pae-med-avoid').value  = pa.med_avoid||'';
    document.getElementById('pae-med-note').value   = pa.med_note||'';
    document.getElementById('pae-diet-avoid').value = pa.diet_avoid||'';
    document.getElementById('pae-diet-note').value  = pa.diet_note||'';
    document.getElementById('pae-source').textContent = 'Override cleared — showing base JSON';
    document.getElementById('pae-save-status').textContent = '';
    toast('Override cleared ✓', 'ok');
  }).catch(function(e) { toast('Failed: ' + e.message, 'err'); });
}

// ── AI SUGGEST (Claude API) ───────────────────────────────────────────────
async function paeAISuggest() {
  if (!paeCurrentTest) return;
  var btn    = document.getElementById('pae-ai-btn');
  var status = document.getElementById('pae-ai-status');
  var result = document.getElementById('pae-ai-result');
  btn.disabled = true;
  btn.textContent = '⏳ Consulting AI...';
  status.style.display = 'block';
  status.textContent = 'Searching for latest Indian/NABL-aligned guidelines...';
  result.style.display = 'none';

  var testName = paeCurrentTest.name;
  var dept     = paeCurrentTest.dept || '';
    var prompt = 'You are a clinical pathology expert advising an NABL-accredited diagnostic lab in India.'
    + ' Provide current preanalytical guidelines for: ' + testName + ' (' + dept + ').'
    + ' Respond ONLY with a JSON object (no markdown fences, no text outside JSON) with these keys:'
    + ' prep, timing, med_avoid, med_note, diet_avoid, diet_note, sources.'
    + ' Base on ICMR guidelines, NABL requirements, CLSI standards, and current Indian lab practice.'
    + ' Be specific and practical for a phlebotomist. If no restriction applies, write None.';

  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    var data = await resp.json();
    var text = (data.content||[]).filter(function(b){ return b.type==='text'; }).map(function(b){ return b.text; }).join('');
    // Strip any markdown fences
    text = text.replace(/```json|```/g,'').trim();
    var suggested;
    try { suggested = JSON.parse(text); } catch(pe) {
      result.style.display = 'block';
      result.innerHTML = '<b>AI response (raw — could not parse as JSON):</b><br><pre style="white-space:pre-wrap;font-size:11px">'+esc(text)+'</pre>';
      status.textContent = 'Received (manual copy needed)';
      btn.disabled = false; btn.textContent = '🤖 Suggest Latest Guidelines (AI)';
      return;
    }
    // Show result with apply buttons
    var fields = [
      {key:'prep',        label:'Prep'},
      {key:'timing',      label:'Timing'},
      {key:'med_avoid',   label:'Stop Before Test'},
      {key:'med_note',    label:'Medication Note'},
      {key:'diet_avoid',  label:'Avoid Food/Drink'},
      {key:'diet_note',   label:'Dietary Note'}
    ];
    var html = '<div style="font-size:11px;font-family:var(--mono);color:#7C3AED;margin-bottom:8px">AI SUGGESTION — review carefully before applying</div>';
    if (suggested.sources) html += '<div style="font-size:10px;color:var(--text3);margin-bottom:8px">Sources: '+esc(suggested.sources)+'</div>';
    fields.forEach(function(f) {
      if (!suggested[f.key] || suggested[f.key] === 'None') return;
      html += '<div style="margin-bottom:8px">'
        + '<div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;margin-bottom:3px">'+f.label+'</div>'
        + '<div style="font-size:12px;color:var(--text);margin-bottom:4px">'+esc(suggested[f.key])+'</div>'
        + '<button data-field="'+f.key+'" onclick="paeApplyFieldBtn(this)" '
        + 'style="font-size:11px;padding:3px 10px;border:0.5px solid var(--accent);border-radius:4px;background:transparent;color:var(--accent);cursor:pointer">Apply &#8595;</button>'   + '</div>';
    });
    html += '<button id="pae-apply-all-btn" class="btn btn-primary" style="width:100%;margin-top:4px;font-size:12px" onclick="paeApplyAllCurrent()">Apply All Fields</button>';
    window._paeLastSuggested = suggested;
    result.innerHTML = html;
    result.style.display = 'block';
    status.textContent = 'Suggestion ready — review and apply fields individually or all at once';
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    result.style.display = 'none';
  }
  btn.disabled = false;
  btn.textContent = '🤖 Suggest Latest Guidelines (AI)';
}

function paeApplyFieldBtn(btn) {
  var key   = btn.getAttribute('data-field');
  var value = (window._paeLastSuggested && window._paeLastSuggested[key]) || '';
  paeApplyField(key, value);
}
function paeApplyAllCurrent() {
  if (window._paeLastSuggested) paeApplyAll(window._paeLastSuggested);
}
function paeApplyField(key, value) {
  var idMap = { prep:'pae-prep', timing:null, med_avoid:'pae-med-avoid', med_note:'pae-med-note', diet_avoid:'pae-diet-avoid', diet_note:'pae-diet-note' };
  var elId = idMap[key];
  if (elId) document.getElementById(elId).value = value;
  toast('Field applied — save to confirm', 'ok');
}

function paeApplyAll(suggested) {
  var map = { prep:'pae-prep', med_avoid:'pae-med-avoid', med_note:'pae-med-note', diet_avoid:'pae-diet-avoid', diet_note:'pae-diet-note' };
  Object.keys(map).forEach(function(k) { if (suggested[k] && suggested[k] !== 'None') document.getElementById(map[k]).value = suggested[k]; });
  toast('All fields applied — review and save', 'ok');
}
// ── PATIENT INSTRUCTION SUMMARY (s-done screen) ──────────────────────────
function buildPatientInstructions(tests) {
  if (!PA_DATA || !tests || !tests.length) return '';
  var hasFasting = false, hasIce = false, hasLight = false;
  var medAvoids = [], dietAvoids = [], timingNotes = [];
  var tubeCount = {};

  tests.forEach(function(t) {
    var dept = t.dept || 'BIOCHEMISTRY';
    var deptData = (PA_DATA[dept]) || (PA_DATA['BIOCHEMISTRY']) || {default:{},patterns:[]};
    var pa = Object.assign({}, deptData.default);
    var nm = (t.name||'').toLowerCase();
    if (deptData.patterns) deptData.patterns.forEach(function(p){ p.match.forEach(function(kw){ if(nm.indexOf(kw.toLowerCase())>=0) pa=Object.assign({},p.data); }); });
    var key = nm.replace(/[^a-z0-9]/g,'_');
    pa = mergePA(pa, key);
    if (!pa || pa.tube === 'NA') return;
    if (pa.fast) hasFasting = true;
    var prepL = (pa.prep||'').toLowerCase();
    if (prepL.indexOf('ice')>=0||prepL.indexOf('chilled')>=0) hasIce = true;
    if (prepL.indexOf('light')>=0) hasLight = true;
    if (pa.med_avoid && pa.med_avoid.toLowerCase().indexOf('stop')>=0) {
      var s = pa.med_avoid.split('.')[0];
      if (medAvoids.indexOf(s)<0) medAvoids.push(s);
    }
    if (pa.diet_avoid) { if (dietAvoids.indexOf(pa.diet_avoid)<0) dietAvoids.push(pa.diet_avoid); }
    if (pa.timing && pa.timing !== 'Any time' && pa.timing.indexOf('Any')<0) {
      var tn = (t.shortCode||t.name) + ': ' + pa.timing;
      if (timingNotes.indexOf(tn)<0) timingNotes.push(tn);
    }
    if (pa.tube && pa.tube !== 'NA') tubeCount[pa.tube] = (tubeCount[pa.tube]||0)+1;
  });

  var tubeTotal = Object.keys(tubeCount).length;
  var html = '<div id="patient-instructions" style="margin-top:16px;max-width:320px;width:100%">';

  // Ready to collect?
  if (!hasFasting && !medAvoids.length && !timingNotes.length) {
    html += '<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:12px 14px;margin-bottom:8px;text-align:left">'
      + '<div style="font-size:13px;font-weight:600;color:#14532D;margin-bottom:2px">&#10003; Ready for Collection</div>'
      + '<div style="font-size:12px;color:#166534">No special preparation needed. Collect now.</div>'
      + '</div>';
  } else {
    html += '<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:12px 14px;margin-bottom:8px;text-align:left">'
      + '<div style="font-size:13px;font-weight:600;color:#92400E;margin-bottom:6px">&#9888; Check Before Collection</div>';
    if (hasFasting) html += '<div style="font-size:12px;color:#991B1B;font-weight:600;margin-bottom:4px">&#9889; Patient must be fasting (8-12h). Confirm before drawing.</div>';
    if (timingNotes.length) timingNotes.forEach(function(n){ html += '<div style="font-size:12px;color:#92400E;margin-bottom:3px">&#8986; '+esc(n)+'</div>'; });
    if (medAvoids.length) html += '<div style="font-size:12px;color:#7C3AED;margin-bottom:3px">&#128683; '+esc(medAvoids[0])+'</div>';
    if (dietAvoids.length) html += '<div style="font-size:12px;color:#713F12;margin-bottom:3px">&#127828; '+esc(dietAvoids[0].split('.')[0])+'</div>';
    html += '</div>';
  }

  // Tubes summary
  if (tubeTotal > 0) {
    html += '<div style="font-size:11px;font-family:var(--mono);color:var(--text3);text-align:left;margin-bottom:4px">'
      + tubeTotal + ' tube type'+(tubeTotal>1?'s':'')+' · ' + tests.length + ' test'+(tests.length>1?'s':'')+' booked</div>';
  }

  html += '</div>';
  return html;
}
// ── PRE-ANALYTICAL MODULE ──
var PA_DATA = {};
var PA_ERRORS = {};
var PA_PREP = {};
var selRejReason = '';
var paSearchHits = [];

function showPATab(tab) {
  ['requirements','rejection','patientprep','rejlog'].forEach(function(t){
    document.getElementById('pa-'+t).style.display = t===tab?'block':'none';
  });
  ['req','rej','prep','log'].forEach(function(t,i){
    var id = 'pa-tab-'+['req','rej','prep','log'][i];
    var el = document.getElementById(id);
    if (el) {
      el.style.borderColor = '';
      el.style.background = '';
    }
  });
  var tabMap = {requirements:'req',rejection:'rej',patientprep:'prep',rejlog:'log'};
  var activeEl = document.getElementById('pa-tab-'+tabMap[tab]);
  if (activeEl) {
    activeEl.style.borderColor = 'var(--accent)';
    activeEl.style.background = 'var(--accent-light)';
  }
  if (tab === 'patientprep') renderPrepList();
  if (tab === 'rejlog') loadRejectionHistory();
}

function getPA(test) {
  var dept = test.dept ? test.dept.toUpperCase() : '';
  var name = (test.name || '').toLowerCase();
  var deptData = PA_DATA[dept] || PA_DATA['MISC'];
  if (!deptData) return null;
  var result = Object.assign({}, deptData.default);
  if (deptData.patterns) {
    for (var i = 0; i < deptData.patterns.length; i++) {
      var p = deptData.patterns[i];
      for (var j = 0; j < p.match.length; j++) {
        if (name.indexOf(p.match[j].toLowerCase()) >= 0) {
          result = Object.assign({}, p.data);
          break;
        }
      }
      if (result !== deptData.default) break;
    }
  }
  return result;
}

function getErrors(test) {
  var name = (test.name || '').toLowerCase();
  var flags = [];
  Object.keys(PA_ERRORS).forEach(function(key) {
    var e = PA_ERRORS[key];
    for (var i = 0; i < e.tests.length; i++) {
      if (name.indexOf(e.tests[i].toLowerCase()) >= 0) {
        flags.push(e.msg);
        break;
      }
    }
  });
  return flags;
}

function searchPA(q) {
  var el = document.getElementById('pa-results');
  if (!q || q.length < 2) { el.innerHTML = '<div class="empty" style="padding:20px">Search a test to see sample requirements</div>'; return; }
  // Wait for catalogue to load if not ready yet
  if (!_dataLoaded) {
    el.innerHTML = '<div class="empty" style="padding:20px">Loading test data...</div>';
    onDataReady(function() { searchPA(q); });
    return;
  }
  var lq = q.toLowerCase();
  paSearchHits = CATALOGUE.filter(function(t){
    return t.name.toLowerCase().indexOf(lq) >= 0 || (t.short && t.short.toLowerCase().indexOf(lq) >= 0);
  }).slice(0, 8);
  if (!paSearchHits.length) { el.innerHTML = '<div class="empty">No tests found</div>'; return; }
  el.innerHTML = paSearchHits.map(function(t, i) {
    var pa = getPA(t);
    var errors = getErrors(t);
    if (!pa) return '';
    var tubeColor = pa.color || '#6B7280';
    var errorHtml = errors.length ? '<div style="background:#FEF3C7;border:0.5px solid #F59E0B;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;color:#92400E"><b>⚠ Flag:</b> ' + errors.join(' | ') + '</div>' : '';
    var fastHtml = pa.fast ? '<span style="background:#FEE2E2;color:#991B1B;font-size:11px;font-family:var(--mono);padding:2px 8px;border-radius:10px;margin-left:6px">FASTING</span>' : '';
    return '<div class="card" style="margin-bottom:10px">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
      + '<div style="width:14px;height:14px;border-radius:50%;background:' + tubeColor + ';flex-shrink:0;border:1px solid rgba(0,0,0,0.2)"></div>'
      + '<div><div style="font-size:13px;font-weight:500">' + esc(t.name) + fastHtml + '</div><div style="font-size:11px;color:var(--text3);font-family:var(--mono)">' + esc(t.dept) + '</div></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
      + '<div><div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase">Tube</div><div style="font-size:13px;font-weight:500;margin-top:2px">' + esc(pa.label) + '</div></div>'
      + '<div><div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase">Volume</div><div style="font-size:13px;font-weight:500;margin-top:2px">' + esc(pa.vol) + '</div></div>'
      + '<div><div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase">Sample</div><div style="font-size:13px;font-weight:500;margin-top:2px">' + esc(pa.sample) + '</div></div>'
      + '<div><div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase">Timing</div><div style="font-size:13px;font-weight:500;margin-top:2px">' + esc(pa.timing) + '</div></div>'
      + '</div>'
      + '<div style="background:var(--surface2);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text2)"><b>Prep:</b> ' + esc(pa.prep) + '</div>'
      + (flagBadges ? '<div style="margin-top:8px">'+flagBadges+'</div>' : '')
      + errorHtml
      + '</div>';
  }).join('');
}

function renderPrepList() {
  var prepLabels = {
    fasting_blood: 'Fasting blood tests',
    urine_routine: 'Urine routine',
    urine_24h: '24-hour urine collection',
    semen: 'Semen analysis',
    usg_abdomen: 'USG abdomen / pelvis',
    hormone: 'Hormone tests',
    culture: 'Culture tests',
    echo_tmt: 'TMT / Stress test',
    pft: 'Spirometry / PFT',
    lbc_pap: 'Pap smear / LBC'
  };
  var icons = {
    fasting_blood:'&#127370;', urine_routine:'&#128690;', urine_24h:'&#128690;',
    semen:'&#129514;', usg_abdomen:'&#128266;', hormone:'&#128300;',
    culture:'&#129514;', echo_tmt:'&#128147;', pft:'&#129168;', lbc_pap:'&#128300;'
  };
  var el = document.getElementById('prep-list');
  var html = '';
  Object.keys(prepLabels).forEach(function(key) {
    html += '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:12px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div style="font-size:13px;font-weight:500">' + (icons[key]||'') + ' ' + esc(prepLabels[key]) + '</div>';
    html += '<button style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer" id="prep-btn-' + key + '">WhatsApp</button>';
    html += '</div>';
  });
  el.innerHTML = html;
  Object.keys(prepLabels).forEach(function(key) {
    var btn = document.getElementById('prep-btn-' + key);
    if (btn) btn.addEventListener('click', function(){ sendPrepWA(key); });
  });
}

function sendPrepWA(key) {
  var msg = PA_PREP[key];
  if (!msg) return;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// Sample rejection
function setRejReason(reason) {
  selRejReason = reason;
  var ids = ['hemolysis','clotted','insufficient','wrong-tube','unlabelled','delayed','lipemic','other'];
  var vals = ['Hemolyzed sample','Clotted sample','Insufficient volume','Wrong tube used','Unlabelled sample','Delayed transport','Lipemic sample','Other'];
  ids.forEach(function(id, i) {
    var el = document.getElementById('rr-'+id);
    if (el) el.className = 'tog' + (vals[i]===reason?' on':'');
  });
}

function submitRejection() {
  var patient = document.getElementById('rej-patient').value.trim();
  var test = document.getElementById('rej-test').value.trim();
  var notes = document.getElementById('rej-notes').value.trim();
  var ref = document.getElementById('rej-ref').value.trim();
  if (!patient) { toast('Enter patient name','warn'); return; }
  if (!selRejReason) { toast('Select rejection reason','warn'); return; }
  db.collection('rejections').add({
    patientName: patient,
    test: test,
    reason: selRejReason,
    notes: notes,
    refBy: ref,
    date: todayStr(),
    recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
    recordedBy: curUser.uid,
    recordedByName: (curProfile&&curProfile.name)||curUser.email
  }).then(function() {
    toast('Rejection recorded','ok');
    document.getElementById('rej-patient').value='';
    document.getElementById('rej-test').value='';
    document.getElementById('rej-notes').value='';
    document.getElementById('rej-ref').value='';
    selRejReason='';
    setRejReason('');
  }).catch(function(e){ toast('Error: '+e.message,'err'); });
}

function loadRejectionHistory() {
  var el = document.getElementById('rejection-history');
  el.innerHTML='<div class="empty">Loading...</div>';
  db.collection('rejections').where('date','==',todayStr()).get().then(function(snap){
    if (snap.empty) { el.innerHTML='<div class="empty">No rejections recorded today</div>'; return; }
    var rows=[];
    snap.forEach(function(d){ rows.push(Object.assign({id:d.id},d.data())); });
    el.innerHTML = rows.map(function(r){
      return '<div class="card" style="margin-bottom:10px">'
        + '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">'
        + '<div style="font-size:13px;font-weight:500">'+esc(r.patientName)+'</div>'
        + '<span style="background:var(--red-light);color:var(--red);font-size:11px;font-family:var(--mono);padding:2px 8px;border-radius:10px">REJECTED</span>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text2);margin-bottom:4px">'+esc(r.test||'-')+'</div>'
        + '<div style="font-size:12px;font-weight:500;color:var(--red)">Reason: '+esc(r.reason)+'</div>'
        + (r.notes?'<div style="font-size:12px;color:var(--text3);margin-top:4px">'+esc(r.notes)+'</div>':'')
        + '<div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-top:6px">By '+esc(r.recordedByName||'-')+'</div>'
        + '</div>';
    }).join('');
  }).catch(function(e){ el.innerHTML='<div class="empty">Error: '+e.message+'</div>'; });
}

// Add PA flag check in order step 2 — warn about pre-analytical issues
function checkPAFlags(tests) {
  var flags = [];
  tests.forEach(function(t) {
    var pa = getPA(t);
    var errs = getErrors(t);
    if (pa && pa.fast) flags.push(t.name + ': Fasting required');
    errs.forEach(function(e) { if (flags.indexOf(e)<0) flags.push(e); });
  });
  return flags;
}

