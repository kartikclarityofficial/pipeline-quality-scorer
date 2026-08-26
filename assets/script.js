// Pipeline Quality Scorer — interactive behavior and scoring engine
// Hardened single canonical scorer. Runs entirely client-side. GitHub Pages safe.
(function(){
  'use strict';

  const STORAGE_KEY = 'pqs-assessment-v1';
  const DIMENSIONS = [
    {key:'timing', label:'Timing & Close Integrity', action:'Reconfirm buyer decision milestones before increasing forecast confidence.'},
    {key:'decision', label:'Decision Process', action:'Document the buyer-confirmed decision path, participants and approval sequence.'},
    {key:'economic', label:'Economic Buyer', action:'Establish direct access to the economic buyer or validate the economic case with the buyer.'},
    {key:'stakeholders', label:'Stakeholder Coverage', action:'Build another meaningful buyer-side relationship.'},
    {key:'event', label:'Compelling Event', action:'Validate the urgency with a buyer-confirmed business event.'},
    {key:'nextstep', label:'Next-Step Integrity', action:'Replace internal follow-up assumptions with a buyer-confirmed next step.'},
    {key:'engagement', label:'Buyer Engagement', action:'Re-establish measurable buyer activity before treating momentum as real.'},
    {key:'fit', label:'Commercial Fit', action:'Reconfirm business problem, value and commercial fit.'},
    {key:'evidence', label:'Evidence Quality', action:'Replace stale/internal evidence with recent buyer-originated evidence.'}
  ];

  // Application state
  let state = {
    pipelineValue: null, // number or null
    opportunityCount: null, // number or null
    dims: {}, // key -> {value: number|null, touched: boolean}
    lastSavedAt: null
  };
  DIMENSIONS.forEach(d => state.dims[d.key] = {value:null,touched:false});

  // Utilities
  function clamp(n, a, b){ if(typeof n !== 'number' || isNaN(n)) return a; return Math.max(a, Math.min(b, n)); }
  function safeParseNumber(v){ if(v === null || v === undefined) return null; const s = String(v).trim(); if(s==='') return null; const cleaned = s.replace(/[^0-9.-]+/g,''); if(cleaned==='') return null; const n = Number(cleaned); return (isFinite(n)? n : null); }
  function fmtCurrency(n){ if(n===null||n===undefined) return '—'; const v = Number(n); if(!isFinite(v)) return '—'; return v.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}); }

  // Canonical scoring
  function allDimensionsAnswered(){ return DIMENSIONS.every(d => typeof state.dims[d.key].value === 'number'); }
  function getAnsweredDimensions(){ return DIMENSIONS.filter(d => typeof state.dims[d.key].value === 'number'); }
  function calculateScore(){ if(!allDimensionsAnswered()) return null; const values = DIMENSIONS.map(d=>Number(state.dims[d.key].value)); const avg = values.reduce((s,x)=>s+x,0)/values.length; const rounded = Math.round(avg); return clamp(rounded,0,100); }
  function classifyScore(score){ if(score===null) return {band:null,label:'Assessment incomplete',confidence:null}; if(score>=80) return {band:'STRONG',label:'STRONG',confidence:'HIGH'}; if(score>=60) return {band:'WATCH',label:'WATCH / MODERATE',confidence:'MODERATE'}; if(score>=40) return {band:'AT_RISK',label:'AT RISK / LOW',confidence:'LOW'}; return {band:'UNRELIABLE',label:'UNRELIABLE / VERY LOW',confidence:'VERY_LOW'}; }
  function computeEvidenceSupported(pipelineValue, score){ if(pipelineValue===null || score===null) return null; const pv = Number(pipelineValue)||0; const ev = Math.round(pv * score / 100); if(!isFinite(ev) || ev<0) return null; return ev; }
  function computeRequiresValidation(pipelineValue, evidenceSupported){ if(pipelineValue===null) return null; if(evidenceSupported===null) return null; const pv = Number(pipelineValue)||0; const req = Math.max(0, Math.round(pv - evidenceSupported)); return req; }

  // Persistence
  function saveState(notify){ try{ const toSave = {pipelineValue: state.pipelineValue, opportunityCount: state.opportunityCount, dims: state.dims, lastSavedAt: (new Date()).toISOString()}; localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); state.lastSavedAt = toSave.lastSavedAt; if(notify) showToast('Saved locally'); }catch(e){ console.warn('Save failed',e); } }
  function loadState(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return false; const parsed = JSON.parse(raw); if(!parsed || typeof parsed !== 'object') return false; state.pipelineValue = safeParseNumber(parsed.pipelineValue); state.opportunityCount = safeParseNumber(parsed.opportunityCount); if(parsed.dims && typeof parsed.dims === 'object'){ Object.keys(state.dims).forEach(k=>{ if(parsed.dims[k] && typeof parsed.dims[k] === 'object' && typeof parsed.dims[k].value !== 'undefined' && parsed.dims[k].value !== null){ const n = safeParseNumber(parsed.dims[k].value); state.dims[k] = {value: (n===null? null: clamp(Math.round(n),0,100)), touched: !!parsed.dims[k].touched}; } else { state.dims[k] = {value:null,touched:false}; } }); } state.lastSavedAt = parsed.lastSavedAt || null; return true; }catch(e){ console.warn('Load failed',e); return false; } }
  function resetState(){ state.pipelineValue = null; state.opportunityCount = null; Object.keys(state.dims).forEach(k => state.dims[k] = {value:null,touched:false}); state.lastSavedAt = null; saveState(false); renderAll(); showToast('Reset'); }

  // DOM helpers
  function $(sel, ctx=document){ return ctx.querySelector(sel); }
  function $all(sel, ctx=document){ return Array.from((ctx||document).querySelectorAll(sel)); }

  function showToast(msg, timeout=1600){ try{ const t = document.createElement('div'); t.className = 'pqs-toast'; t.setAttribute('role','status'); t.textContent = msg; document.body.appendChild(t); requestAnimationFrame(()=> t.classList.add('visible')); setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=> t.remove(), 300); }, timeout); }catch(e){ console.warn('Toast failed', e); } }

  // Render dimension controls in assessment
  function renderDimensionsControls(){ const container = $('#dimensions'); if(!container) return; container.innerHTML = ''; DIMENSIONS.forEach(d=>{
    const row = document.createElement('div'); row.className = 'dim-row';
    const label = document.createElement('div'); label.className = 'dim-label'; label.textContent = d.label;
    const desc = document.createElement('div'); desc.className = 'dim-action sub'; desc.textContent = d.action;
    const controls = document.createElement('div'); controls.className = 'dim-controls';

    // range input
    const range = document.createElement('input'); range.type = 'range'; range.min = 0; range.max = 100; range.step = 1; range.className = 'dim-range'; range.id = 'dim-'+d.key; range.setAttribute('aria-label', d.label+' slider');
    // numeric input
    const number = document.createElement('input'); number.type = 'number'; number.min = 0; number.max = 100; number.step = 1; number.className = 'dim-number'; number.id = 'dim-'+d.key+'-num'; number.setAttribute('aria-label', d.label+' numeric');
    // chips (quick presets)
    const chips = document.createElement('div'); chips.className = 'dim-chips'; ['0','25','50','75','100'].forEach(val=>{ const b = document.createElement('button'); b.type='button'; b.className='chip'; b.setAttribute('data-val', val); b.textContent = val; b.setAttribute('aria-pressed','false'); b.addEventListener('click', ()=>{ const n = safeParseNumber(val); setDimensionValue(d.key, n, true); }); chips.appendChild(b); });

    controls.appendChild(range); controls.appendChild(number); controls.appendChild(chips);
    row.appendChild(label); row.appendChild(controls); row.appendChild(desc);

    container.appendChild(row);

    // wire events
    range.addEventListener('input', (e)=>{ const n = safeParseNumber(e.target.value); setDimensionValue(d.key, (n===null? null: clamp(Math.round(n),0,100)), true); });
    number.addEventListener('change', (e)=>{ const n = safeParseNumber(e.target.value); setDimensionValue(d.key, (n===null? null: clamp(Math.round(n),0,100)), true); });
  });
  updateDimensionInputsFromState();
  }

  function setDimensionValue(key, value, touched){ if(!(key in state.dims)) return; state.dims[key].value = (value===null? null : clamp(Number(value),0,100)); if(touched) state.dims[key].touched = true; updateDimensionInputsFromState(); renderAll(); scheduleSave(); }

  function updateDimensionInputsFromState(){ DIMENSIONS.forEach(d=>{ const range = document.getElementById('dim-'+d.key); const num = document.getElementById('dim-'+d.key+'-num'); const chips = range ? range.parentElement.querySelectorAll('.chip') : []; const s = state.dims[d.key]; if(range) range.value = (s.value===null? range.min : s.value); if(num) num.value = (s.value===null? '' : s.value); if(chips.length){ chips.forEach(c=>{ const v = safeParseNumber(c.getAttribute('data-val')); if(s.value!==null && Number(s.value) === Number(v)){ c.classList.add('selected'); c.setAttribute('aria-pressed','true'); } else { c.classList.remove('selected'); c.setAttribute('aria-pressed','false'); } }); } if(range) { if(s.value===null) range.classList.add('unanswered'); else range.classList.remove('unanswered'); } }); }

  function renderResultCard(){ const score = calculateScore(); const scoreNumEl = $('#score-number'); const scoreLabelEl = $('#score-label'); const scoreConfidenceEl = $('#score-confidence'); const reportedEl = $('#reported-pipeline'); if(scoreNumEl){ if(score===null){ scoreNumEl.textContent = 'Assessment incomplete'; scoreLabelEl.textContent = `${getAnsweredDimensions().length} of ${DIMENSIONS.length} dimensions completed`; scoreConfidenceEl.setAttribute('aria-hidden','true'); } else { scoreNumEl.textContent = score + '/100'; const cl = classifyScore(score); scoreLabelEl.textContent = cl.label; scoreConfidenceEl.setAttribute('aria-hidden','false'); scoreConfidenceEl.textContent = cl.confidence; scoreConfidenceEl.className = 'score-confidence ' + (cl.confidence === 'HIGH'? 'high' : (cl.confidence==='MODERATE'? 'moderate' : (cl.confidence==='LOW'? 'low':'very-low'))); } }

    // reported pipeline display
    if(reportedEl){ reportedEl.textContent = state.pipelineValue !== null ? fmtCurrency(state.pipelineValue) : '—'; }
  }

  function renderProgress(){ const answered = getAnsweredDimensions().length; const pct = Math.round((answered / DIMENSIONS.length) * 100); const fill = $('#progress-fill'); if(fill) fill.style.width = pct + '%'; }

  function renderConstraints(){ const list = $('#constraints-list'); if(!list) return; list.innerHTML = ''; if(!allDimensionsAnswered()){ const li = document.createElement('li'); li.style.color='var(--muted)'; li.textContent = 'Complete the remaining dimensions to identify the true weakest constraints.'; list.appendChild(li); return; } const pairs = DIMENSIONS.map(d=>({key:d.key,label:d.label,value: state.dims[d.key].value})).sort((a,b)=>a.value - b.value); pairs.slice(0,3).forEach(p => { const li = document.createElement('li'); li.style.padding='6px 0'; li.textContent = `${p.label}: ${p.value}/100 — Recommended: ${p.label === 'Stakeholder Coverage' ? 'Map additional stakeholders and confirm economic buyer' : state.dims[p.key].value <= 40 ? 'Gather direct buyer evidence and next-step confirmation' : 'Monitor and confirm'}`; list.appendChild(li); }); }

  function renderEvidenceFigures(){ const evEl = $('#evidence-supported'); const reqEl = $('#requires-validation'); const pv = state.pipelineValue; const score = calculateScore(); if(evEl) evEl.textContent = (calculateScore()===null ? '—' : fmtCurrency(computeEvidenceSupported(pv, score))); if(reqEl) reqEl.textContent = (calculateScore()===null ? '—' : fmtCurrency(computeRequiresValidation(pv, computeEvidenceSupported(pv, score)))); }

  function renderAll(){ renderResultCard(); renderProgress(); renderConstraints(); renderEvidenceFigures(); updateDimensionInputsFromState(); }

  // Copy result
  function copyResult(){ const score = calculateScore(); if(score===null){ showToast('Complete all 9 dimensions to copy the result'); return; } const pv = state.pipelineValue || 0; const ev = computeEvidenceSupported(pv, score) || 0; const req = computeRequiresValidation(pv, ev) || 0; const text = `Pipeline Quality Score: ${score}/100\nEvidence-supported: ${fmtCurrency(ev)}\nRequires validation: ${fmtCurrency(req)}`; if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(()=> showToast('Copied result to clipboard'), ()=> showToast('Copy failed')); } else { // fallback
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); showToast('Copied result to clipboard'); }catch(e){ showToast('Copy failed'); } ta.remove(); }
  }

  // X-Ray: small calculator in sidebar
  function openXrayPanel(){ const panel = $('#xray-panel'); if(!panel) return; panel.innerHTML = ''; panel.setAttribute('data-xray-open','true'); const title = document.createElement('h3'); title.textContent = 'Opportunity X‑Ray'; panel.appendChild(title);
    const form = document.createElement('form'); form.id = 'xray-form'; form.innerHTML = `
      <div style="margin-top:8px;"><label class="eyebrow">Opportunity value</label><input id="x-value-input" type="text" placeholder="e.g. 882000" style="width:100%;padding:8px;border:1px solid var(--rule);border-radius:8px;"/></div>
      <div style="margin-top:8px;" id="x-presets"></div>
      <div style="margin-top:12px;display:flex;gap:8px;"><button type="button" id="x-calc" class="btn-ink">Calculate</button><button type="button" id="x-close" class="btn-ink">Close</button></div>
      <div id="x-result" style="margin-top:12px;"></div>
    `;
    panel.appendChild(form);
    // create checkboxes for dims to override
    const presets = $('#x-presets'); DIMENSIONS.forEach(d=>{ const row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.marginTop='6px'; const lbl = document.createElement('label'); lbl.textContent = d.label; const inp = document.createElement('input'); inp.type='number'; inp.min=0; inp.max=100; inp.step=1; inp.id = 'x-'+d.key; inp.placeholder = 'auto'; inp.style.width='84px'; row.appendChild(lbl); row.appendChild(inp); presets.appendChild(row); });

    // handlers
    $('#x-calc').addEventListener('click', ()=>{ const pv = safeParseNumber($('#x-value-input').value) || 0; const vals = DIMENSIONS.map(d=>{ const v = safeParseNumber($('#x-'+d.key).value); return (typeof v==='number' && v!==null) ? clamp(Math.round(v),0,100) : (state.dims[d.key].value===null? null : state.dims[d.key].value); }); // if any nulls, cannot compute final score
      if(vals.some(v=>v===null)){ $('#x-result').textContent = 'X‑Ray requires values for all 9 dimensions (use saved state or enter overrides)'; return; } const avg = Math.round(vals.reduce((s,x)=>s+x,0)/vals.length); const ev = computeEvidenceSupported(pv, avg); const req = computeRequiresValidation(pv, ev); $('#x-result').innerHTML = `<div class="sub">Score ${avg}/100</div><div style="margin-top:6px;">Evidence-supported: ${fmtCurrency(ev)}<br/>Requires validation: ${fmtCurrency(req)}</div>`; });
    $('#x-close').addEventListener('click', ()=>{ while(panel.firstChild) panel.removeChild(panel.firstChild); panel.removeAttribute('data-xray-open'); const openBtn = document.getElementById('open-xray'); if(openBtn) openBtn.focus(); });
  }

  // Page populators for read-only pages
  function populatePipelinePage(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return; const parsed = JSON.parse(raw); if(!parsed) return; const pv = safeParseNumber(parsed.pipelineValue); const dims = parsed.dims || {}; const reportedEl = document.getElementById('reported-pipeline'); const evEl = document.getElementById('evidence-supported'); const reqEl = document.getElementById('requires-validation'); const healthFill = document.getElementById('pipeline-health-fill'); const healthLabel = document.getElementById('pipeline-health-label'); const weakestList = document.getElementById('weakest-list'); if(reportedEl) reportedEl.textContent = pv!==null? fmtCurrency(pv) : '—';
    // compute if all dims present as numbers
    const dimKeys = DIMENSIONS.map(d=>d.key);
    const values = dimKeys.map(k=>{ const v = (dims[k] && typeof dims[k].value !== 'undefined') ? safeParseNumber(dims[k].value) : null; return (v===null? null : clamp(Math.round(v),0,100)); });
    const answered = values.filter(v=>typeof v==='number'); if(answered.length === 9){ const avg = Math.round(answered.reduce((s,x)=>s+x,0)/9); const ev = computeEvidenceSupported(pv, avg); const req = computeRequiresValidation(pv, ev); if(evEl) evEl.textContent = fmtCurrency(ev); if(reqEl) reqEl.textContent = fmtCurrency(req); if(healthFill) healthFill.style.width = Math.round((answered.length/9)*100) + '%'; if(healthLabel) healthLabel.textContent = `${answered.length} of 9 dimensions assessed · score ${avg}/100`; // weakest constraints
      if(weakestList){ weakestList.innerHTML=''; const pairs = dimKeys.map((k,i)=>({key:k,value:values[i],label: DIMENSIONS.find(d=>d.key===k).label})).sort((a,b)=>(a.value - b.value)); pairs.slice(0,3).forEach(p=>{ const li = document.createElement('li'); li.style.padding='10px 0'; li.style.borderTop='1px solid var(--rule)'; li.textContent = `${p.label}: ${p.value}/100 — Recommend: ${p.value<=40? 'Gather direct buyer evidence and next-step confirmation' : 'Monitor and confirm'}`; weakestList.appendChild(li); }); }
    } else {
      if(evEl) evEl.textContent = '—'; if(reqEl) reqEl.textContent = '—'; if(healthFill) healthFill.style.width = '0%'; if(healthLabel) healthLabel.textContent = 'Not assessed · complete a scorer on the Dashboard to evaluate'; if(weakestList) weakestList.innerHTML = '<li style="padding:10px 0;border-top:1px solid var(--rule);">No diagnostics available — open the assessment on the Dashboard to evaluate. <strong>(DEMO DATA)</strong></li>'; }
  }catch(e){ console.warn('populatePipelinePage failed', e); } }

  function populateRelationshipsPage(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return; const parsed = JSON.parse(raw); if(!parsed) return; const dims = parsed.dims || {}; const stakeholders = (dims['stakeholders'] && typeof dims['stakeholders'].value === 'number') ? Number(dims['stakeholders'].value) : null; const highEl = document.getElementById('rel-high-risk'); const singleEl = document.getElementById('rel-single-thread'); const avgEl = document.getElementById('rel-avg-stakeholders'); const unconfirmedEl = document.getElementById('rel-unconfirmed'); if(highEl) highEl.textContent = (stakeholders===null ? 'Not assessed' : (stakeholders < 40 ? 'High' : 'Low')); if(singleEl) singleEl.textContent = (stakeholders===null ? 'Not assessed' : (stakeholders < 40 ? 'Yes' : 'No')); if(avgEl) avgEl.textContent = (stakeholders===null ? '—' : ( (stakeholders/1).toFixed(1) )); if(unconfirmedEl) unconfirmedEl.textContent = (parsed.dims && parsed.dims['economic'] && typeof parsed.dims['economic'].value === 'number' ? (parsed.dims['economic'].value < 50 ? 'Many' : 'Few') : 'Not assessed'); }catch(e){ console.warn('populateRelationshipsPage failed', e); } }

  function populateDiagnosticPage(){ try{ const container = document.getElementById('diagnostic-dimensions'); if(!container) return; container.innerHTML = ''; const raw = localStorage.getItem(STORAGE_KEY); const parsed = raw ? JSON.parse(raw) : null; DIMENSIONS.forEach(d=>{ const val = (parsed && parsed.dims && parsed.dims[d.key] && typeof parsed.dims[d.key].value === 'number') ? clamp(Math.round(parsed.dims[d.key].value),0,100) : null; const cell = document.createElement('div'); cell.className = 'cell'; cell.style.padding='16px 0'; const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.innerHTML = `<div style="font-weight:700">${d.label}</div><div class="pill ${val===null? 'pill-caution':''}" style="min-width:80px;text-align:right">${val===null? 'Not assessed': (val + ' / 100')}</div>`; const meterWrap = document.createElement('div'); meterWrap.className = 'meter-track'; meterWrap.style.marginTop='8px'; const fill = document.createElement('div'); fill.className = 'meter-fill'; if(val===null){ fill.style.width = '0%'; fill.style.background = 'linear-gradient(90deg, rgba(23,21,15,0.04), rgba(23,21,15,0.02))'; } else { fill.style.width = val + '%'; if(val < 40) fill.classList.add('bg-risk'); else if(val < 60) fill.classList.add('bg-caution'); else fill.classList.add('bg-supported'); }
      meterWrap.appendChild(fill);
      const q = document.createElement('p'); q.style.marginTop = '10px'; q.innerHTML = `<span class="eyebrow">Question</span> — ${d.label} evaluated from recorded buyer evidence.`;
      const m = document.createElement('p'); m.style.marginTop = '6px'; m.className = 'sub'; m.textContent = d.action;
      cell.appendChild(header); cell.appendChild(meterWrap); cell.appendChild(q); cell.appendChild(m);
      container.appendChild(cell);
    }); }catch(e){ console.warn('populateDiagnosticPage failed', e); } }

  function populateActionsPage(){ try{ const list = document.querySelector('.rule-y'); if(!list) return; const raw = localStorage.getItem(STORAGE_KEY); if(!raw){ // leave demo content but don't invent
      return; } const parsed = JSON.parse(raw); const dims = parsed.dims || {}; // determine weaknesses
    const pairs = DIMENSIONS.map(d=>({key:d.key,label:d.label,value: (dims[d.key] && typeof dims[d.key].value === 'number') ? Number(dims[d.key].value) : null, action:d.action})); const weaknesses = pairs.filter(p=>p.value!==null).sort((a,b)=>a.value-b.value); if(weaknesses.length===0) return; // build top 5
    // clear existing list children (keep structure)
    while(list.firstChild) list.removeChild(list.firstChild);
    weaknesses.slice(0,6).forEach((w,idx)=>{ const li = document.createElement('li'); li.style.padding='18px 0'; const div = document.createElement('div'); div.style.display='flex'; div.style.gap='12px'; div.style.alignItems='flex-start'; const box = document.createElement('span'); box.setAttribute('aria-hidden','true'); box.style.marginTop='3px'; box.style.width='14px'; box.style.height='14px'; box.style.border='1.5px solid var(--rule)'; box.style.borderRadius='3px'; box.style.display='inline-block'; const content = document.createElement('div'); content.style.flex='1'; const hdiv = document.createElement('div'); hdiv.style.display='flex'; hdiv.style.justifyContent='space-between'; hdiv.style.alignItems='baseline'; const title = document.createElement('div'); title.className = 'font-display'; title.style.fontSize='16px'; title.textContent = w.label; const priority = document.createElement('span'); priority.className = 'pill ' + (idx<2? 'pill-risk':'pill-caution'); priority.textContent = (idx<2? 'Urgent':'High'); hdiv.appendChild(title); hdiv.appendChild(priority); const p = document.createElement('p'); p.style.margin='6px 0 0'; p.style.fontSize='13.5px'; p.textContent = w.action; const meta = document.createElement('p'); meta.style.margin='6px 0 0'; meta.style.fontSize='11.5px'; meta.style.color='var(--muted)'; meta.textContent = `Quality ${w.value}/100`; content.appendChild(hdiv); content.appendChild(p); content.appendChild(meta); div.appendChild(box); div.appendChild(content); li.appendChild(div); list.appendChild(li); }); }catch(e){ console.warn('populateActionsPage failed', e); } }

  // Wire UI and events
  document.addEventListener('DOMContentLoaded', ()=>{
    // nav toggle
    const toggle = document.querySelector('.nav-toggle'); const nav = document.getElementById('primary-nav'); if(toggle && nav){ toggle.addEventListener('click', function(){ const expanded = this.getAttribute('aria-expanded') === 'true'; this.setAttribute('aria-expanded', String(!expanded)); nav.classList.toggle('open'); }); }

    // Render controls and load stored state
    renderDimensionsControls(); loadState(); renderAll();

    // pipeline/opportunity inputs
    const pv = document.getElementById('pipeline-value'); if(pv){ pv.addEventListener('change', (e)=>{ state.pipelineValue = safeParseNumber(e.target.value); renderAll(); scheduleSave(); }); pv.value = state.pipelineValue !== null ? state.pipelineValue : ''; }
    const oc = document.getElementById('opportunity-count'); if(oc){ oc.addEventListener('change', (e)=>{ state.opportunityCount = safeParseNumber(e.target.value); renderAll(); scheduleSave(); }); oc.value = state.opportunityCount !== null ? state.opportunityCount : ''; }

    // Open/close assessment
    const openBtn = document.getElementById('open-assessment'); const assess = document.getElementById('assessment'); if(openBtn && assess){ openBtn.addEventListener('click', ()=>{ const expanded = openBtn.getAttribute('aria-expanded') === 'true'; if(!expanded){ assess.style.display = 'block'; assess.setAttribute('aria-hidden','false'); openBtn.setAttribute('aria-expanded','true'); // move focus to first field
          const first = document.getElementById('pipeline-value') || document.querySelector('#dimensions .dim-range'); if(first) first.focus(); } else { assess.style.display = 'none'; assess.setAttribute('aria-hidden','true'); openBtn.setAttribute('aria-expanded','false'); openBtn.focus(); } }); }

    // Save/reset/copy/xray
    const saveBtn = document.getElementById('save'); if(saveBtn) saveBtn.addEventListener('click', ()=> saveState(true));
    const resetBtn = document.getElementById('reset'); if(resetBtn) resetBtn.addEventListener('click', ()=>{ if(confirm('Reset assessment? This will clear local data.')){ resetState(); } });
    const copyBtn = document.getElementById('copy-result'); if(copyBtn) copyBtn.addEventListener('click', ()=> copyResult());
    const openX = document.getElementById('open-xray'); if(openX) openX.addEventListener('click', ()=>{ openXrayPanel(); const panel = document.getElementById('xray-panel'); if(panel) panel.scrollIntoView({behavior:'smooth'}); });

    // Delegated events for dim chips keyboard
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){ const el = document.activeElement; if(el && el.classList && el.classList.contains('chip')){ e.preventDefault(); el.click(); } }
      if(e.key === 'Escape' || e.key === 'Esc'){
        // Close assessment
        const assessEl = document.getElementById('assessment'); const openBtnEl = document.getElementById('open-assessment'); if(assessEl && assessEl.getAttribute('aria-hidden') === 'false'){ assessEl.setAttribute('aria-hidden','true'); assessEl.style.display = 'none'; if(openBtnEl){ openBtnEl.setAttribute('aria-expanded','false'); openBtnEl.focus(); } }
        // Close X-Ray if open
        const xpanel = document.getElementById('xray-panel'); if(xpanel && xpanel.getAttribute('data-xray-open') === 'true'){ while(xpanel.firstChild) xpanel.removeChild(xpanel.firstChild); xpanel.removeAttribute('data-xray-open'); const openXBtn = document.getElementById('open-xray'); if(openXBtn) openXBtn.focus(); }
      }
    });

    // Autosave
    let saveTimer = null; window.scheduleSave = function(){ if(saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ saveState(false); }, 700); };

    // Expose populators globally for read-only pages
    window.pqsPopulatePipelinePage = populatePipelinePage; window.pqsPopulateRelationshipsPage = populateRelationshipsPage; window.pqsPopulateDiagnosticPage = populateDiagnosticPage; window.pqsPopulateActionsPage = populateActionsPage;

    // Run populators on read-only pages
    if(document.getElementById('reported-pipeline')) populatePipelinePage();
    if(document.getElementById('rel-high-risk')) populateRelationshipsPage();
    if(document.getElementById('diagnostic-dimensions')) populateDiagnosticPage();
    if(document.querySelector('.rule-y')) populateActionsPage();

    // Final render
    renderAll();
  });
})();
