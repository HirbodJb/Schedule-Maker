// ── Toast & Confirm ──────────────────────────────────────
function showToast(msg, type='err', duration=4500){
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');
  t.className='toast '+type;
  const icon=type==='err'?'ti-circle-x':type==='warn'?'ti-alert-triangle':'ti-circle-check';
  t.innerHTML=`<i class="ti ${icon} toast-icon" aria-hidden="true"></i><div class="toast-body">${msg}</div><button class="toast-close" onclick="dismissToast(this.parentElement)" aria-label="Close">&times;</button>`;
  c.appendChild(t);
  const timer=setTimeout(()=>dismissToast(t), duration);
  t._timer=timer;
}
function dismissToast(el){
  if(!el||!el.parentElement) return;
  clearTimeout(el._timer);
  el.classList.add('hiding');
  el.addEventListener('animationend',()=>el.remove(),{once:true});
}
function showConfirm(title, msg, onConfirm, confirmLabel='Delete', confirmClass='btn-danger'){
  const old=document.getElementById('confirm-overlay');
  if(old) old.remove();
  const ov=document.createElement('div');
  ov.id='confirm-overlay';
  ov.innerHTML=`<div class="confirm-box">
    <h4>${title}</h4>
    <p>${msg}</p>
    <div class="confirm-actions">
      <button class="btn btn-sm" onclick="document.getElementById('confirm-overlay').remove()">Cancel</button>
      <button class="btn btn-sm ${confirmClass}" id="confirm-ok-btn">${confirmLabel}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.remove(); });
  document.getElementById('confirm-ok-btn').addEventListener('click', ()=>{ ov.remove(); onConfirm(); });
}

// ── About Modal & Keyboard ──────────────────────────────
function openAboutModal(){
  const old=document.getElementById('about-modal-overlay');
  if(old) old.remove();

  const ov=document.createElement('div');
  ov.id='about-modal-overlay';
  ov.className='about-modal-overlay';
  ov.innerHTML=`
    <div class="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <div class="about-modal-top">
        <div class="about-modal-icon"><i class="ti ti-calendar-event"></i></div>
        <div>
          <div class="about-modal-title" id="about-title">CAS ESL Schedule Builder</div>
          <div class="about-modal-sub">Pierce College · Center for Academic Success scheduling tool</div>
        </div>
      </div>
      <div class="about-modal-body">
        <div class="credit-card">
          <div class="credit-label">Original creator</div>
          <div class="credit-name">Hirbod Jabbarnezhad</div>
          <div class="credit-text">
            Originally designed and developed by Hirbod Jabbarnezhad for the CAS ESL scheduling workflow.
            This credit should remain included in the software, documentation, and shared copies.
          </div>
          <div class="credit-grid">
            <div class="credit-mini">
              <strong>Version</strong>
              <span>1.0 · 2026</span>
            </div>
            <div class="credit-mini">
              <strong>Authorship</strong>
              <span>Original work by Hirbod Jabbarnezhad</span>
            </div>
            <div class="credit-mini">
              <strong>Use</strong>
              <span>Educational / institutional scheduling</span>
            </div>
            <div class="credit-mini">
              <strong>Attribution</strong>
              <span>Required in modified copies</span>
            </div>
          </div>
        </div>
        <div class="credit-text">
          Modified versions should clearly state that they are based on the original CAS ESL Schedule Builder created by Hirbod Jabbarnezhad.
        </div>
        <div class="about-modal-actions">
          <button class="btn btn-red" onclick="closeAboutModal()"><i class="ti ti-check"></i> Close</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e=>{ if(e.target===ov) closeAboutModal(); });
}

function closeAboutModal(){
  const ov=document.getElementById('about-modal-overlay');
  if(ov) ov.remove();
}

document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){ closeAboutModal(); closeEditTutorModal(); closeSaveProjectModal(); }
});


// ── App metadata / authorship ─────────────────────────────
// ── Nav & Scroll ─────────────────────────────────────────
// ── Nav ──────────────────────────────────────────────────
function switchPane(name){
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('act'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('act'));
  document.getElementById('pane-'+name).classList.add('act');
  document.getElementById('nb-'+name).classList.add('act');
  updateScrollTopButton(name);
  updateUndoButton();
  window.scrollTo({top:0, behavior:'smooth'});
  if(name==='generate'){
    applyScheduleSettingsToInputs();
    updateScheduleStats();
  }
  if(name==='cet'){
    renderCET();
    const badge = document.getElementById('cet-badge');
    if(badge){
      badge.textContent = cetClasses.length;
      badge.style.display = cetClasses.length ? 'inline' : 'none';
    }
  }
}

function updateScrollTopButton(activePane){
  const btn = document.getElementById('scroll-top-btn');
  if(!btn) return;
  btn.classList.toggle('show', activePane==='tutors' || activePane==='generate' || activePane==='cet');
}

function scrollActivePaneToTop(){
  const activePane = document.querySelector('.pane.act');
  if(!activePane) return;

  const scheduleScroller = activePane.querySelector('.sched-wrap');
  if(scheduleScroller){
    scheduleScroller.scrollTo({top:0, left:0, behavior:'smooth'});
  }

  const rosterList = activePane.querySelector('#tutor-list');
  if(rosterList){
    rosterList.scrollIntoView({behavior:'smooth', block:'start'});
  } else {
    activePane.scrollIntoView({behavior:'smooth', block:'start'});
  }

  window.scrollTo({top:0, behavior:'smooth'});
}

// ── Status helper ────────────────────────────────────────
function showStatus(containerId, msg, type){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!msg){ el.innerHTML=''; return; }
  el.innerHTML = `<div class="status-box ${type}"><i class="ti ti-${type==='ok'?'check':'alert-circle'}"></i> ${msg}</div>`;
}

// ── Status helper ────────────────────────────────────────
