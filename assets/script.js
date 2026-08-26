// Pipeline Quality Scorer — interactive behavior and scoring engine (canonical, hardened)
// Runs entirely client-side, no dependencies. Implements a single deterministic 9-dimension scorer.

(function(){
  'use strict';

  const STORAGE_KEY = 'pqs-assessment-v1';
  const DIMENSIONS = [
    {key:'timing', label:'Timing', action:'Reconfirm buyer decision milestones before increasing forecast confidence.'},
    {key:'decision', label:'Decision', action:'Document the buyer-confirmed decision path, participants and approval sequence.'},
    {key:'economic', label:'Economic', action:'Establish direct access to the economic buyer or validate the economic case with the buyer.'},
    {key:'stakeholders', label:'Stakeholders', action:'Build another meaningful buyer-side relationship.'},
    {key:'event', label:'Event', action:'Validate the urgency with a buyer-confirmed business event.'},
    {key:'nextstep', label:'Next step', action:"Replace internal follow-up assumptions with a buyer-confirmed next step."},
    {key:'engagement', label:'Engagement', action:'Re-establish measurable buyer activity before treating momentum as real.'},
    {key:'fit', label:'Fit', action:'Reconfirm business problem, value and commercial fit.'},
    {key:'evidence', label:'Evidence', action:'Replace stale/internal evidence with recent buyer-originated evidence.'}
  ];

  // State
  let state = {
    pipelineValue: null,
    opportunityCount: null,
    dims: {}, // key -> {value: number|null, touched: boolean}
    lastResult: null
  };
  DIMENSIONS.forEach(d => state.dims[d.key] = {value:null,touched:false});

  // Helpers
  function clamp(n, a, b){ if(typeof n !== 'number' || isNaN(n)) return a; return Math.max(a, Math.min(b, n)); }
  function safeParseNumber(v){
    if(v === null || v === undefined) return null;
    const s = String(v).trim();
    if(s === '') return null;
    const cleaned = s.replace(/[^0-9.-]+/g,'');
    const n = Number(cleaned);
    if(!isFinite(n)) return null;
    return n;
  }
  function fmtCurrency(n){
    if(n === null || n === undefined) return '—';
    try{ const v = Number(n) || 0; return v.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}); }
    catch(e){ return '$0'; }
  }

  // Scoring rules
  function allDimensionsAnswered(){ return DIMENSIONS.every(d => typeof state.dims[d.key].value === 'number'); }
  function calculateScore(){
    if(!allDimensionsAnswered()) return null;
    const values = DIMENSIONS.map(d => state.dims[d.key].value);
    const avg = values.reduce((s,x)=>s+Number(x),0) / values.length;
    return clamp(Math.round(avg),0,100);
  }
  function classifyScore(score){
    if(score === null) return {band:null,label:'Assessment incomplete',confidence:null};
    if(score >= 80) return {band:'STRONG',label:'STRONG',confidence:'HIGH'};
    if(score >= 60) return {band:'WATCH',label:'WATCH',confidence:'MODERATE'};
    if(score >= 40) return {band:'AT RISK',label:'AT RISK',confidence:'LOW'};
    return {band:'UNRELIABLE',label:'UNRELIABLE',confidence:'VERY LOW'};
  }

  function computeEvidenceSupported(pipelineValue, score){
    if(pipelineValue === null || score === null) return null;
    const pv = Number(pipelineValue) || 0;
    const ev = pv * score / 100;
    if(!isFinite(ev) || isNaN(ev)) return 0;
    return Math.max(0, ev);
  }
  function computeRequiresValidation(pipelineValue, evidenceSupported){
    if(pipelineValue === null || evidenceSupported === null) return null;
    const pv = Number(pipelineValue) || 0;
    const req = pv - (Number(evidenceSupported) || 0);
    if(!isFinite(req) || isNaN(req)) return 0;
    return Math.max(0, req);
  }

  function getAnsweredDimensions(){ return DIMENSIONS.filter(d => typeof state.dims[d.key].value === 'number'); }
  function getWeakestDimensions(){
    // deterministic ranking across all 9 if answered
    const answered = DIMENSIONS.map(d=>({key:d.key,label:d.label,value:state.dims[d.key].value,action:d.action,order: DIMENSIONS.findIndex(x=>x.key===d.key)}));
    // For unanswered, leave value as null; sort: unanswered last
    answered.sort((a,b)=>{
      const av = typeof a.value === 'number' ? a.value : 9999;
      const bv = typeof b.value === 'number' ? b.value : 9999;
      if(av !== bv) return av - bv; return a.order - b.order;
    });
    // Return weakest 3 that have numeric values; if fewer than 3 answered, return those answered
    const numeric = answered.filter(x=>typeof x.value === 'number');
    return numeric.slice(0,3);
  }

  // Persistence
  function saveState(notify=false){
    const toSave = {
      pipelineValue: state.pipelineValue,
      opportunityCount: state.opportunityCount,
      dims: Object.keys(state.dims).reduce((acc,k)=>{ acc[k] = state.dims[k]; return acc; }, {}),
      lastResult: state.lastResult
    };
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      if(notify) showToast('Saved locally');
    }catch(e){
      if(notify) showToast('Save failed');
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

  // DOM helpers
  function $(sel, ctx=document){ return ctx.querySelector(sel); }
  function $all(sel, ctx=document){ return Array.from(ctx.querySelectorAll(sel)); }

  function showToast(msg, timeout=1400){
    const t = document.createElement('div'); t.className = 'pqs-toast'; t.setAttribute('role','status'); t.textContent = msg; document.body.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('visible'));
    setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=> t.remove(),220); }, timeout);
  }

  // Renderers
  function renderDimensionsControls(){
    const container = $('#dimensions');
    if(!container) return;
    container.innerHTML = '';

    DIMENSIONS.forEach((d)=>{
      const row = document.createElement('div'); row.className='dim-row';
      const label = document.createElement('label'); label.className='dim-label'; label.htmlFor = 'dim-'+d.key; label.textContent = d.label; row.appendChild(label);

      const controlWrap = document.createElement('div'); controlWrap.className='dim-controls';

      const range = document.createElement('input');
      range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'; range.id = 'dim-'+d.key; range.className = 'dim-range'; range.setAttribute('aria-label', d.label + ' slider');

      const notAssessed = document.createElement('span'); notAssessed.className = 'not-assessed'; notAssessed.textContent = 'Not assessed';

      const number = document.createElement('input');
      number.type = 'number'; number.min = '0'; number.max = '100'; number.step = '1'; number.className = 'dim-number'; number.setAttribute('aria-label', d.label + ' numeric value'); number.style.width = '84px';

      // Quick chips Low/Mid/High
      const chips = document.createElement('div'); chips.className = 'dim-chips';
      const levels = [ {label:'Low', v:25},{label:'Mid',v:50},{label:'High',v:75} ];
      levels.forEach(l=>{
        const b = document.createElement('button'); b.type='button'; b.className='chip'; b.textContent = l.label; b.dataset.val = String(l.v); b.title = l.label + ' — quick select'; b.setAttribute('aria-pressed','false');
        b.addEventListener('click', ()=>{ setDimensionValue(d.key, l.v, true); renderAll(); scheduleSave(); });
        b.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
        chips.appendChild(b);
      });

      range.addEventListener('input', (e)=>{
        const v = safeParseNumber(e.target.value);
        if(v === null) setDimensionValue(d.key, null, true);
        else setDimensionValue(d.key, clamp(Math.round(v),0,100), true);
        renderAll(); scheduleSave();
      });

      number.addEventListener('change', (e)=>{
        const v = safeParseNumber(e.target.value);
        if(v === null) setDimensionValue(d.key, null, true);
        else setDimensionValue(d.key, clamp(Math.round(v),0,100), true);
        renderAll(); scheduleSave();
      });

      controlWrap.appendChild(range);
      controlWrap.appendChild(notAssessed);
      controlWrap.appendChild(number);
      controlWrap.appendChild(chips);
      row.appendChild(controlWrap);
      container.appendChild(row);
    });
  }

  function setDimensionValue(key, value, touched){
    if(!(key in state.dims)) return;
    if(value === null || value === undefined){ state.dims[key].value = null; if(touched) state.dims[key].touched = true; return; }
    const vnum = clamp(Math.round(Number(value)||0),0,100);
    state.dims[key].value = Number(vnum);
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
      if(scoreNumEl) scoreNumEl.textContent = 'Assessment incomplete';
      if(scoreLabelEl) scoreLabelEl.textContent = `${getAnsweredDimensions().length} of ${DIMENSIONS.length} dimensions completed`;
      if(evidenceSupportedEl) evidenceSupportedEl.textContent = '—';
      if(requiresValidationEl) requiresValidationEl.textContent = '—';
    } else {
      if(scoreNumEl) scoreNumEl.textContent = score + ' / 100';
      if(scoreLabelEl) scoreLabelEl.textContent = summary.label;
      const pv = state.pipelineValue;
      const ev = computeEvidenceSupported(pv, score);
      const req = computeRequiresValidation(pv, ev);
      if(evidenceSupportedEl) evidenceSupportedEl.textContent = ev === null ? '—' : fmtCurrency(ev);
      if(requiresValidationEl) requiresValidationEl.textContent = req === null ? '—' : fmtCurrency(req);
      state.lastResult = {score, label:summary.label, evidenceSupported:ev, requiresValidation:req};
    }
  }

  function renderProgress(){
    const answeredCount = getAnsweredDimensions().length;
    const pct = Math.round((answeredCount / DIMENSIONS.length) * 100);
    const fill = $('#progress-fill');
    if(fill) fill.style.width = pct + '%';
    // Also update result label to show X of 9
    const scoreLabelEl = $('#score-label');
    if(scoreLabelEl && calculateScore() === null){
      scoreLabelEl.textContent = `${answeredCount} of ${DIMENSIONS.length} dimensions completed`;
    }
  }

  function renderConstraints(){
    const list = $('#constraints-list');
    if(!list) return;
    list.innerHTML = '';
    if(!allDimensionsAnswered()){
      const li = document.createElement('li'); li.textContent = 'Complete the remaining dimensions to identify the true weakest constraints.'; li.style.color='var(--muted)'; list.appendChild(li); return;
    }
    const weakest = getWeakestDimensions();
    weakest.forEach(w=>{
      const li = document.createElement('li');
      const line = document.createElement('div'); line.style.display='flex'; line.style.justifyContent='space-between'; line.style.gap='8px';
      const left = document.createElement('div'); left.textContent = w.label;
      const right = document.createElement('div'); right.textContent = String(Math.round(w.value));
      line.appendChild(left); line.appendChild(right);
      li.appendChild(line);
      const action = document.createElement('div'); action.className='dim-action'; action.textContent = w.action; action.style.marginTop='6px'; action.style.fontSize='13px'; action.style.color='var(--muted)';
      li.appendChild(action);
      list.appendChild(li);
    });
  }

  function updateDimensionInputsFromState(){
    DIMENSIONS.forEach(d =>{
      const range = document.getElementById('dim-'+d.key);
      const row = range ? range.closest('.dim-row') : null;
      const number = row ? row.querySelector('.dim-number') : null;
      const notAssessed = row ? row.querySelector('.not-assessed') : null;
      const s = state.dims[d.key];
      if(range){
        if(typeof s.value === 'number'){
          range.value = s.value;
          range.classList.remove('unanswered');
          range.setAttribute('aria-valuenow', String(s.value));
        } else {
          range.value = 50; // neutral visual position only
          range.classList.add('unanswered');
          range.removeAttribute('aria-valuenow');
        }
      }
      if(number){ number.value = typeof s.value === 'number' ? s.value : ''; }
      if(notAssessed){ notAssessed.style.display = (typeof s.value === 'number') ? 'none' : 'inline-block'; }
      const chips = row ? Array.from(row.querySelectorAll('.chip')) : [];
      chips.forEach(c=>{
        const selected = (typeof s.value === 'number' && Number(c.dataset.val) === s.value);
        c.classList.toggle('selected', selected);
        c.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    });
  }

  function renderAll(){
    const pvEl = $('#pipeline-value');
    const ocEl = $('#opportunity-count');
    if(pvEl) pvEl.value = state.pipelineValue !== null ? state.pipelineValue : '';
    if(ocEl) ocEl.value = state.opportunityCount !== null ? state.opportunityCount : '';
    updateDimensionInputsFromState();
    renderProgress();
    renderResultCard();
    renderConstraints();
  }

  // Copy result
  function copyResult(){
    const score = calculateScore();
    if(score === null){ showToast('Complete all 9 dimensions to copy the result'); return; }
    const summary = classifyScore(score);
    const pv = state.pipelineValue;
    const ev = computeEvidenceSupported(pv, score);
    const req = computeRequiresValidation(pv, ev);
    const weakest = getWeakestDimensions()[0] || {label:'—', value:0, action:'—'};

    const lines = [];
    lines.push(`Pipeline Quality Score™: ${score}/100 — ${summary.label}`);
    lines.push('');
    lines.push(`Reported Pipeline: ${pv === null ? '—' : fmtCurrency(pv)}`);
    lines.push(`Evidence-supported estimate: ${ev === null ? '—' : fmtCurrency(ev)}`);
    lines.push(`Requires validation: ${req === null ? '—' : fmtCurrency(req)}`);
    lines.push('');
    lines.push(`Top constraint: ${weakest.label} — ${Math.round(weakest.value)}`);
    lines.push('');
    lines.push(`Next action: ${weakest.action}`);
    lines.push('');
    lines.push('Your assessment runs locally in your browser. No opportunity data is sent to a server.');

    const text = lines.join('\n');
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=> showToast('Result copied to clipboard'), ()=>{ showToast('Copy failed'); });
    } else {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); showToast('Result copied to clipboard'); }catch(e){ showToast('Copy failed'); }
      ta.remove();
    }
  }

  // Opportunity X-Ray
  function openXrayPanel(){
    const panel = $('#xray-panel'); if(!panel) return;
    while(panel.firstChild) panel.removeChild(panel.firstChild);
    const title = document.createElement('h3'); title.textContent = 'Opportunity X‑Ray™'; panel.appendChild(title);
    const note = document.createElement('div'); note.className='sub'; note.textContent = "Estimate an individual opportunity's exposure. This runs locally."; note.style.marginTop='6px'; panel.appendChild(note);

    const form = document.createElement('form'); form.onsubmit = (e)=>{ e.preventDefault(); computeXray(form); };
    form.style.display='grid'; form.style.gridTemplateColumns='1fr 1fr'; form.style.gap='8px'; form.style.marginTop='10px';

    const valLabel = document.createElement('label'); valLabel.htmlFor='x-value-input'; valLabel.textContent='Opportunity value';
    const valInput = document.createElement('input'); valInput.id='x-value-input'; valInput.type='number'; valInput.step='0.01'; valInput.min='0'; valInput.placeholder='0'; valInput.style.padding='8px';
    form.appendChild(valLabel); form.appendChild(valInput);

    // Use same dimension definitions and mapping (Low/Mid/High = 25/50/75)
    DIMENSIONS.forEach(d=>{
      const lab = document.createElement('label'); lab.textContent = d.label; lab.htmlFor = 'x-'+d.key;
      const sel = document.createElement('select'); sel.id = 'x-'+d.key; sel.style.padding='8px';
      [['Low','25'],['Mid','50'],['High','75']].forEach(([k,v])=>{ const o = document.createElement('option'); o.value = v; o.textContent = k; sel.appendChild(o); });
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
    const vals = DIMENSIONS.map(d=>{ const sel = form.querySelector('#x-'+d.key); const n = safeParseNumber(sel.value); return (n === null ? 0 : clamp(Math.round(n),0,100)); });
    const avg = Math.round(vals.reduce((s,n)=>s+n,0)/vals.length);
    const score = clamp(avg,0,100);
    const exposure = Math.max(0, v * (1 - score/100));
    const weakest = DIMENSIONS.map((d,idx)=>({label:d.label,value:vals[idx],action:d.action,order:idx})).sort((a,b)=> a.value !== b.value ? a.value - b.value : a.order - b.order).slice(0,3);

    const out = $('#xray-output'); while(out.firstChild) out.removeChild(out.firstChild);
    const card = document.createElement('div'); card.className='result-card small';
    const sn = document.createElement('div'); sn.className='score-number'; sn.textContent = score + ' / 100';
    const sl = document.createElement('div'); sl.className='score-label'; sl.textContent = classifyScore(score).label;
    card.appendChild(sn); card.appendChild(sl); out.appendChild(card);

    const pDiv = document.createElement('div'); pDiv.style.marginTop='8px'; pDiv.appendChild(document.createTextNode('Estimated exposure: '));
    const strong = document.createElement('strong'); strong.textContent = fmtCurrency(exposure); pDiv.appendChild(strong); out.appendChild(pDiv);

    const ol = document.createElement('ol'); ol.style.marginTop='8px'; weakest.forEach(w=>{ const li = document.createElement('li'); li.textContent = `${w.label} — ${w.value}`; ol.appendChild(li); }); out.appendChild(ol);

    const next = document.createElement('div'); next.style.marginTop='8px'; next.textContent = 'Next action: ' + (weakest[0] ? weakest[0].action : '—'); out.appendChild(next);
  }

  // Wire DOM
  document.addEventListener('DOMContentLoaded', function(){
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('primary-nav');
    if(toggle && nav){
      toggle.addEventListener('click', function(){ const expanded = this.getAttribute('aria-expanded') === 'true'; this.setAttribute('aria-expanded', String(!expanded)); nav.classList.toggle('open'); });
    }

    renderDimensionsControls();

    // Load saved state silently
    loadState();

    renderAll();

    const pv = $('#pipeline-value'); if(pv){ pv.addEventListener('change', (e)=>{ state.pipelineValue = safeParseNumber(e.target.value); renderAll(); scheduleSave(); }); }
    const oc = $('#opportunity-count'); if(oc){ oc.addEventListener('change', (e)=>{ state.opportunityCount = safeParseNumber(e.target.value); renderAll(); scheduleSave(); }); }

    const openBtn = $('#open-assessment'); const assess = $('#assessment');
    if(openBtn && assess){
      openBtn.addEventListener('click', ()=>{
        const expanded = openBtn.getAttribute('aria-expanded') === 'true';
        openBtn.setAttribute('aria-expanded', String(!expanded));
        if(expanded){
          assess.style.display = 'none';
          assess.setAttribute('aria-hidden','true');
          openBtn.focus();
        } else {
          assess.style.display = 'block';
          assess.setAttribute('aria-hidden','false');
          // move focus to the first meaningful control
          const firstControl = assess.querySelector('.dim-range, .dim-number');
          if(firstControl) firstControl.focus();
        }
      });
    }

    const saveBtn = $('#save'); if(saveBtn) saveBtn.addEventListener('click', ()=>{ saveState(true); });
    const resetBtn = $('#reset'); if(resetBtn) resetBtn.addEventListener('click', ()=>{ if(confirm('Reset assessment? This will clear local data.')) resetState(); });
    const copyBtn = $('#copy-result'); if(copyBtn) copyBtn.addEventListener('click', ()=> copyResult());
    const openX = $('#open-xray'); if(openX) openX.addEventListener('click', ()=> openXrayPanel());

    // Delegation for dynamically created controls
    const dimsContainer = $('#dimensions');
    if(dimsContainer){
      dimsContainer.addEventListener('input', (e)=>{
        const target = e.target;
        if(target && target.classList && target.classList.contains('dim-range')){
          const key = target.id && target.id.replace(/^dim-/,''); const v = safeParseNumber(target.value);
          if(v === null) setDimensionValue(key,null,true); else setDimensionValue(key, clamp(Math.round(v),0,100), true);
          renderAll(); scheduleSave();
        }
        if(target && target.classList && target.classList.contains('dim-number')){
          const row = target.closest('.dim-row'); const key = row && row.querySelector('.dim-range')?.id.replace(/^dim-/,''); const v = safeParseNumber(target.value);
          if(v === null) setDimensionValue(key,null,true); else setDimensionValue(key, clamp(Math.round(v),0,100), true);
          renderAll(); scheduleSave();
        }
      });

      dimsContainer.addEventListener('click', (e)=>{ const t = e.target; if(t && t.classList && t.classList.contains('chip')){ const key = t.closest('.dim-row')?.querySelector('.dim-range')?.id.replace(/^dim-/,''); const v = safeParseNumber(t.dataset.val) || 0; setDimensionValue(key, v, true); renderAll(); scheduleSave(); } });
    }

    // Keyboard support for chips globally
    document.addEventListener('keydown', (e)=>{ if((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('chip')){ e.preventDefault(); document.activeElement.click(); } });

    // Autosave debounced
    let saveTimer = null; window.scheduleSave = function(){ if(saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ saveState(false); }, 700); };

    // Final render
    renderAll();
  });

})();
