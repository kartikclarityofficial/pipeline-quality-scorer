// Pipeline Quality Scorer — interactive behavior and scoring engine
// No external deps. Runs entirely client-side. Designed for GitHub Pages.

(function(){
  'use strict';

  // Constants
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

  // State
  let state = {
    pipelineValue: null,
    opportunityCount: null,
    dims: {}, // key -> {value: number|null, touched: boolean}
    lastResult: null
  };

  // Init dims
  DIMENSIONS.forEach(d => state.dims[d.key] = {value:null, touched:false});

  // Helpers
  function clamp(n, a, b){
    if(typeof n !== 'number' || isNaN(n)) return a;
    return Math.max(a, Math.min(b, n));
  }

  function fmtCurrency(n){
    try{
      const v = Number(n) || 0;
      // show in compact if large
      return v >= 1000 ? v.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}) : v.toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2});
    }catch(e){
      return '$0';
    }
  }

  function safeParseNumber(v){
    if(v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[^0-9.-]+/g,''));
    if(isNaN(n)) return null;
    return n;
  }

  // Scoring engine
  function calculateScore(){
    // Average of dimensions that have been touched. If none touched -> null
    const values = Object.keys(state.dims).map(k => state.dims[k].value).filter(v => typeof v === 'number');
    if(values.length === 0) return null;
    const avg = values.reduce((s,x)=>s+x,0)/values.length;
    const clamped = clamp(Math.round(avg),0,100);
    return clamped;
  }

  function classifyScore(score){
    if(score === null) return {band:null,label:'No score yet',confidence:null};
    if(score >= 80) return {band:'STRONG', label:'STRONG', confidence:'HIGH'};
    if(score >= 60) return {band:'WATCH', label:'WATCH', confidence:'MODERATE'};
    if(score >= 40) return {band:'AT RISK', label:'AT RISK', confidence:'LOW'};
    return {band:'UNRELIABLE', label:'UNRELIABLE', confidence:'VERY LOW'};
  }

  function computeEvidenceSupported(pipelineValue, score){
    const pv = Number(pipelineValue) || 0;
    if(score === null) return 0;
    return Math.max(0, (pv * score / 100));
  }

  function computeRequiresValidation(pipelineValue, evidenceSupported){
    const pv = Number(pipelineValue) || 0;
    return Math.max(0, pv - evidenceSupported);
  }

  function getWeakestDimensions(){
    // Return array of {key,label,value,action} sorted ascending. Tie-breaker: DIMENSIONS order
    const arr = DIMENSIONS.map((d, idx) => {
      const v = state.dims[d.key].value;
      const val = (typeof v === 'number') ? v : 0; // treat unanswered as 0 for ranking
      return {key:d.key,label:d.label,value:val,action:d.action,order:idx,touched:state.dims[d.key].touched};
    });
    arr.sort((a,b)=>{ if(a.value !== b.value) return a.value - b.value; return a.order - b.order; });
    return arr.slice(0,3);
  }

  // Persistence
  function saveState(){
    const toSave = {
      pipelineValue: state.pipelineValue,
      opportunityCount: state.opportunityCount,
      dims: Object.keys(state.dims).reduce((acc,k)=>{acc[k]=state.dims[k];return acc;},{}),
      lastResult: state.lastResult
    };
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      showToast('Saved locally');
    }catch(e){
      showToast('Save failed');
      console.error('Save failed', e);
    }
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== 'object') return false;
      state.pipelineValue = safeParseNumber(parsed.pipelineValue);
      state.opportunityCount = safeParseNumber(parsed.opportunityCount);
      if(parsed.dims && typeof parsed.dims === 'object'){
        Object.keys(state.dims).forEach(k=>{
          if(parsed.dims[k]){
            const val = safeParseNumber(parsed.dims[k].value);
            state.dims[k].value = (val === null ? null : clamp(Math.round(val),0,100));
            state.dims[k].touched = !!parsed.dims[k].touched;
          }
        });
      }
      state.lastResult = parsed.lastResult || null;
      return true;
    }catch(e){
      console.warn('Failed to load saved state, ignoring', e);
      return false;
    }
  }

  function resetState(){
    state.pipelineValue = null;
    state.opportunityCount = null;
    Object.keys(state.dims).forEach(k=>{ state.dims[k] = {value:null,touched:false}; });
    state.lastResult = null;
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
    renderAll();
    showToast('Reset');
  }

  // UI helpers
  function $(selector, ctx=document){ return ctx.querySelector(selector); }
  function $all(selector, ctx=document){ return Array.from(ctx.querySelectorAll(selector)); }

  function showToast(msg, timeout=1800){
    let t = document.createElement('div');
    t.className = 'pqs-toast';
    t.setAttribute('role','status');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('visible'));
    setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=> t.remove(),220); }, timeout);
  }

  // Renderers
  function renderDimensionsControls(){
    const container = $('#dimensions');
    container.innerHTML = '';
    DIMENSIONS.forEach((d, idx)=>{
      const row = document.createElement('div'); row.className = 'dim-row';

      const label = document.createElement('label'); label.className='dim-label'; label.htmlFor = 'dim-'+d.key; label.textContent = d.label;
      row.appendChild(label);

      const controlWrap = document.createElement('div'); controlWrap.className='dim-controls';

      const range = document.createElement('input');
      range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'; range.id = 'dim-'+d.key; range.className='dim-range';
      range.value = state.dims[d.key].value !== null ? state.dims[d.key].value : 50;
      range.setAttribute('aria-label', d.label + ' slider');

      const number = document.createElement('input');
      number.type = 'number'; number.min='0'; number.max='100'; number.step='1'; number.className='dim-number';
      number.value = state.dims[d.key].value !== null ? state.dims[d.key].value : '';
      number.setAttribute('aria-label', d.label + ' numeric value');

      // Quick-select chips
      const chips = document.createElement('div'); chips.className='dim-chips';
      const levels = [ {label:'None', v:0},{label:'Weak',v:25},{label:'Mod',v:50},{label:'Strong',v:75},{label:'Confirmed',v:100} ];
      levels.forEach(l=>{
        const b = document.createElement('button'); b.type='button'; b.className='chip'; b.textContent = l.label; b.dataset.val = String(l.v);
        b.title = l.v + ' — quick select';
        b.addEventListener('click', ()=>{ setDimensionValue(d.key, l.v, true); range.value = l.v; number.value = l.v; renderAll(); });
        chips.appendChild(b);
      });

      // Wire events
      range.addEventListener('input', (e)=>{
        const v = safeParseNumber(e.target.value);
        setDimensionValue(d.key, v, true);
        number.value = v;
        renderAll();
      });
      number.addEventListener('change', (e)=>{
        let v = safeParseNumber(e.target.value);
        if(v === null) { number.value = ''; state.dims[d.key].value = null; state.dims[d.key].touched = false; }
        else { v = clamp(Math.round(v),0,100); number.value = v; range.value = v; setDimensionValue(d.key, v, true); }
        renderAll();
      });

      controlWrap.appendChild(range);
      controlWrap.appendChild(number);
      controlWrap.appendChild(chips);
      row.appendChild(controlWrap);

      container.appendChild(row);
    });
  }

  function setDimensionValue(key, value, touched){
    if(!(key in state.dims)) return;
    const v = (value === null ? null : clamp(Math.round(Number(value)||0,0,100)));
    state.dims[key].value = (v === null ? null : Number(v));
    if(touched) state.dims[key].touched = true;
  }

  function renderResultCard(){
    const score = calculateScore();
    const summary = classifyScore(score);
    const scoreNumEl = $('#score-number');
    const scoreLabelEl = $('#score-label');
    const evidenceSupportedEl = $('#evidence-supported');
    const requiresValidationEl = $('#requires-validation');

    if(score === null){
      scoreNumEl.textContent = '—';
      scoreLabelEl.textContent = 'No score yet';
      evidenceSupportedEl.textContent = '—';
      requiresValidationEl.textContent = '—';
    } else {
      scoreNumEl.textContent = score + ' / 100';
      scoreLabelEl.textContent = summary.label;
      const pv = state.pipelineValue || 0;
      const ev = computeEvidenceSupported(pv, score);
      const req = computeRequiresValidation(pv, ev);
      evidenceSupportedEl.textContent = fmtCurrency(ev);
      requiresValidationEl.textContent = fmtCurrency(req);
      state.lastResult = {score, label:summary.label, evidenceSupported:ev, requiresValidation:req};
    }
  }

  function renderProgress(){
    const touchedCount = Object.keys(state.dims).filter(k=>state.dims[k].touched).length;
    const pct = Math.round((touchedCount / DIMENSIONS.length) * 100);
    const fill = $('#progress-fill');
    if(fill) fill.style.width = pct + '%';
  }

  function renderConstraints(){
    const list = $('#constraints-list');
    list.innerHTML = '';
    const weakest = getWeakestDimensions();
    weakest.forEach(w=>{
      const li = document.createElement('li');
      const line = document.createElement('div');
      line.style.display='flex'; line.style.justifyContent='space-between'; line.style.gap='8px';
      const left = document.createElement('div'); left.textContent = w.label;
      const right = document.createElement('div'); right.textContent = String(Math.round(w.value));
      line.appendChild(left); line.appendChild(right);
      li.appendChild(line);
      const action = document.createElement('div'); action.className='dim-action'; action.textContent = w.action; action.style.marginTop='6px'; action.style.fontSize='13px'; action.style.color='var(--muted)';
      li.appendChild(action);
      list.appendChild(li);
    });
  }

  function renderAll(){
    // Update inputs values from state
    // pipeline and opp count
    const pvEl = $('#pipeline-value');
    const ocEl = $('#opportunity-count');
    if(pvEl) pvEl.value = state.pipelineValue !== null ? state.pipelineValue : '';
    if(ocEl) ocEl.value = state.opportunityCount !== null ? state.opportunityCount : '';

    // dims: ensure range and number inputs reflect state
    DIMENSIONS.forEach(d =>{
      const range = $('#dim-'+d.key);
      const number = range ? range.parentElement.querySelector('.dim-number') : null;
      const s = state.dims[d.key];
      if(range){ range.value = s.value !== null ? s.value : 50; }
      if(number){ number.value = s.value !== null ? s.value : ''; }
    });

    renderProgress();
    renderResultCard();
    renderConstraints();
  }

  // Copy result
  function copyResult(){
    const score = calculateScore();
    if(score === null){ showToast('No score to copy'); return; }
    const summary = classifyScore(score);
    const pv = state.pipelineValue || 0;
    const ev = computeEvidenceSupported(pv, score);
    const req = computeRequiresValidation(pv, ev);
    const weakest = getWeakestDimensions()[0];

    const lines = [];
    lines.push(`Pipeline Quality Score™: ${score}/100 — ${summary.label}`);
    lines.push('');
    lines.push(`Reported Pipeline: ${fmtCurrency(pv)}`);
    lines.push(`Evidence-supported estimate: ${fmtCurrency(ev)}`);
    lines.push(`Requires validation: ${fmtCurrency(req)}`);
    lines.push('');
    lines.push(`Top constraint: ${weakest.label} — ${Math.round(weakest.value)}`);
    lines.push('');
    lines.push(`Next action: ${weakest.action}`);
    lines.push('');
    lines.push('This assessment runs locally in your browser. It is a deterministic evidence-based estimate, not an accounting or guaranteed forecast.');

    const text = lines.join('\n');
    // Clipboard
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=> showToast('Result copied to clipboard'), ()=>{ showToast('Copy failed'); });
    } else {
      // fallback
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); showToast('Result copied to clipboard'); }catch(e){ showToast('Copy failed'); }
      ta.remove();
    }
  }

  // X-Ray
  function openXrayPanel(){
    const panel = $('#xray-panel'); panel.innerHTML = '';
    // Build form
    const title = document.createElement('h3'); title.textContent = 'Opportunity X‑Ray™'; panel.appendChild(title);
    const note = document.createElement('div'); note.className='sub'; note.textContent='Estimate an individual opportunity\'s exposure. This runs locally.'; note.style.marginTop='6px'; panel.appendChild(note);

    const form = document.createElement('form'); form.onsubmit = (e)=>{ e.preventDefault(); computeXray(form); };
    form.style.display='grid'; form.style.gridTemplateColumns='1fr 1fr'; form.style.gap='8px'; form.style.marginTop='10px';

    const valLabel = document.createElement('label'); valLabel.htmlFor='x-value'; valLabel.textContent='Opportunity value';
    const valInput = document.createElement('input'); valInput.id='x-value-input'; valInput.type='number'; valInput.step='0.01'; valInput.min='0'; valInput.placeholder='0'; valInput.style.padding='8px';
    form.appendChild(valLabel); form.appendChild(valInput);

    // per-dimension small selects
    DIMENSIONS.forEach(d=>{
      const lab = document.createElement('label'); lab.textContent = d.label; lab.htmlFor = 'x-'+d.key;
      const sel = document.createElement('select'); sel.id = 'x-'+d.key; sel.style.padding='8px';
      [['0','0'],['25','25'],['50','50'],['75','75'],['100','100']].forEach(([k,v])=>{ const o=document.createElement('option'); o.value=v; o.textContent=k; sel.appendChild(o); });
      form.appendChild(lab); form.appendChild(sel);
    });

    const btn = document.createElement('button'); btn.type='submit'; btn.className='btn-ink'; btn.textContent='Calculate X‑Ray'; btn.style.gridColumn='1 / -1'; btn.style.marginTop='8px';
    form.appendChild(btn);

    const out = document.createElement('div'); out.id='xray-output'; out.style.marginTop='10px'; form.appendChild(out);

    panel.appendChild(form);
    panel.setAttribute('aria-hidden','false');
    panel.scrollIntoView({behavior:'smooth'});
  }

  function computeXray(form){
    const v = safeParseNumber(form.querySelector('#x-value-input').value) || 0;
    const vals = DIMENSIONS.map(d=>{ const sel=form.querySelector('#x-'+d.key); return Number(sel.value) || 0; });
    const avg = Math.round(vals.reduce((s,n)=>s+n,0)/vals.length);
    const score = clamp(avg,0,100);
    const exposure = Math.max(0, v * (1 - score/100));
    const weakest = DIMENSIONS.map((d,idx)=>({label:d.label,value:vals[idx],action:d.action,order:idx})).sort((a,b)=> a.value !== b.value ? a.value - b.value : a.order - b.order).slice(0,3);
    const out = $('#xray-output'); out.innerHTML = '';
    const h = document.createElement('div'); h.className='result-card small'; h.innerHTML = `<div class="score-number">${score} / 100</div><div class="score-label">${classifyScore(score).label}</div>`;
    out.appendChild(h);
    const p = document.createElement('div'); p.style.marginTop='8px'; p.innerHTML = `<div>Estimated exposure: <strong>${fmtCurrency(exposure)}</strong></div>`;
    out.appendChild(p);
    const ol = document.createElement('ol'); ol.style.marginTop='8px'; weakest.forEach(w=>{ const li=document.createElement('li'); li.textContent = `${w.label} — ${w.value}`; ol.appendChild(li); }); out.appendChild(ol);
    const next = document.createElement('div'); next.style.marginTop='8px'; next.textContent = 'Next action: ' + weakest[0].action; out.appendChild(next);
  }

  // Wire up DOM
  document.addEventListener('DOMContentLoaded', function(){
    // existing nav toggle
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('primary-nav');
    if(toggle && nav){ toggle.addEventListener('click', function(){ const expanded = this.getAttribute('aria-expanded') === 'true'; this.setAttribute('aria-expanded', String(!expanded)); nav.classList.toggle('open'); }); document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ if(nav.classList.contains('open')){ nav.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); toggle.focus(); } } }); }

    // Build dimension controls
    renderDimensionsControls();

    // Load saved state if present
    loadState();

    // Render initial state
    renderAll();

    // Hook pipeline inputs
    const pv = $('#pipeline-value'); if(pv){ pv.addEventListener('change', (e)=>{ state.pipelineValue = safeParseNumber(e.target.value) || 0; renderAll(); }); }
    const oc = $('#opportunity-count'); if(oc){ oc.addEventListener('change', (e)=>{ state.opportunityCount = safeParseNumber(e.target.value) || 0; renderAll(); }); }

    // CTA open
    const openBtn = $('#open-assessment'); const assess = $('#assessment');
    if(openBtn && assess){ openBtn.addEventListener('click', ()=>{ const expanded = openBtn.getAttribute('aria-expanded') === 'true'; openBtn.setAttribute('aria-expanded', String(!expanded)); const hidden = assess.getAttribute('aria-hidden') === 'true'; assess.setAttribute('aria-hidden', String(!hidden)); assess.style.display = hidden ? 'block' : 'none'; if(hidden) assess.scrollIntoView({behavior:'smooth'}); }); assess.style.display='none'; }

    // Save/Reset/Copy
    const saveBtn = $('#save'); if(saveBtn) saveBtn.addEventListener('click', ()=>{ saveState(); });
    const resetBtn = $('#reset'); if(resetBtn) resetBtn.addEventListener('click', ()=>{ if(confirm('Reset assessment? This will clear local data.')) resetState(); });
    const copyBtn = $('#copy-result'); if(copyBtn) copyBtn.addEventListener('click', ()=> copyResult());

    // Open X-Ray
    const openX = $('#open-xray'); if(openX) openX.addEventListener('click', ()=> openXrayPanel());

    // Ensure any existing dimension inputs are wired (they were created by renderDimensionsControls earlier)
    // Attach listeners for touch/keyboard focus affordances
    $all('.dim-range').forEach(r=> r.addEventListener('input', ()=>{}));

    // Autosave on change (debounced)
    let saveTimer = null;
    function scheduleSave(){ if(saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ saveState(); }, 1200); }

    // Observe changes to mark touched
    $all('.dim-number').forEach(num=>{
      num.addEventListener('input', (e)=> scheduleSave());
      num.addEventListener('change', (e)=> scheduleSave());
    });
    $all('.dim-range').forEach(range=>{ range.addEventListener('input', (e)=> scheduleSave()); });

    // Ensure keyboard accessibility for chips
    $all('.chip').forEach(c=>{ c.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); c.click(); } }); });

    // Final render
    renderAll();
  });

})();
