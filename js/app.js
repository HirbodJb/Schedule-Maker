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
const APP_METADATA = Object.freeze({
  createdBy: 'Hirbod Jabbarnezhad',
  software: 'CAS ESL Schedule Builder',
  version: '1.0',
  year: '2026',
  copyright: 'Copyright (c) 2026 Hirbod Jabbarnezhad',
  attribution: 'Originally designed and developed by Hirbod Jabbarnezhad. Attribution should remain included in shared or modified copies.'
});

function appMetadata(){
  return {
    ...APP_METADATA,
    exportedAt: new Date().toISOString()
  };
}

function metadataComment(){
  return `<!-- ${JSON.stringify(appMetadata())} -->`;
}

function metadataHiddenBlock(){
  return `<pre style="display:none" data-cas-esl-metadata="true">${escapeHtml(JSON.stringify(appMetadata(), null, 2))}</pre>`;
}

// ── Constants ────────────────────────────────────────────
const DAYS_MF = ['Monday','Tuesday','Wednesday','Thursday'];
const TIMES_MF = ['9:00','9:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];
const TIMES_FRI = ['10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30'];
const ALL_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

// Work policy: a tutor may not be scheduled for more than 4 consecutive hours.
// Since the schedule uses 30-minute slots, 4 hours = 8 back-to-back slots.
// After that, the tutor must have at least one 30-minute break before being assigned again.
const MAX_CONSECUTIVE_WORK_SLOTS = 8;

function timesForDay(day){
  return day === 'Friday' ? TIMES_FRI : TIMES_MF;
}

const COLORS = [
  {bg:'#fdf0ef',text:'#a93226',border:'#e8a09a'},
  {bg:'#E6F1FB',text:'#0C447C',border:'#B5D4F4'},
  {bg:'#EAF3DE',text:'#27500A',border:'#C0DD97'},
  {bg:'#FAEEDA',text:'#633806',border:'#FAC775'},
  {bg:'#EEEDFE',text:'#3C3489',border:'#AFA9EC'},
  {bg:'#FBEAF0',text:'#72243E',border:'#ED93B1'},
  {bg:'#E1F5EE',text:'#085041',border:'#5DCAA5'},
  {bg:'#F1EFE8',text:'#444441',border:'#B4B2A9'},
  {bg:'#FCEBEB',text:'#791F1F',border:'#F09595'},
  {bg:'#fdf5e8',text:'#633806',border:'#FAC775'},
];

// ── State ────────────────────────────────────────────────
let tutors = [];
let avail = {};
let currentSlots = [];
let selectedShift = null;
let moveMode = null;
let showAllGaps = false;
let focusedTutorId = null;
let addHoursMode = null;
let rosterSearchResults = [];
let rosterSearchIndex = -1;
let rosterSearchQuery = '';
let scheduleSearchResults = [];
let scheduleSearchIndex = -1;
let scheduleSearchQuery = '';
let currentAnalysisReportText = '';
let currentAnalysisReportHTML = '';
let analysisPanelOpen = false;
let undoSnapshot = null;
let undoLabel = '';
let undoMeta = null;
let scheduleSettings = {weeklyBudget:null, dateFrom:'', dateTo:''};

// ── Availability table ───────────────────────────────────
function buildAvailTable(){
  const tbl = document.getElementById('avail-tbl');
  avail = {};
  let html = '<thead><tr><th style="width:68px"></th>';
  ALL_DAYS.forEach(d => html += `<th>${d.slice(0,3)}</th>`);
  html += '</tr></thead><tbody>';
  TIMES_MF.forEach(t => {
    html += `<tr><td class="tc-time">${fmtTime(t)}</td>`;
    ALL_DAYS.forEach(d => {
      const key = d+'-'+t;
      const fri = d==='Friday', inFri = TIMES_FRI.includes(t);
      if(fri && !inFri){
        avail[key]=null;
        html+=`<td class="tc-cell" style="background:var(--soft)"></td>`;
      }
      else {
        avail[key]=false;
        html+=`<td class="tc-cell availability-click-cell" onclick="toggleAvailCell(this,'${key}')"><input type="checkbox" class="avail-cb" id="cb-${key}" onclick="event.stopPropagation()" onchange="setAvailCell(this,'${key}')"></td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody>';
  tbl.innerHTML = html;
}

function setAvailCell(cb, key){
  avail[key] = cb.checked;
  const cell = cb.closest('td');
  if(cell) cell.classList.toggle('available-cell', cb.checked);
}

function toggleAvailCell(cell, key){
  const cb = cell.querySelector('input[type="checkbox"]');
  if(!cb) return;
  cb.checked = !cb.checked;
  setAvailCell(cb, key);
}

function selectAll(){
  Object.keys(avail).forEach(k=>{
    if(avail[k]!==null){
      avail[k]=true;
      const el=document.getElementById('cb-'+k);
      if(el){
        el.checked=true;
        const cell=el.closest('td');
        if(cell) cell.classList.add('available-cell');
      }
    }
  });
}

function clearAvail(){
  Object.keys(avail).forEach(k=>{
    if(avail[k]!==null){
      avail[k]=false;
      const el=document.getElementById('cb-'+k);
      if(el){
        el.checked=false;
        const cell=el.closest('td');
        if(cell) cell.classList.remove('available-cell');
      }
    }
  });
}

// ── Utilities ────────────────────────────────────────────
function fmtTime(t){
  const [h,m]=t.split(':').map(Number);
  const ap=h<12?'am':'pm';
  return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+ap;
}
function fmtInterval(t){
  // Returns "9:00 – 9:30" style label
  const [h,m]=t.split(':').map(Number);
  const totalMins=h*60+m+30;
  const h2=Math.floor(totalMins/60), m2=totalMins%60;
  const ap1=h<12?'am':'pm', ap2=h2<12?'am':'pm';
  const s1=(h%12||12)+(m?':'+String(m).padStart(2,'0'):'');
  const s2=(h2%12||12)+(m2?':'+String(m2).padStart(2,'0'):'');
  // Only show am/pm when it changes
  const label1=s1+(ap1!==ap2?ap1:'');
  return label1+' – '+s2+ap2;
}
function initials(name){ return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function colorFor(i){ return COLORS[i % COLORS.length]; }

function slotKey(day,time){ return day+'-'+time; }
function getTutorById(id){ return tutors.find(t=>String(t.id)===String(id)); }
function getSlot(day,time){ return currentSlots.find(s=>s.day===day && s.time===time); }

function isCellUncovered(day,time){
  const slot=getSlot(day,time);
  return !slot || !slot.assigned || slot.assigned.length===0;
}


function escapeHtml(str){ return String(str).replace(/[&<>"]/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
function durationText(hours){
  const mins=Math.round(hours*60);
  const h=Math.floor(mins/60), m=mins%60;
  if(h && m) return `${h}:${String(m).padStart(2,'0')}`;
  if(h) return `${h}:00`;
  return `0:${String(m).padStart(2,'0')}`;
}



function syncScheduleSettingsFromInputs(){
  const budgetEl=document.getElementById('schedule-budget');
  const fromEl=document.getElementById('schedule-date-from');
  const toEl=document.getElementById('schedule-date-to');
  const rawBudget=budgetEl && budgetEl.value!=='' ? Number(budgetEl.value) : null;
  scheduleSettings={
    weeklyBudget:Number.isFinite(rawBudget) && rawBudget>0 ? rawBudget : null,
    dateFrom:fromEl ? fromEl.value : '',
    dateTo:toEl ? toEl.value : ''
  };
  validateScheduleSettings(false);
  updateScheduleSettingsNote();
  updateScheduleStats();
}

function setScheduleValidationError(message){
  const box=document.getElementById('schedule-validation-error');
  const msg=document.getElementById('schedule-validation-message');
  if(!box || !msg) return;
  if(message){
    msg.textContent=message;
    box.classList.add('show');
  } else {
    msg.textContent='';
    box.classList.remove('show');
  }
}

function markScheduleFieldError(id, hasError){
  const el=document.getElementById(id);
  if(el) el.classList.toggle('input-error', !!hasError);
}

function applyScheduleSettingsToInputs(){
  const budgetEl=document.getElementById('schedule-budget');
  const fromEl=document.getElementById('schedule-date-from');
  const toEl=document.getElementById('schedule-date-to');
  if(budgetEl) budgetEl.value=scheduleSettings.weeklyBudget ?? '';
  if(fromEl) fromEl.value=scheduleSettings.dateFrom || '';
  if(toEl) toEl.value=scheduleSettings.dateTo || '';
  validateScheduleSettings(false);
  updateScheduleSettingsNote();
}

function totalAssignedHours(){
  return tutors.reduce((sum,t)=>sum+(Number(t.assignedHrs)||0),0);
}

function formatDateForDisplay(value){
  if(!value) return '';
  const [y,m,d]=value.split('-').map(Number);
  if(!y||!m||!d) return value;
  return new Date(y,m-1,d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}

function schedulePeriodText(){
  const from=scheduleSettings.dateFrom, to=scheduleSettings.dateTo;
  if(from && to) return `${formatDateForDisplay(from)} – ${formatDateForDisplay(to)}`;
  if(from) return `Starting ${formatDateForDisplay(from)}`;
  if(to) return `Through ${formatDateForDisplay(to)}`;
  return 'Weekly schedule';
}

function updateScheduleSettingsNote(){
  const note=document.getElementById('schedule-settings-note');
  if(!note) return;
  const budget=scheduleSettings.weeklyBudget;
  const assigned=totalAssignedHours();
  const pieces=[];
  if(budget){
    const remaining=budget-assigned;
    const cls=remaining<0?'budget-over':'budget-ok';
    pieces.push(`<span class="${cls}"><strong>Budget:</strong> ${assigned.toFixed(1)} / ${budget.toFixed(1)} hours used${remaining>=0?` · ${remaining.toFixed(1)} hours remaining`:` · ${Math.abs(remaining).toFixed(1)} hours over`}</span>`);
  } else {
    pieces.push('No weekly budget set. The scheduler will only use each tutor’s requested weekly hours.');
  }
  if(scheduleSettings.dateFrom || scheduleSettings.dateTo) pieces.push(`<strong>Period:</strong> ${escapeHtml(schedulePeriodText())}`);
  pieces.push('Break rule: max 4 consecutive hours, then at least a 30-minute break.');
  note.innerHTML=pieces.join(' &nbsp;·&nbsp; ');
}

function validateScheduleSettings(showMessage=true){
  const budgetEl=document.getElementById('schedule-budget');
  const fromEl=document.getElementById('schedule-date-from');
  const toEl=document.getElementById('schedule-date-to');
  const budgetValue=budgetEl && budgetEl.value!=='' ? Number(budgetEl.value) : null;
  const fromValue=fromEl ? fromEl.value : '';
  const toValue=toEl ? toEl.value : '';

  let message='';
  const budgetInvalid=budgetValue!==null && (!Number.isFinite(budgetValue) || budgetValue<0 || budgetValue>168);
  const dateInvalid=!!(fromValue && toValue && fromValue>=toValue);

  markScheduleFieldError('schedule-budget', budgetInvalid);
  markScheduleFieldError('schedule-date-from', dateInvalid);
  markScheduleFieldError('schedule-date-to', dateInvalid);

  if(budgetInvalid){
    message='Weekly hour budget must be between 0 and 168 hours.';
  } else if(dateInvalid){
    message='Schedule From must be before Schedule To.';
  }

  setScheduleValidationError(message);
  if(message && showMessage) showToast(message, 'warn');
  return !message;
}

function canAssignMoreBudget(slotHours=0.5){
  const budget=scheduleSettings.weeklyBudget;
  if(!budget) return true;
  return totalAssignedHours()+slotHours <= budget + 1e-9;
}

function getActivePaneName(){
  const active=document.querySelector('.pane.act');
  return active ? active.id.replace('pane-','') : 'upload';
}

function buildAppSnapshot(){
  return {
    tutors:tutors.map(t=>({
      ...t,
      avail:{...t.avail},
      assignments:t.assignments ? t.assignments.map(a=>({day:a.day,time:a.time})) : []
    })),
    slots:currentSlots.map(s=>({
      day:s.day,
      time:s.time,
      assignedIds:s.assigned.map(t=>t.id)
    })),
    selectedShift:selectedShift ? {...selectedShift} : null,
    moveMode:moveMode ? {...moveMode} : null,
    showAllGaps,
    focusedTutorId,
    currentAnalysisReportText,
    currentAnalysisReportHTML,
    analysisPanelOpen,
    scheduleSettings:{...scheduleSettings},
    activePane:getActivePaneName()
  };
}

function restoreAppSnapshot(snapshot){
  if(!snapshot) return;

  tutors=snapshot.tutors.map(t=>({
    ...t,
    avail:{...t.avail},
    assignedHrs:0,
    assignments:[]
  }));

  const tutorById=new Map(tutors.map(t=>[String(t.id),t]));
  currentSlots=(snapshot.slots||[]).map(s=>({
    day:s.day,
    time:s.time,
    assigned:(s.assignedIds||[]).map(id=>tutorById.get(String(id))).filter(Boolean)
  }));

  tutors.forEach(t=>{ t.assignments=[]; t.assignedHrs=0; });
  currentSlots.forEach(slot=>{
    slot.assigned.forEach(t=>{
      t.assignments.push(slot);
      t.assignedHrs=(t.assignedHrs||0)+0.5;
    });
  });

  // When restoring an undo snapshot, always return to normal table view.
  // This prevents old move-mode banners/cancel buttons from coming back after confirming Undo.
  selectedShift=null;
  moveMode=null;
  addHoursMode=null;
  showAllGaps=!!snapshot.showAllGaps;
  focusedTutorId=snapshot.focusedTutorId;
  currentAnalysisReportText=snapshot.currentAnalysisReportText||'';
  currentAnalysisReportHTML=snapshot.currentAnalysisReportHTML||'';
  analysisPanelOpen=!!snapshot.analysisPanelOpen;
  scheduleSettings={weeklyBudget:null,dateFrom:'',dateTo:'',...(snapshot.scheduleSettings||{})};
  applyScheduleSettingsToInputs();

  closeShiftPopover();
  renderTutors();
  if(currentSlots.length){
    renderOutput(currentSlots);
    updateScheduleStats(); paintUncoveredCells();
  } else {
    const genOut=document.getElementById('gen-out');
    if(genOut) genOut.innerHTML='';
    document.getElementById('st-slots').textContent='—';
    document.getElementById('st-gaps').textContent='—';
    document.getElementById('st-hrs').textContent=tutors.reduce((s,t)=>s+t.hrs,0);
    document.getElementById('st-tutors').textContent=tutors.length;
  }

  switchPane(snapshot.activePane||'generate');
}

function updateUndoButton(){
  const btn=document.getElementById('undo-btn');
  const label=document.getElementById('undo-btn-label');
  const scheduleBtn=document.getElementById('schedule-undo-btn');
  if(btn&&label){
    if(undoSnapshot){
      label.textContent=undoLabel ? `Undo ${undoLabel}` : 'Undo';
      btn.classList.add('show');
    } else {
      label.textContent='Undo';
      btn.classList.remove('show');
    }
  }
  if(scheduleBtn){
    scheduleBtn.style.display=undoSnapshot ? 'inline-flex' : 'none';
    scheduleBtn.innerHTML=`<i class="ti ti-arrow-back-up"></i> ${undoSnapshot&&undoLabel ? 'Undo '+escapeHtml(undoLabel) : 'Undo'}`;
  }
}

function saveUndoState(label, meta=null){
  undoSnapshot=buildAppSnapshot();
  undoLabel=label||'last action';
  undoMeta=meta;
  updateUndoButton();
}

function clearUndoState(){
  undoSnapshot=null;
  undoLabel='';
  undoMeta=null;
  updateUndoButton();
}


function saveProject(){
  if(!tutors.length){
    showToast('Add or import tutors before saving a project.', 'warn');
    return;
  }
  openSaveProjectModal();
}

function defaultProjectName(){
  const d = new Date();
  const date = d.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'});
  return `CAS ESL Schedule — ${date}`;
}

function sanitizeProjectFileName(name){
  return String(name || 'CAS ESL Schedule Project')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'CAS-ESL-Schedule-Project';
}

function openSaveProjectModal(){
  closeSaveProjectModal();

  const initialName = defaultProjectName();
  const ov = document.createElement('div');
  ov.id = 'save-project-overlay';
  ov.className = 'save-project-overlay';
  ov.innerHTML = `
    <div class="save-project-modal" role="dialog" aria-modal="true" aria-labelledby="save-project-title">
      <div class="save-project-top">
        <div class="save-project-icon"><i class="ti ti-device-floppy"></i></div>
        <div>
          <div class="save-project-title" id="save-project-title">Name this project</div>
          <div class="save-project-sub">This name will be saved inside the project file and used for the download name.</div>
        </div>
      </div>
      <div class="save-project-body">
        <div class="save-project-card">
          <div class="fg">
            <span class="fl">Project name <span style="color:var(--red)">*</span></span>
            <input id="save-project-name-input" type="text" maxlength="80" value="${escapeHtml(initialName)}" placeholder="e.g. Spring 2026 ESL Tutor Schedule">
          </div>
          <div class="save-project-hint">
            Example: “Spring 2026 ESL Schedule” or “Week 1 Tutor Schedule.” You can load this JSON file later to continue editing.
          </div>
          <div class="save-project-preview" id="save-project-preview"></div>
        </div>
        <div class="save-project-actions">
          <button class="btn" type="button" onclick="closeSaveProjectModal()">Cancel</button>
          <button class="btn btn-red" type="button" onclick="confirmSaveProject()"><i class="ti ti-download"></i> Save Project</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e=>{ if(e.target===ov) closeSaveProjectModal(); });

  const input = document.getElementById('save-project-name-input');
  const updatePreview = () => {
    const clean = sanitizeProjectFileName(input.value || initialName);
    const preview = document.getElementById('save-project-preview');
    if(preview) preview.textContent = `File name: ${clean}.json`;
  };

  input.addEventListener('input', updatePreview);
  input.addEventListener('keydown', e=>{
    if(e.key === 'Enter') confirmSaveProject();
  });

  updatePreview();
  setTimeout(()=>{
    input.focus();
    input.select();
  }, 0);
}

function closeSaveProjectModal(){
  const ov = document.getElementById('save-project-overlay');
  if(ov) ov.remove();
}

function confirmSaveProject(){
  const input = document.getElementById('save-project-name-input');
  const projectName = (input && input.value ? input.value.trim() : '');

  if(!projectName){
    showToast('Please enter a project name before saving.', 'warn');
    if(input) input.focus();
    return;
  }

  downloadProjectFile(projectName);
  closeSaveProjectModal();
}

function downloadProjectFile(projectName){
  const snapshot = buildAppSnapshot();
  snapshot.activePane = currentSlots.length ? 'generate' : getActivePaneName();
  snapshot.projectName = projectName;

  const metadata = appMetadata();

  const payload = {
    app:metadata.software,
    type:'cas-esl-scheduler-project',
    version:metadata.version,
    projectName,
    savedAt:metadata.exportedAt,
    metadata:{...metadata, projectName},
    createdBy:metadata.createdBy,
    software:metadata.software,
    creator:metadata.createdBy,
    originalDeveloper:metadata.createdBy,
    copyright:metadata.copyright,
    attribution:metadata.attribution,
    snapshot
  };

  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeProjectFileName(projectName)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Project “${escapeHtml(projectName)}” saved. Keep this JSON file to continue editing later.`, 'ok', 3400);
}

function handleProjectFile(input){
  const file = input && input.files ? input.files[0] : null;
  if(!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try{
      const payload = JSON.parse(e.target.result);
      const snapshot = payload && payload.snapshot ? payload.snapshot : payload;

      if(!snapshot || !Array.isArray(snapshot.tutors)){
        throw new Error('Invalid project file');
      }

      const doLoad = () => {
        if(tutors.length || currentSlots.length){
          saveUndoState('loaded project');
        }

        // Saved project files should reopen directly on the Schedule page when a schedule exists.
        snapshot.activePane = (snapshot.slots && snapshot.slots.length) ? 'generate' : 'tutors';
        restoreAppSnapshot(snapshot);
        resetRosterSearchResults();
        resetScheduleSearchResults();
        closeShiftPopover();
        const loadedName = payload && payload.projectName ? `“${escapeHtml(payload.projectName)}” — ` : '';
        showToast(`Loaded project: ${loadedName}${snapshot.tutors.length} tutor${snapshot.tutors.length===1?'':'s'}${snapshot.slots&&snapshot.slots.length?' with a saved schedule':''}.`, 'ok', 3600);
      };

      if(tutors.length || currentSlots.length){
        showConfirm(
          'Load saved project?',
          'Loading this project will replace the current roster and schedule. You can use the Undo button to return to the previous version right after loading.',
          doLoad,
          'Load project',
          'btn-red'
        );
      } else {
        doLoad();
      }
    } catch(err){
      showToast('This does not look like a valid saved schedule project file.', 'err');
    } finally {
      input.value='';
    }
  };
  reader.onerror = () => {
    showToast('Could not read the selected project file.', 'err');
    input.value='';
  };
  reader.readAsText(file);
}

function undoLastAction(){
  if(!undoSnapshot){
    showToast('There is nothing to undo yet.', 'warn');
    return;
  }

  const snapshot=undoSnapshot;
  const label=undoLabel;
  const meta=undoMeta;

  const runUndo = () => {
    clearUndoState();
    restoreAppSnapshot(snapshot);
    if(meta && meta.type==='move'){
      showToast(`Moved ${escapeHtml(meta.tutorName)} back to ${escapeHtml(meta.fromDay)} ${escapeHtml(fmtInterval(meta.fromTime))}.`, 'ok', 3000);
    } else {
      showToast(`Undid ${escapeHtml(label)}.`, 'ok', 2600);
    }
  };

  if(meta && meta.type==='move'){
    showConfirm(
      'Move tutor back?',
      `This will move <strong>${escapeHtml(meta.tutorName)}</strong> back to the previous position: <strong>${escapeHtml(meta.fromDay)} ${escapeHtml(fmtInterval(meta.fromTime))}</strong>.`,
      runUndo,
      'Confirm undo',
      'btn-red'
    );
    return;
  }

  runUndo();
}

function getRunForTutor(tutor,day,time){
  const times = day==='Friday' ? TIMES_FRI : TIMES_MF;
  const idx = times.indexOf(time);
  if(idx<0) return {startTime:time,endTime:null,len:1};
  let start=idx, end=idx;
  while(start>0){
    const prev=getSlot(day,times[start-1]);
    if(prev && prev.assigned.includes(tutor)) start--; else break;
  }
  while(end<times.length-1){
    const next=getSlot(day,times[end+1]);
    if(next && next.assigned.includes(tutor)) end++; else break;
  }
  return {startTime:times[start], endTime:times[end+1]||null, len:end-start+1};
}

function getSlotFrom(slots,day,time){
  return (slots||[]).find(s=>s.day===day && s.time===time);
}

function slotHasTutor(slot,tutor){
  return !!(slot && slot.assigned && slot.assigned.some(t=>String(t.id)===String(tutor.id)));
}

function wouldExceedConsecutiveLimit(tutor,day,time,slots=currentSlots,ignore=null){
  const times=timesForDay(day);
  const idx=times.indexOf(time);
  if(!tutor || idx<0) return false;

  const isIgnored=(d,t)=>ignore && ignore.day===d && ignore.time===t;

  const assignedAt=(i)=>{
    const tm=times[i];
    if(isIgnored(day,tm)) return false;
    if(i===idx) return true; // test the proposed assignment
    return slotHasTutor(getSlotFrom(slots,day,tm),tutor);
  };

  let start=idx;
  while(start>0 && assignedAt(start-1)) start--;

  let end=idx;
  while(end<times.length-1 && assignedAt(end+1)) end++;

  return (end-start+1)>MAX_CONSECUTIVE_WORK_SLOTS;
}

function breakPolicyMessage(tutor,day,time){
  return `${tutor.name} cannot be assigned at ${day} ${fmtInterval(time)} because it would create more than 4 consecutive hours. A 30-minute break is required after 4 back-to-back hours.`;
}

function closeShiftPopover(){
  const old=document.getElementById('shift-popover');
  if(old) old.remove();
  document.querySelectorAll('.pill.selected,.pill-merged.selected').forEach(el=>el.classList.remove('selected'));
}

document.addEventListener('click', e=>{
  const pop=document.getElementById('shift-popover');
  if(pop && !pop.contains(e.target) && !e.target.closest('.pill,.pill-merged')) closeShiftPopover();
});

function openShiftPopover(event,tutorId,day,time){
  hideTutorQuickSummary();
  event.stopPropagation();

  // Important fix:
  // If move mode is already active, clicking any pill should be treated as
  // clicking that schedule cell. It should NOT open another popover.
  if(moveMode || addHoursMode){
    handleScheduleCellClick(day,time);
    return;
  }

  closeShiftPopover();

  const tutor=getTutorById(tutorId);
  if(!tutor) return;

  selectedShift={tutorId,day,time};
  event.currentTarget.classList.add('selected');

  const pop=document.createElement('div');
  pop.id='shift-popover';
  pop.className='shift-popover';
  pop.innerHTML=`
    <div class="shift-popover-title">${escapeHtml(tutor.name)}<br><span style="font-weight:700;color:var(--muted)">${day} ${fmtInterval(time)}</span></div>
    <button class="btn btn-sm btn-danger" onclick="deleteSelectedShift()"><i class="ti ti-trash"></i> Delete slot</button>
    <button class="btn btn-sm" onclick="startMoveMode()"><i class="ti ti-arrows-move"></i> Move</button>
    <div class="mini-note">Move only allows cells where this tutor is available.</div>`;

  document.body.appendChild(pop);

  const rect=event.currentTarget.getBoundingClientRect();
  const popRect=pop.getBoundingClientRect();

  let left=rect.left;
  let top=rect.bottom+8;

  if(left+popRect.width>window.innerWidth-12) left=window.innerWidth-popRect.width-12;
  if(top+popRect.height>window.innerHeight-12) top=rect.top-popRect.height-8;

  pop.style.left=Math.max(12,left)+'px';
  pop.style.top=Math.max(12,top)+'px';
}

function deleteSelectedShift(){
  if(!selectedShift) return;
  const {tutorId,day,time}=selectedShift;
  const tutor=getTutorById(tutorId);
  const slot=getSlot(day,time);
  if(!tutor||!slot) return;
  showConfirm(
    'Delete shift?',
    `You are deleting <strong>${tutor.name}</strong>'s shift on <strong>${day} ${fmtInterval(time)}</strong>. This can be undone with the Undo button.`,
    ()=>{
      saveUndoState('deleted shift');
      slot.assigned=slot.assigned.filter(t=>String(t.id)!==String(tutorId));
      tutor.assignments=tutor.assignments.filter(a=>!(a.day===day && a.time===time));
      tutor.assignedHrs=Math.max(0,tutor.assignedHrs-0.5);
      selectedShift=null; moveMode=null;
      closeShiftPopover(); updateScheduleStats(); paintUncoveredCells(); renderOutput(currentSlots);
    },
    'Delete shift'
  );
  return;
}

function startMoveMode(){
  if(!selectedShift) return;
  addHoursMode=null;
  moveMode={...selectedShift};
  closeShiftPopover();
  renderOutput(currentSlots);
}

function cancelMoveMode(){
  moveMode=null;
  selectedShift=null;
  closeShiftPopover();
  renderOutput(currentSlots);
}

function startAddHoursMode(tutorId){
  if(!currentSlots.length){
    showToast('Generate a schedule first, then you can manually add hours.', 'warn');
    return;
  }
  const tutor=getTutorById(tutorId);
  if(!tutor) return;
  addHoursMode={tutorId:tutor.id};
  moveMode=null;
  selectedShift=null;
  focusedTutorId=String(tutor.id);
  closeShiftPopover();
  renderOutput(currentSlots);
  showToast(`Add-hours mode is on for ${escapeHtml(tutor.name)}. Click a green open cell to add a 30-minute slot.`, 'ok', 4200);
}

function cancelAddHoursMode(){
  const exitingTutorId = addHoursMode ? String(addHoursMode.tutorId) : null;
  addHoursMode=null;

  // Add-hours mode automatically focuses the selected tutor so coordinators can
  // clearly see only that tutor's schedule while adding more slots. When leaving
  // add-hours mode, clear that matching focus at the same time so one click
  // returns the schedule to normal.
  if(exitingTutorId && String(focusedTutorId) === exitingTutorId){
    focusedTutorId = null;
  }

  renderOutput(currentSlots);
}

function slotHasOpenCapacity(slot){
  return !!slot && slot.assigned.length < 3;
}

function manualAddBlockedReason(tutor,day,time){
  const slot=getSlot(day,time);
  if(!slot) return 'That schedule cell is not available.';
  if(tutor.avail[slotKey(day,time)]!==true) return `${tutor.name} is not marked available for ${day} ${fmtInterval(time)}.`;
  if(!slotHasOpenCapacity(slot)) return `That slot already has the maximum number of tutors.`;
  if(slot.assigned.some(t=>String(t.id)===String(tutor.id))) return `${tutor.name} is already assigned in that slot.`;
  if((Number(tutor.assignedHrs)||0) >= (Number(tutor.hrs)||0)) return `${tutor.name} already reached their desired weekly hours.`;
  if(!canAssignMoreBudget(0.5)) return `The weekly hour budget does not have enough room for another 30-minute slot.`;
  if(wouldExceedConsecutiveLimit(tutor,day,time,currentSlots)) return breakPolicyMessage(tutor,day,time);
  return '';
}

function isManualAddSlotValid(tutor,day,time){
  return !manualAddBlockedReason(tutor,day,time);
}

function validManualAddSlotsCount(tutor){
  if(!currentSlots.length || !tutor) return 0;
  return currentSlots.filter(s=>isManualAddSlotValid(tutor,s.day,s.time)).length;
}

function handleAddHoursCellClick(day,time){
  if(!addHoursMode) return;
  const tutor=getTutorById(addHoursMode.tutorId);
  if(!tutor) return;
  const reason=manualAddBlockedReason(tutor,day,time);
  if(reason){
    showToast(reason, 'warn', 5500);
    return;
  }
  const slot=getSlot(day,time);
  saveUndoState('added shift', {type:'manual-add', tutorName:tutor.name, day, time});
  slot.assigned.push(tutor);
  tutor.assignments.push(slot);
  tutor.assignedHrs=(Number(tutor.assignedHrs)||0)+0.5;
  updateScheduleStats();
  paintUncoveredCells();
  renderOutput(currentSlots);
  showToast(`Added ${tutor.name} to ${day} ${fmtInterval(time)}.`, 'ok');
}

function focusTutor(tutorId){
  focusedTutorId = String(tutorId);
  closeShiftPopover();
  renderOutput(currentSlots);
  const tutor = getTutorById(tutorId);
  if(tutor) showToast(`Focusing on ${escapeHtml(tutor.name)}'s schedule.`, 'ok', 2200);
}

function clearTutorFocus(){
  focusedTutorId = null;
  renderOutput(currentSlots);
}

function handleScheduleCellClick(day,time){
  if(addHoursMode){
    handleAddHoursCellClick(day,time);
    return;
  }
  if(!moveMode) return;
  const tutor=getTutorById(moveMode.tutorId);
  const from=getSlot(moveMode.day,moveMode.time);
  const to=getSlot(day,time);
  if(!tutor||!from||!to) return;
  if(day===moveMode.day && time===moveMode.time){ cancelMoveMode(); return; }
  if(tutor.avail[slotKey(day,time)]!==true){ showToast(`${tutor.name} is not marked available for ${day} ${fmtInterval(time)}.`, 'warn'); return; }
  if(to.assigned.some(t=>String(t.id)===String(tutor.id))){ showToast(`${tutor.name} is already assigned in that slot.`, 'warn'); return; }
  if(wouldExceedConsecutiveLimit(tutor,day,time,currentSlots,{day:moveMode.day,time:moveMode.time})){
    showToast(breakPolicyMessage(tutor,day,time), 'warn', 6500);
    return;
  }

  const doMove = () => {
    saveUndoState('moved shift', {type:'move', tutorName:tutor.name, fromDay:moveMode.day, fromTime:moveMode.time, toDay:day, toTime:time});
    from.assigned=from.assigned.filter(t=>String(t.id)!==String(tutor.id));
    to.assigned.push(tutor);
    tutor.assignments=tutor.assignments.filter(a=>!(a.day===moveMode.day && a.time===moveMode.time));
    tutor.assignments.push(to);
    moveMode=null; selectedShift=null;
    updateScheduleStats(); paintUncoveredCells(); renderOutput(currentSlots);
    showToast(`Moved ${tutor.name} to ${day} ${fmtInterval(time)}.`, 'ok');
  };

  const run=getRunForTutor(tutor,moveMode.day,moveMode.time);
  if(run.len>1){
    const remaining=(run.len-1)*0.5;
    const runEnd=run.endTime?fmtTime(run.endTime):'end';
    showConfirm(
      'Move this slot only?',
      `${tutor.name} is scheduled ${fmtTime(run.startTime)}–${runEnd}. You are only moving the <strong>${fmtInterval(moveMode.time)}</strong> slot — the remaining ${durationText(remaining)} hrs stay in place.`,
      doMove,
      'Yes, move slot'
    );
  } else {
    doMove();
  }
}

function updateScheduleStats(){
  const stSlots=document.getElementById('st-slots');
  const stGaps=document.getElementById('st-gaps');
  const stHrs=document.getElementById('st-hrs');
  const stTutors=document.getElementById('st-tutors');
  if(currentSlots.length){
    if(stSlots) stSlots.textContent=currentSlots.filter(s=>s.assigned.length>0).length;
    if(stGaps) stGaps.textContent=currentSlots.filter(s=>s.assigned.length===0).length;
  }
  if(stHrs){
    const assigned=totalAssignedHours();
    stHrs.textContent=currentSlots.length ? assigned.toFixed(1) : tutors.reduce((s,t)=>s+t.hrs,0);
    stHrs.classList.toggle('budget-over', !!scheduleSettings.weeklyBudget && assigned>scheduleSettings.weeklyBudget);
  }
  if(stTutors) stTutors.textContent=tutors.length;
  updateScheduleSettingsNote();
}

// ── Roster rendering ─────────────────────────────────────
function renderTutors(){
  const el = document.getElementById('tutor-list');
  const badge = document.getElementById('badge-count');
  const goBtn = document.getElementById('go-gen-btn');
  const heading = document.getElementById('roster-heading');

  badge.textContent = tutors.length;
  badge.style.display = tutors.length ? 'inline' : 'none';
  goBtn.style.display = tutors.length ? 'inline-flex' : 'none';
  const clearBtn = document.getElementById('clear-all-btn');
  if(clearBtn) clearBtn.style.display = tutors.length ? 'inline-flex' : 'none';
  const searchWrap = document.getElementById('roster-search-wrap');
  if(searchWrap) searchWrap.style.display = tutors.length ? 'flex' : 'none';
  heading.textContent = tutors.length ? `Roster (${tutors.length} tutors)` : 'Roster';

  if(!tutors.length){ el.innerHTML='<div class="empty">No tutors yet — import a CSV or add one manually above.</div>'; return; }

  el.innerHTML = tutors.map((t,i)=>{
    const c = colorFor(i);
    const avCount = Object.values(t.avail).filter(v=>v===true).length;
    const modeTag = t.mode==='oc'?'<span class="tag oc">In-person</span>':t.mode==='ol'?'<span class="tag ol">Online</span>':'<span class="tag oc">In-person</span><span class="tag ol">Online</span>';
    const satTag = t.sat?'<span class="tag sat">Sat</span>':'';
    const sourceTag = t.manual
      ? '<span class="tag manual-tag">Added manually</span>'
      : '<span class="tag csv-tag">Imported from CSV</span>';
    const ribbonColor = t.manual ? 'var(--red)' : c.text;
    const stableColor = t.stable==='stable'?'var(--ok)':t.stable==='maybe'?'var(--warn)':'var(--red)';
    const stableLabel = t.stable==='stable'?'Stable':t.stable==='maybe'?'May change':'Tentative';
    const phoneStr = t.phone ? ` · ${t.phone}` : '';
    const eng101Str = t.eng101 ? ` · ENG101: ${t.eng101==='yes'?'✓':'Not yet'}` : '';
    const priorityStr = t.priority==='disagree'?' · <span style="color:var(--red)">⚠ Disagrees w/ priority policy</span>':'';
    const searchKey = escapeHtml([t.name,t.email,t.phone,(t.phone||'').replace(/\D/g,''),t.eng101,t.mode,t.stable].filter(Boolean).join(' ').toLowerCase());
    return `<div class="tc" id="tutor-card-${t.id}" data-search="${searchKey}" style="--tc-bg:${c.bg};--tc-border:${c.border};--tc-text:${c.text}">
      <div class="tc-ribbon" style="background:${ribbonColor}"></div>
      <div class="avatar" style="background:${c.bg};color:${c.text}">${initials(t.name)}</div>
      <div class="tc-info">
        <div class="tc-name">${t.name}${t.email?`<span style="font-size:11px;font-weight:400;color:var(--muted)">${t.email}</span>`:''}${sourceTag}</div>
        <div class="tc-meta">${t.hrs} hrs/wk · ${avCount} slots available · ${modeTag}${satTag} <span style="color:${stableColor};font-weight:700">${stableLabel}</span>${phoneStr}${eng101Str}${priorityStr}</div>
      </div>
      <div class="tc-actions">
        <button class="btn btn-sm edit-btn" onclick="editTutor(${t.id})" title="Edit tutor" aria-label="Edit tutor"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="removeTutor(${t.id})" title="Remove"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function clearRosterSearchHighlights(){
  document.querySelectorAll('.tc.search-hit').forEach(card=>card.classList.remove('search-hit'));
}

function clearScheduleSearchHighlights(){
  document.querySelectorAll('.h-row.schedule-search-hit').forEach(row=>row.classList.remove('schedule-search-hit'));
}

function updateSearchNavUI(type){
  const isRoster = type === 'roster';
  const results = isRoster ? rosterSearchResults : scheduleSearchResults;
  const index = isRoster ? rosterSearchIndex : scheduleSearchIndex;
  const countEl = document.getElementById(isRoster ? 'roster-search-count' : 'schedule-search-count');
  const prevBtn = document.getElementById(isRoster ? 'roster-prev-btn' : 'schedule-prev-btn');
  const nextBtn = document.getElementById(isRoster ? 'roster-next-btn' : 'schedule-next-btn');

  if(!countEl || !prevBtn || !nextBtn) return;

  if(!results.length){
    countEl.textContent = '';
    prevBtn.classList.remove('show');
    nextBtn.classList.remove('show');
    return;
  }

  countEl.textContent = `${index + 1} / ${results.length}`;
  prevBtn.classList.toggle('show', results.length > 1);
  nextBtn.classList.toggle('show', results.length > 1);
  prevBtn.disabled = results.length <= 1;
  nextBtn.disabled = results.length <= 1;
}

function resetRosterSearchResults(){
  rosterSearchResults = [];
  rosterSearchIndex = -1;
  rosterSearchQuery = '';
  clearRosterSearchHighlights();
  updateSearchNavUI('roster');
}

function resetScheduleSearchResults(){
  scheduleSearchResults = [];
  scheduleSearchIndex = -1;
  scheduleSearchQuery = '';
  clearScheduleSearchHighlights();
  updateSearchNavUI('schedule');
}

function handleRosterSearchInput(){
  const input = document.getElementById('roster-search-input');
  if(!input) return;
  const value = input.value.trim();
  if(!value || (rosterSearchQuery && value.toLowerCase() !== rosterSearchQuery.toLowerCase())){
    resetRosterSearchResults();
  }
}

function handleScheduleSearchInput(){
  const input = document.getElementById('schedule-search-input');
  if(!input) return;
  const value = input.value.trim();
  if(!value || (scheduleSearchQuery && value.toLowerCase() !== scheduleSearchQuery.toLowerCase())){
    resetScheduleSearchResults();
  }
}

function highlightRosterSearchResult(){
  clearRosterSearchHighlights();

  const found = rosterSearchResults[rosterSearchIndex];
  if(!found){
    updateSearchNavUI('roster');
    return;
  }

  const card = document.getElementById(`tutor-card-${found.id}`);
  if(!card) return;

  card.classList.add('search-hit');

  const clearHighlight = () => {
    card.classList.remove('search-hit');
    card.removeEventListener('mouseenter', clearHighlight);
  };

  card.addEventListener('mouseenter', clearHighlight, { once:true });
  card.scrollIntoView({behavior:'smooth', block:'center'});
  updateSearchNavUI('roster');
  showToast(`Found ${escapeHtml(found.name)} (${rosterSearchIndex + 1} of ${rosterSearchResults.length}).`, 'ok', 2200);
}

function highlightScheduleSearchResult(){
  clearScheduleSearchHighlights();

  const found = scheduleSearchResults[scheduleSearchIndex];
  if(!found){
    updateSearchNavUI('schedule');
    return;
  }

  const row = document.getElementById(`hours-row-${found.id}`);
  if(!row){
    showToast(`Found ${escapeHtml(found.name)}, but the schedule summary is not visible yet.`, 'warn');
    return;
  }

  row.classList.add('schedule-search-hit');

  const clearHighlight = () => {
    row.classList.remove('schedule-search-hit');
    row.removeEventListener('mouseenter', clearHighlight);
  };

  row.addEventListener('mouseenter', clearHighlight, { once:true });
  row.scrollIntoView({behavior:'smooth', block:'center'});
  updateSearchNavUI('schedule');
  showToast(`Found ${escapeHtml(found.name)} (${scheduleSearchIndex + 1} of ${scheduleSearchResults.length}).`, 'ok', 2200);
}

function moveRosterSearch(direction){
  if(!rosterSearchResults.length) return;
  rosterSearchIndex = (rosterSearchIndex + direction + rosterSearchResults.length) % rosterSearchResults.length;
  highlightRosterSearchResult();
}

function moveScheduleSearch(direction){
  if(!scheduleSearchResults.length) return;
  scheduleSearchIndex = (scheduleSearchIndex + direction + scheduleSearchResults.length) % scheduleSearchResults.length;
  highlightScheduleSearchResult();
}

function searchScheduleName(){
  const input = document.getElementById('schedule-search-input');
  if(!input) return;
  const raw = input.value.trim();
  clearScheduleSearchHighlights();

  if(!raw){
    showToast('Type a first name or last name to search the schedule.', 'warn');
    input.focus();
    resetScheduleSearchResults();
    return;
  }

  if(!currentSlots.length){
    showToast('Generate a schedule first, then search for a name in the schedule.', 'warn');
    resetScheduleSearchResults();
    return;
  }

  const q = raw.toLowerCase();
  scheduleSearchResults = tutors.filter(t=>{
    const parts = t.name.toLowerCase().split(/\s+/).filter(Boolean);
    const first = parts[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    return first.includes(q) || last.includes(q);
  });
  scheduleSearchIndex = scheduleSearchResults.length ? 0 : -1;
  scheduleSearchQuery = raw;

  if(!scheduleSearchResults.length){
    showToast(`No tutor found for <strong>${escapeHtml(raw)}</strong>. Search by first name or last name only.`, 'warn');
    updateSearchNavUI('schedule');
    return;
  }

  highlightScheduleSearchResult();
}

function searchRoster(){
  const input = document.getElementById('roster-search-input');
  if(!input) return;
  const raw = input.value.trim();
  clearRosterSearchHighlights();

  if(!raw){
    showToast('Type a name, email, or phone number to search the roster.', 'warn');
    input.focus();
    resetRosterSearchResults();
    return;
  }

  const q = raw.toLowerCase();
  const qDigits = raw.replace(/\D/g,'');

  rosterSearchResults = tutors.filter(t=>{
    const searchable = [t.name,t.email,t.phone,t.eng101,t.mode,t.stable]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const phoneDigits = (t.phone||'').replace(/\D/g,'');
    return searchable.includes(q) || (qDigits.length>=3 && phoneDigits.includes(qDigits));
  });
  rosterSearchIndex = rosterSearchResults.length ? 0 : -1;
  rosterSearchQuery = raw;

  if(!rosterSearchResults.length){
    showToast(`No tutor found for <strong>${escapeHtml(raw)}</strong>. Try a first name, last name, email, or phone number.`, 'warn');
    updateSearchNavUI('roster');
    return;
  }

  highlightRosterSearchResult();
}


function editTutor(id){
  const tutor = getTutorById(id);
  if(!tutor) return;

  closeEditTutorModal();

  const modeOptions = [
    ['both','In-person & online'],
    ['oc','In-person only'],
    ['ol','Online only']
  ].map(([value,label])=>`<option value="${value}" ${tutor.mode===value?'selected':''}>${label}</option>`).join('');

  const baseHrsOptions = [
    ['3','1–5 hrs'],
    ['8','6–10 hrs'],
    ['12','10–15 hrs'],
    ['24','15–24 hrs (max)']
  ];
  if(tutor.hrs && !baseHrsOptions.some(([value])=>String(tutor.hrs)===value)){
    baseHrsOptions.splice(baseHrsOptions.length-1,0,[String(tutor.hrs),`${tutor.hrs} hrs`]);
  }
  const hrsOptions = baseHrsOptions.map(([value,label])=>`<option value="${value}" ${String(tutor.hrs)===value?'selected':''}>${label}</option>`).join('');

  let availHtml = '<table class="avail-table"><thead><tr><th style="width:68px"></th>';
  ALL_DAYS.forEach(d => availHtml += `<th>${d.slice(0,3)}</th>`);
  availHtml += '</tr></thead><tbody>';
  TIMES_MF.forEach(t => {
    availHtml += `<tr><td class="tc-time">${fmtTime(t)}</td>`;
    ALL_DAYS.forEach(d => {
      const key = d + '-' + t;
      const fri = d === 'Friday', inFri = TIMES_FRI.includes(t);
      if(fri && !inFri){
        availHtml += '<td class="tc-cell" style="background:var(--soft)"></td>';
      } else {
        const checked = tutor.avail && tutor.avail[key] === true ? 'checked' : '';
        availHtml += `<td class="tc-cell availability-click-cell ${checked ? 'available-cell' : ''}" onclick="toggleEditAvailCell(this)"><input type="checkbox" class="avail-cb edit-avail-cb" data-key="${key}" ${checked} onclick="event.stopPropagation()" onchange="syncAvailabilityCellVisual(this)"></td>`;
      }
    });
    availHtml += '</tr>';
  });
  availHtml += '</tbody></table>';

  const ov = document.createElement('div');
  ov.id = 'edit-tutor-overlay';
  ov.className = 'edit-modal-overlay';
  ov.innerHTML = `
    <div class="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-tutor-title">
      <div class="edit-modal-top">
        <div class="edit-modal-icon"><i class="ti ti-edit"></i></div>
        <div>
          <div class="edit-modal-title" id="edit-tutor-title">Edit tutor information</div>
          <div class="edit-modal-sub">Update roster details without removing and re-entering this person.</div>
        </div>
      </div>
      <div class="edit-modal-body">
        <div class="form-grid two" style="margin-top:0">
          <div class="fg"><span class="fl">Full name <span style="color:var(--red)">*</span></span><input id="edit-name" value="${escapeHtml(tutor.name||'')}" placeholder="e.g. Jamie Ray"></div>
          <div class="fg"><span class="fl">LACCD email <span style="color:var(--red)">*</span></span><input id="edit-email" value="${escapeHtml(tutor.email||'')}" placeholder="name@laccd.edu"></div>
        </div>
        <div class="form-grid two">
          <div class="fg"><span class="fl">Phone number <span style="color:var(--red)">*</span></span><input id="edit-phone" type="tel" value="${escapeHtml(tutor.phone||'')}" placeholder="e.g. (818) 555-0100" onblur="formatPhone(this)"></div>
          <div class="fg"><span class="fl">Completed ENG 101 / ENGL C1000?</span>
            <select id="edit-eng101">
              <option value="yes" ${tutor.eng101==='yes'?'selected':''}>Yes — completed</option>
              <option value="no" ${tutor.eng101==='no'?'selected':''}>Not yet</option>
            </select>
          </div>
        </div>
        <div class="form-grid" style="align-items:end">
          <div class="fg"><span class="fl">Desired hrs / week</span><select id="edit-hrs">${hrsOptions}</select></div>
          <div class="fg"><span class="fl" style="line-height:1.35;text-transform:none;font-size:10px;letter-spacing:0">Hours/wk in another Pierce College position (not ESL/CAS)</span><input id="edit-other" type="number" min="0" max="25" value="${Number(tutor.other)||0}" placeholder="0"></div>
          <div class="fg"><span class="fl">Mode</span><select id="edit-mode">${modeOptions}</select></div>
          <div class="fg"><span class="fl">Saturday</span><select id="edit-sat"><option value="no" ${!tutor.sat?'selected':''}>Not available Sat</option><option value="yes" ${tutor.sat?'selected':''}>Available Saturday</option></select></div>
          <div class="fg"><span class="fl">Schedule stability</span><select id="edit-stable"><option value="stable" ${tutor.stable==='stable'?'selected':''}>Stable</option><option value="maybe" ${tutor.stable==='maybe'?'selected':''}>May change</option><option value="tentative" ${tutor.stable==='tentative'?'selected':''}>Tentative</option></select></div>
        </div>
        <div style="background:var(--warn-bg);border:1px solid var(--warn-b);border-radius:12px;padding:13px 16px;margin-top:4px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px">Scheduling priority acknowledgment <span style="color:var(--red)">*</span></div>
          <p style="font-size:12px;color:var(--ink);margin-bottom:10px;line-height:1.5">ESL tutors who are available to work in person are given scheduling priority. Do you agree with this?</p>
          <div style="display:flex;gap:12px">
            <label style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;cursor:pointer"><input type="radio" name="edit-priority" value="agree" ${tutor.priority!=='disagree'?'checked':''} style="width:16px;height:16px;accent-color:var(--red);flex-shrink:0"> Agree</label>
            <label style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;cursor:pointer"><input type="radio" name="edit-priority" value="disagree" ${tutor.priority==='disagree'?'checked':''} style="width:16px;height:16px;accent-color:var(--red);flex-shrink:0"> Disagree</label>
          </div>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.03em">Availability — M–Th 9am–5pm · Fri 10am–2pm</div>
        <div class="edit-avail-wrap">${availHtml}</div>
        <div class="edit-modal-actions">
          <button class="btn" onclick="closeEditTutorModal()">Cancel</button>
          <button class="btn btn-sm" onclick="editSelectAllAvailability()">Select all</button>
          <button class="btn btn-sm" onclick="editClearAvailability()">Clear</button>
          <button class="btn btn-red" onclick="saveTutorEdit(${Number(tutor.id)})"><i class="ti ti-device-floppy"></i> Save changes</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e=>{ if(e.target===ov) closeEditTutorModal(); });
}

function closeEditTutorModal(){
  const ov = document.getElementById('edit-tutor-overlay');
  if(ov) ov.remove();
}

function syncAvailabilityCellVisual(cb){
  const cell = cb.closest('td');
  if(cell) cell.classList.toggle('available-cell', cb.checked);
}

function toggleEditAvailCell(cell){
  const cb = cell.querySelector('input[type="checkbox"]');
  if(!cb) return;
  cb.checked = !cb.checked;
  syncAvailabilityCellVisual(cb);
}

function editSelectAllAvailability(){
  document.querySelectorAll('#edit-tutor-overlay .edit-avail-cb').forEach(cb=>{
    cb.checked=true;
    syncAvailabilityCellVisual(cb);
  });
}

function editClearAvailability(){
  document.querySelectorAll('#edit-tutor-overlay .edit-avail-cb').forEach(cb=>{
    cb.checked=false;
    syncAvailabilityCellVisual(cb);
  });
}

function saveTutorEdit(id){
  const tutor = getTutorById(id);
  if(!tutor) return;

  const name = document.getElementById('edit-name').value.trim();
  if(!name){ showToast('Please enter the tutor\'s full name.'); document.getElementById('edit-name').focus(); return; }

  const email = document.getElementById('edit-email').value.trim();
  if(!email){ showToast('A LACCD email address is required.'); document.getElementById('edit-email').focus(); return; }
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!emailRx.test(email)){ showToast('Please enter a valid email address (e.g. name@laccd.edu).'); document.getElementById('edit-email').focus(); return; }

  const phone = document.getElementById('edit-phone').value.trim();
  if(!phone){ showToast('A phone number is required so Jamie can reach this tutor if needed.'); document.getElementById('edit-phone').focus(); return; }

  if(tutors.some(t => String(t.id)!==String(id) && t.email && t.email.toLowerCase()===email.toLowerCase())){
    showToast(`Another tutor already uses the email <strong>${escapeHtml(email)}</strong>. Please check for duplicates.`);
    return;
  }

  const phoneDigits = phone.replace(/\D/g,'');
  if(tutors.some(t => String(t.id)!==String(id) && t.phone && t.phone.replace(/\D/g,'')===phoneDigits && phoneDigits.length>=7)){
    showToast(`Another tutor already uses the phone number <strong>${escapeHtml(phone)}</strong>. Please check for duplicates.`);
    return;
  }

  const priorityEl = document.querySelector('input[name="edit-priority"]:checked');
  if(!priorityEl){ showToast('Please select Agree or Disagree for the scheduling priority acknowledgment.', 'warn'); return; }

  // Build the full slot map from first principles (not from the global add-form
  // 'avail' object, which is empty when tutors were imported rather than manually added).
  const updatedAvail = {};
  TIMES_MF.forEach(t => {
    ALL_DAYS.forEach(d => {
      const key = d + '-' + t;
      updatedAvail[key] = (d === 'Friday' && !TIMES_FRI.includes(t)) ? null : false;
    });
  });
  document.querySelectorAll('#edit-tutor-overlay .edit-avail-cb').forEach(cb => {
    updatedAvail[cb.dataset.key] = cb.checked;
  });

  const markedSlots = Object.values(updatedAvail).filter(v=>v===true).length;
  if(markedSlots === 0){ showToast('Please mark at least one available time slot before saving this tutor.', 'warn'); return; }

  saveUndoState('edited tutor');

  const updated = {
    ...tutor,
    name,
    email,
    phone,
    eng101:document.getElementById('edit-eng101').value,
    hrs:parseInt(document.getElementById('edit-hrs').value)||8,
    other:parseInt(document.getElementById('edit-other').value)||0,
    mode:document.getElementById('edit-mode').value,
    sat:document.getElementById('edit-sat').value==='yes',
    stable:document.getElementById('edit-stable').value,
    priority:priorityEl.value,
    avail:updatedAvail
  };

  Object.assign(tutor, updated);

  // Keep any already-generated schedule cards in sync with the edited roster details.
  if(currentSlots.length){
    currentSlots.forEach(slot=>{
      slot.assigned = slot.assigned.map(t=>String(t.id)===String(id) ? {...t, ...updated} : t);
    });
    updateScheduleStats();
    renderOutput(currentSlots);
  }

  closeEditTutorModal();
  resetRosterSearchResults();
  renderTutors();
  showToast(`${escapeHtml(name)} was updated.`, 'ok');
}

function removeTutor(id){
  const tutor = getTutorById(id);
  if(!tutor) return;

  const assignedCount = currentSlots.reduce((count, slot) => {
    return count + (slot.assigned.some(t => String(t.id) === String(id)) ? 1 : 0);
  }, 0);

  const assignedText = assignedCount > 0
    ? `<br><br><strong>Warning:</strong> ${escapeHtml(tutor.name)} currently has ${(assignedCount * 0.5).toFixed(1)} scheduled hour${assignedCount === 2 ? '' : 's'} in the generated schedule. Removing this tutor will also remove those schedule assignments.`
    : '';

  showConfirm(
    'Remove tutor from roster?',
    `Are you sure you want to remove <strong>${escapeHtml(tutor.name)}</strong> from the roster? This cannot be undone.${assignedText}`,
    () => {
      tutors = tutors.filter(t => String(t.id) !== String(id));

      // Also remove this tutor from the current generated schedule, if one exists.
      if(currentSlots.length){
        currentSlots.forEach(slot => {
          slot.assigned = slot.assigned.filter(t => String(t.id) !== String(id));
        });
        updateScheduleStats(); paintUncoveredCells();
        renderOutput(currentSlots);
      }

      renderTutors();
      showToast(`${escapeHtml(tutor.name)} was removed from the roster.`, 'ok');
    },
    'Remove tutor'
  );
}

// ── Add tutor manually ───────────────────────────────────
function addTutor(){
  const name = document.getElementById('t-name').value.trim();
  if(!name){ showToast('Please enter the tutor\'s full name.'); document.getElementById('t-name').focus(); return; }

  const email = document.getElementById('t-email').value.trim();
  if(!email){ showToast('A LACCD email address is required.'); document.getElementById('t-email').focus(); return; }
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!emailRx.test(email)){ showToast('Please enter a valid email address (e.g. name@laccd.edu).'); document.getElementById('t-email').focus(); return; }

  const phone = document.getElementById('t-phone').value.trim();

  // ── Phone required ───────────────────────────────────────
  if(!phone){
    showToast('A phone number is required so Jamie can reach this tutor if needed.');
    document.getElementById('t-phone').focus();
    return;
  }

  // ── Duplicate email check ────────────────────────────────
  if(email && tutors.some(t => t.email && t.email.toLowerCase()===email.toLowerCase())){
    showToast(`A tutor with the email <strong>${email}</strong> is already in the roster. Please check for duplicates.`);
    return;
  }

  // ── Duplicate phone check ────────────────────────────────
  if(tutors.some(t => t.phone && t.phone.replace(/\D/g,'')===phone.replace(/\D/g,'') && phone.replace(/\D/g,'').length>=7)){
    showToast(`A tutor with the phone number <strong>${phone}</strong> is already in the roster. Please check for duplicates.`);
    return;
  }

  // ── Priority acknowledgment required ─────────────────────
  const priorityEl = document.querySelector('input[name="t-priority"]:checked');
  if(!priorityEl){
    showToast('Please select Agree or Disagree for the scheduling priority acknowledgment.', 'warn');
    return;
  }

  // ── Availability check ───────────────────────────────────
  const av = {...avail};
  const markedSlots = Object.values(av).filter(v=>v===true).length;
  if(markedSlots === 0){
    showToast('Please mark at least one available time slot in the grid below before adding this tutor.', 'warn');
    return;
  }

  const eng101 = document.getElementById('t-eng101').value;
  const hrs = parseInt(document.getElementById('t-hrs').value)||8;
  const other = parseInt(document.getElementById('t-other').value)||0;
  const mode = document.getElementById('t-mode').value;
  const sat = document.getElementById('t-sat').value==='yes';
  const stable = document.getElementById('t-stable').value;
  const priority = priorityEl.value;

  tutors.push({id:Date.now(),name,email,phone,eng101,hrs,other,mode,sat,stable,priority,avail:av,assignedHrs:0,assignments:[],manual:true});
  renderTutors();
  document.getElementById('t-name').value='';
  document.getElementById('t-email').value='';
  document.getElementById('t-phone').value='';
  document.getElementById('t-eng101').value='yes';
  document.querySelectorAll('input[name="t-priority"]').forEach(r=>r.checked=false);
  clearAvail();
  document.getElementById('add-details').removeAttribute('open');
  showStatus('import-status','',null);
}

// ── Clear everything & start over ───────────────────────
function clearAll(){
  showConfirm(
    'Clear everything?',
    'This will delete all tutors and the current schedule. This cannot be undone.',
    ()=>{
      saveUndoState('clear all');
      tutors=[]; currentSlots=[]; selectedShift=null; moveMode=null; focusedTutorId=null; showAllGaps=false; currentAnalysisReportText=''; currentAnalysisReportHTML=''; analysisPanelOpen=false;
  addHoursMode=null; moveMode=null; selectedShift=null; resetRosterSearchResults(); resetScheduleSearchResults();
      closeShiftPopover();
      document.getElementById('gen-out').innerHTML='';
      document.getElementById('st-tutors').textContent='0';
      document.getElementById('st-hrs').textContent='0';
      document.getElementById('st-slots').textContent='—';
      document.getElementById('st-gaps').textContent='—';
      document.getElementById('import-status').innerHTML='';
      document.getElementById('csv-paste').value='';
      document.getElementById('csv-file').value='';
      renderTutors();
      switchPane('upload');
    },
    'Clear everything'
  );
  return;
}

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
}

function updateScrollTopButton(activePane){
  const btn = document.getElementById('scroll-top-btn');
  if(!btn) return;
  btn.classList.toggle('show', activePane==='tutors' || activePane==='generate');
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

// ── CSV import ───────────────────────────────────────────
function handleCSV(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => parseCSVText(e.target.result);
  reader.readAsText(file);
  input.value = ''; // reset so same file can be selected again
}


function parseDesiredHours(raw){
  const text = String(raw || '').trim().toLowerCase();
  if(!text) return 8;

  // Google Forms answers may come in as labels like "1–5 hrs",
  // "6–10 hrs", "10–15 hrs", or "15–24 hrs (max)".
  if(text.includes('15') && (text.includes('24') || text.includes('+') || text.includes('max'))) return 24;
  if(text.includes('10') && text.includes('15')) return 12;
  if(text.includes('6') && text.includes('10')) return 8;
  if(text.includes('1') && text.includes('5')) return 3;

  // Manual CSV can use exact desired hours like 10, 16, 20, etc.
  const n = parseFloat(text.replace(/[^0-9.]/g,''));
  if(!Number.isFinite(n) || n <= 0) return 8;
  return Math.min(24, n);
}



function parseCSVLine(line){
  const out = [];
  let cur = '';
  let inQuotes = false;

  for(let i=0;i<line.length;i++){
    const ch = line[i];

    if(ch === '"'){
      if(inQuotes && line[i+1] === '"'){
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if(ch === ',' && !inQuotes){
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }

  out.push(cur.trim());
  return out.map(v => v.replace(/^"|"$/g,'').trim());
}

function csvRowLooksLikeHeader(vals){
  const joined = vals.join(' ').toLowerCase();
  const first = (vals[0] || '').toLowerCase();
  const second = (vals[1] || '').toLowerCase();

  return (
    first.includes('name') ||
    second.includes('email') ||
    joined.includes('desired hours') ||
    joined.includes('phone') ||
    joined.includes('eng 101') ||
    joined.includes('engl c1000') ||
    joined.includes('priority')
  );
}

function normalizeCSVTimeToken(token){
  let s = (token || '').trim().toLowerCase();
  if(!s) return '';

  s = s.replace(/\s+/g,' ');
  s = s.replace(/\./g, ':');
  s = s.replace(/^0+(\d)/, '$1');

  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if(!m) return '';

  let hr = parseInt(m[1], 10);
  const min = m[2] || '00';
  let ap = (m[3] || '').toLowerCase();

  // The app's internal availability keys use 24-hour HH:MM strings like Monday-9:00 and Tuesday-13:00.
  if(ap === 'pm' && hr !== 12) hr += 12;
  if(ap === 'am' && hr === 12) hr = 0;

  if(!ap){
    // For manual CSV, assume app working hours: 9-11 = morning, 12-5 = afternoon.
    if(hr >= 1 && hr <= 5) hr += 12;
  }

  return `${hr}:${min}`;
}

function availabilityKeyFromToken(token){
  let s = (token || '').trim().replace(/"/g,'');
  if(!s) return '';

  const dmap = {
    'mon':'Monday','monday':'Monday',
    'tue':'Tuesday','tues':'Tuesday','tuesday':'Tuesday',
    'wed':'Wednesday','weds':'Wednesday','wednesday':'Wednesday',
    'thu':'Thursday','thur':'Thursday','thurs':'Thursday','thursday':'Thursday',
    'fri':'Friday','friday':'Friday'
  };

  // Accept "Mon 9:00", "Monday 9am", "Tue 1:30pm", etc.
  const m = s.match(/^(mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday)\s+(.+)$/i);
  if(!m) return '';

  const day = dmap[m[1].toLowerCase()];
  const time = normalizeCSVTimeToken(m[2]);

  if(!time) return '';
  return `${day}-${time}`;
}

function firstCSVValue(row, names, fallbackIndex=null){
  for(const name of names){
    if(row[name] !== undefined && String(row[name]).trim() !== '') return row[name];
  }
  if(fallbackIndex !== null && fallbackIndex !== undefined) return row.__vals[fallbackIndex] || '';
  return '';
}

function yesNoFromText(raw, defaultValue='yes'){
  const text = String(raw || '').trim().toLowerCase();
  if(!text) return defaultValue;
  if(text.includes('disagree') || text === 'no' || text.includes('not') || text.includes('nope')) return 'no';
  if(text.includes('agree') || text === 'yes' || text.includes('completed') || text === 'y') return 'yes';
  return defaultValue;
}

function parseManualCSVRow(vals, headers, hasHeader){
  const row = {__vals: vals};

  if(hasHeader){
    headers.forEach((h,idx)=>row[h]=vals[idx]||'');
  }

  const name = firstCSVValue(row, ['name','full name','tutor name'], 0);
  const email = firstCSVValue(row, ['email','laccd email','student email','work email'], 1);

  let phone = firstCSVValue(row, ['phone','phone number','cell','cell phone','mobile'], null);
  let hrsRaw = firstCSVValue(row, ['hours','desired hours','hrs','desired hrs','desired hrs / week','desired hours per week'], null);
  let modeRaw = firstCSVValue(row, ['mode','mode preference','modality'], null);
  let satRaw = firstCSVValue(row, ['saturday','sat'], null);
  let eng101Raw = firstCSVValue(row, ['eng101','eng 101','engl c1000','completed eng 101','completed eng 101 / engl c1000','completed eng101'], null);
  let priorityRaw = firstCSVValue(row, ['priority','agree','scheduling priority','priority acknowledgment','scheduling priority acknowledgment'], null);
  let otherRaw = firstCSVValue(row, ['other campus hours','other hours','other','other pierce hours'], null);
  let stableRaw = firstCSVValue(row, ['stability','schedule stability'], null);

  if(!hasHeader){
    // Supported headerless format:
    // Name, Email, Phone, Desired Hours, Mode, Saturday, ENG101, Priority, Mon 9:00, Mon 9:30...
    // Phone / ENG101 / Priority are optional. Availability can appear anywhere after the basics.
    let yesNoCountAfterSaturday = 0;

    for(let idx=2; idx<vals.length; idx++){
      const v = (vals[idx] || '').trim();
      const low = v.toLowerCase();

      if(!v || availabilityKeyFromToken(v)) continue;

      if(!phone && /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/.test(v)){
        phone = v;
        continue;
      }

      if(!hrsRaw && /^\d+(\.\d+)?$/.test(v)){
        hrsRaw = v;
        continue;
      }

      if(!modeRaw && (low === 'both' || low === 'oc' || low === 'ol' || low.includes('online') || low.includes('person'))){
        modeRaw = v;
        continue;
      }

      if(!satRaw && (low === 'yes' || low === 'no' || low.includes('saturday'))){
        satRaw = v;
        yesNoCountAfterSaturday++;
        continue;
      }

      if(satRaw && !eng101Raw && (low === 'yes' || low === 'no' || low.includes('completed') || low.includes('not yet') || low.includes('eng'))){
        eng101Raw = v;
        continue;
      }

      if(!priorityRaw && (low.includes('agree') || low.includes('disagree'))){
        priorityRaw = v;
        continue;
      }

      if(!stableRaw && (low.includes('stable') || low.includes('maybe') || low.includes('tentative'))){
        stableRaw = v;
        continue;
      }
    }
  }

  const av = {};
  Object.keys(avail).forEach(k=>av[k]=false);

  if(hasHeader){
    headers.forEach((h,idx)=>{
      const keyFromHeader = availabilityKeyFromToken(h);
      if(keyFromHeader && keyFromHeader in av){
        const cell = (vals[idx]||'').toLowerCase();
        av[keyFromHeader] = cell==='true'||cell==='1'||cell==='yes'||cell==='available'||cell==='x'||cell==='✓';
      }
    });
  }

  // Always scan the entire row for availability tokens like Mon 9:00, Tue 1pm, etc.
  vals.forEach(token=>{
    const key = availabilityKeyFromToken(token);
    if(key && key in av) av[key] = true;
  });

  const hrs = parseDesiredHours(hrsRaw || '8');
  const modeLow = (modeRaw || 'both').toLowerCase();
  const mode = modeLow.includes('online')&&!modeLow.includes('person')?'ol':modeLow.includes('person')&&!modeLow.includes('online')?'oc':modeLow==='oc'?'oc':modeLow==='ol'?'ol':'both';
  const sat = (satRaw || '').toLowerCase().includes('yes');
  const stable = (stableRaw || 'stable').toLowerCase().includes('tentative')?'tentative':(stableRaw || '').toLowerCase().includes('maybe')?'maybe':'stable';
  const eng101 = yesNoFromText(eng101Raw || 'yes', 'yes');
  const priority = String(priorityRaw || 'agree').toLowerCase().includes('disagree') ? 'disagree' : 'agree';
  const other = parseInt(otherRaw || '0') || 0;

  return {name,email,phone,hrs,other,mode,sat,stable,eng101,priority,av};
}

function parseCSVText(text){
  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim());

  if(lines.length < 1){
    showStatus('import-status','Paste at least one tutor row before parsing.','err');
    return;
  }

  const firstVals = parseCSVLine(lines[0]);
  const hasHeader = csvRowLooksLikeHeader(firstVals);
  const headers = hasHeader ? firstVals.map(h=>h.trim().replace(/"/g,'').toLowerCase()) : [];
  const startIndex = hasHeader ? 1 : 0;

  if(lines.length <= startIndex){
    showStatus('import-status','The CSV has a header but no tutor rows. Add at least one tutor on the next line.','err');
    return;
  }

  let added = 0;
  let skipped = 0;

  for(let i=startIndex;i<lines.length;i++){
    const vals = parseCSVLine(lines[i]);
    if(vals.every(v=>!v)) continue;

    const parsed = parseManualCSVRow(vals, headers, hasHeader);
    const name = parsed.name;

    if(!name || name.length < 2){
      skipped++;
      continue;
    }

    if(tutors.find(t=>t.name.toLowerCase()===name.toLowerCase())){
      skipped++;
      continue;
    }

    tutors.push({
      id:Date.now()+i,
      name:parsed.name,
      email:parsed.email,
      phone:parsed.phone,
      eng101:parsed.eng101,
      priority:parsed.priority,
      hrs:parsed.hrs,
      other:parsed.other,
      mode:parsed.mode,
      sat:parsed.sat,
      stable:parsed.stable,
      avail:parsed.av,
      assignedHrs:0,
      assignments:[],
      manual:false
    });
    added++;
  }

  renderTutors();

  if(added>0){
    showStatus('import-status',`Imported ${added} tutor${added>1?'s':''} from CSV. Switch to the Roster tab to review or add missing tutors.`,'ok');
    setTimeout(()=>switchPane('tutors'), 1200);
  } else {
    showStatus('import-status','No new tutors found. Check that each row starts with name and email, then includes hours/mode/Saturday and availability times.','err');
  }
}

// ── Drag-and-drop on upload zone ─────────────────────────
const DZ = document.getElementById('drop-zone');
DZ.addEventListener('dragover', e=>{ e.preventDefault(); DZ.classList.add('drag'); });
DZ.addEventListener('dragleave', ()=> DZ.classList.remove('drag'));
DZ.addEventListener('drop', e=>{
  e.preventDefault(); DZ.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if(f){ const r=new FileReader(); r.onload=ev=>parseCSVText(ev.target.result); r.readAsText(f); }
});

// ── Schedule generation ───────────────────────────────────
function generateSchedule(){
  if(!validateScheduleSettings()) return;
  if(currentSlots.length || tutors.some(t=>t.assignedHrs>0 || (t.assignments&&t.assignments.length)) || currentAnalysisReportText){
    saveUndoState('regenerated schedule');
  }
  currentAnalysisReportText=''; currentAnalysisReportHTML=''; analysisPanelOpen=false;
  if(!tutors.length){
    document.getElementById('gen-out').innerHTML='<div class="empty">Add tutors first — import a CSV or add them manually in the Roster tab.</div>';
    return;
  }

  tutors.forEach(t=>{ t.assignedHrs=0; t.assignments=[]; });

  const allSlots=[];
  ALL_DAYS.forEach(day=>{
    const times=day==='Friday'?TIMES_FRI:TIMES_MF;
    times.forEach(t=>allSlots.push({day,time:t,assigned:[]}));
  });

  allSlots.forEach(slot=>{
    const eligible=tutors.filter(t=>{
      const key=slot.day+'-'+slot.time;
      return t.avail[key]===true
        && t.assignedHrs<t.hrs
        && !wouldExceedConsecutiveLimit(t,slot.day,slot.time,allSlots);
    });
    eligible.sort((a,b)=>(a.assignedHrs/a.hrs)-(b.assignedHrs/b.hrs));
    for(const t of eligible.slice(0,3)){
      if(!canAssignMoreBudget(0.5)) break;
      t.assignedHrs+=0.5;
      t.assignments.push(slot);
      slot.assigned.push(t);
    }
  });

  const covered=allSlots.filter(s=>s.assigned.length>0).length;
  const gaps=allSlots.filter(s=>s.assigned.length===0).length;
  document.getElementById('st-slots').textContent=covered;
  document.getElementById('st-gaps').textContent=gaps;
  showAllGaps = false;

  renderOutput(allSlots);
}

// ── Expand/collapse uncovered slots ───────────────────────
function toggleGaps(){
  showAllGaps = !showAllGaps;
  renderOutput(currentSlots);
}

// ── Render schedule output ────────────────────────────────

function paintUncoveredCells(){
  document.querySelectorAll('.sched-table td[data-day][data-time]').forEach(td=>{
    const day=td.dataset.day;
    const time=td.dataset.time;
    td.classList.toggle('uncovered-cell', isCellUncovered(day,time));
  });
}



function tutorModeLabel(tutor){
  if(!tutor) return '—';
  if(tutor.mode === 'ol') return 'Online';
  if(tutor.mode === 'oc') return 'In-person';
  return 'In-person & online';
}

function tutorModeShort(tutor){
  if(!tutor) return '';
  return tutor.mode === 'ol' ? 'OL' : 'OC';
}

function tutorAvailabilityCount(tutor){
  if(!tutor || !tutor.avail) return 0;
  return Object.values(tutor.avail).filter(v=>v===true).length;
}

function ensureTutorHoverCard(){
  let card = document.getElementById('tutor-hover-card');
  if(!card){
    card = document.createElement('div');
    card.id = 'tutor-hover-card';
    card.className = 'tutor-hover-card';
    document.body.appendChild(card);
  }
  return card;
}

function positionTutorHoverCard(event){
  const card = ensureTutorHoverCard();
  const pad = 14;
  let x = event.clientX + pad;
  let y = event.clientY + pad;

  const rect = card.getBoundingClientRect();
  if(x + rect.width > window.innerWidth - 10) x = event.clientX - rect.width - pad;
  if(y + rect.height > window.innerHeight - 10) y = event.clientY - rect.height - pad;

  card.style.left = Math.max(10, x) + 'px';
  card.style.top = Math.max(10, y) + 'px';
}

function showTutorQuickSummary(event, tutorId){
  const tutor = getTutorById(tutorId);
  if(!tutor) return;

  const card = ensureTutorHoverCard();
  const assigned = Number(tutor.assignedHrs || 0);
  const target = Number(tutor.hrs || 0);
  const modeShort = tutorModeShort(tutor);
  const availabilitySlots = tutorAvailabilityCount(tutor);

  card.innerHTML = `
    <div class="tutor-hover-title">${escapeHtml(tutor.name)} ${modeShort}</div>
    <div class="tutor-hover-row">
      <span class="tutor-hover-label">Assigned</span>
      <span class="tutor-hover-value">${assigned.toFixed(1)} / ${target} hrs</span>
    </div>
    <div class="tutor-hover-row">
      <span class="tutor-hover-label">Mode</span>
      <span class="tutor-hover-value">${escapeHtml(tutorModeLabel(tutor))}</span>
    </div>
    <div class="tutor-hover-row">
      <span class="tutor-hover-label">Availability slots</span>
      <span class="tutor-hover-value">${availabilitySlots}</span>
    </div>
  `;

  positionTutorHoverCard(event);
  requestAnimationFrame(()=>card.classList.add('show'));
}

function moveTutorQuickSummary(event){
  const card = document.getElementById('tutor-hover-card');
  if(card && card.classList.contains('show')) positionTutorHoverCard(event);
}

function hideTutorQuickSummary(){
  const card = document.getElementById('tutor-hover-card');
  if(card) card.classList.remove('show');
}


function renderOutput(slots){
  currentSlots = slots;
  const slotMap={};
  slots.forEach(s=>slotMap[s.day+'-'+s.time]=s);

  // Detect consecutive runs per tutor per day — for merged pill label only (no rowspan)
  const shiftInfo={}; // "day-time-tutorId" => {isStart, runLen, startTime}
  ALL_DAYS.forEach(day=>{
    tutors.forEach(tutor=>{
      let runStart=null, runLen=0;
      const flush=()=>{
        if(runLen>0&&runStart!==null){
          const si=TIMES_MF.indexOf(runStart);
          for(let i=0;i<runLen;i++){
            const t=TIMES_MF[si+i];
            if(t) shiftInfo[day+'-'+t+'-'+tutor.id]={isStart:i===0,runLen,startTime:runStart};
          }
        }
        runStart=null;runLen=0;
      };
      TIMES_MF.forEach(t=>{
        if(day==='Friday'&&!TIMES_FRI.includes(t)){flush();return;}
        const slot=slotMap[day+'-'+t];
        if(slot&&slot.assigned.some(a=>String(a.id)===String(tutor.id))){if(!runStart)runStart=t;runLen++;}
        else flush();
      });
      flush();
    });
  });

  let html='';
  if(addHoursMode){
    const at=getTutorById(addHoursMode.tutorId);
    const remaining=at ? Math.max(0,(Number(at.hrs)||0)-(Number(at.assignedHrs)||0)) : 0;
    html+=`<div class="add-hours-help"><i class="ti ti-circle-plus"></i> Add-hours mode: click any green open cell to add ${at?escapeHtml(at.name):'this tutor'} based on availability. ${at?`Remaining target: ${remaining.toFixed(1)}h`:''}<button class="btn btn-sm" onclick="cancelAddHoursMode()"><i class="ti ti-x"></i> Cancel</button></div>`;
  }
  if(moveMode){
    const mt=getTutorById(moveMode.tutorId);
    html+=`<div class="move-help"><i class="ti ti-arrows-move"></i> Move mode: choose a valid destination cell for ${mt?escapeHtml(mt.name):'this tutor'}, or <button class="btn btn-sm" onclick="cancelMoveMode()" style="margin-left:auto">Cancel</button></div>`;
  }
  if(focusedTutorId && !addHoursMode){
    const ft=getTutorById(focusedTutorId);
    if(ft){
      html+=`<div class="focus-help"><i class="ti ti-user-search"></i> Focus mode: showing ${escapeHtml(ft.name)}'s schedule. Everyone else is greyed out. <button class="btn btn-sm" onclick="clearTutorFocus()"><i class="ti ti-x"></i> Exit focus</button></div>`;
    } else {
      focusedTutorId=null;
    }
  }
  html+='<div class="split">';

  // ── Left: grid ──
  html+=`<div class="panel ${focusedTutorId?'focus-mode':''}"><div class="panel-title">Weekly schedule grid</div><div class="schedule-period-label"><i class="ti ti-calendar-time"></i> ${escapeHtml(schedulePeriodText())}${scheduleSettings.weeklyBudget?` · Weekly budget: ${scheduleSettings.weeklyBudget.toFixed(1)}h`:''}</div><div class="sched-wrap"><table class="sched-table">`;
  html+='<thead><tr><th style="width:92px">Time</th>';
  ALL_DAYS.forEach(d=>html+=`<th>${d}</th>`);
  html+='</tr></thead><tbody>';

  TIMES_MF.forEach(t=>{
    html+=`<tr><td class="th">${fmtInterval(t)}</td>`;
    ALL_DAYS.forEach(day=>{
      const isFri=day==='Friday', inFri=TIMES_FRI.includes(t);
      // Friday out-of-range: grey cell, always emit td to keep column count right
      if(isFri&&!inFri){html+=`<td style="background:var(--soft);border-right:1px solid var(--line)"></td>`;return;}

      const slot=slotMap[day+'-'+t];
      const assignedHere=slot?slot.assigned:[];
      const movingTutor=moveMode?getTutorById(moveMode.tutorId):null;
      let cellClass='';
      if(moveMode && movingTutor){
        const sameCell=day===moveMode.day && t===moveMode.time;
        const available=movingTutor.avail[day+'-'+t]===true;
        const duplicate=assignedHere.some(x=>String(x.id)===String(movingTutor.id));
        const breakOk=!wouldExceedConsecutiveLimit(movingTutor,day,t,currentSlots,{day:moveMode.day,time:moveMode.time});
        cellClass=(available&&!duplicate&&!sameCell&&breakOk)?'drop-ok':'drop-no';
      } else if(addHoursMode){
        const addTutor=getTutorById(addHoursMode.tutorId);
        cellClass=(addTutor && isManualAddSlotValid(addTutor,day,t))?'add-ok':'add-no';
      }
      if(focusedTutorId && !moveMode && !addHoursMode){
        const hasFocused=assignedHere.some(x=>String(x.id)===String(focusedTutorId));
        cellClass=(cellClass+' '+(hasFocused?'focus-match-cell':'focus-other')).trim();
      }

      if(!assignedHere.length){html+=`<td class="${cellClass}" onclick="handleScheduleCellClick('${day}','${t}')"></td>`;return;}

      let pills='';
      assignedHere.forEach(tt=>{
        const c=colorFor(tutors.findIndex(x=>String(x.id)===String(tt.id)));
        const mode=tt.mode==='ol'?'OL':'OC';
        const info=shiftInfo[day+'-'+t+'-'+tt.id];
        const isMerged=info&&info.runLen>1;
        const pillClass=isMerged?'pill-merged':'pill';

        let timeLabel='';
        if(isMerged&&info.isStart){
          const endTime=TIMES_MF[TIMES_MF.indexOf(info.startTime)+info.runLen];
          timeLabel=`<span class="pill-time">${fmtTime(info.startTime)}–${endTime?fmtTime(endTime):'end'}</span>`;
        } else if(isMerged&&!info.isStart){
          // continuation row — show a faint continuation indicator, not a full pill
          const editClass=moveMode&&String(moveMode.tutorId)===String(tt.id)&&moveMode.day===day&&moveMode.time===t?' move-source':'';
          const focusClass=focusedTutorId?(String(focusedTutorId)===String(tt.id)?' focus-match':' focus-nonmatch'):'';
          pills+=`<span class="pill${editClass}${focusClass}" onmouseenter="showTutorQuickSummary(event,${tt.id})" onmousemove="moveTutorQuickSummary(event)" onmouseleave="hideTutorQuickSummary()" onclick="openShiftPopover(event,${tt.id},'${day}','${t}')" style="background:${c.bg};color:${c.text};border:1px dashed ${c.border};opacity:.72;font-size:9px;">${tt.name.split(' ')[0]} ···</span>`;
          return;
        }

        const editClass=moveMode&&String(moveMode.tutorId)===String(tt.id)&&moveMode.day===day&&moveMode.time===t?' move-source':'';
        const focusClass=focusedTutorId?(String(focusedTutorId)===String(tt.id)?' focus-match':' focus-nonmatch'):'';
        pills+=`<span class="${pillClass}${editClass}${focusClass}" onmouseenter="showTutorQuickSummary(event,${tt.id})" onmousemove="moveTutorQuickSummary(event)" onmouseleave="hideTutorQuickSummary()" onclick="openShiftPopover(event,${tt.id},'${day}','${t}')" style="background:${c.bg};color:${c.text};border:1.5px solid ${c.border}">${tt.name.split(' ')[0]} ${mode}${timeLabel}</span>`;
      });

      html+=`<td class="${cellClass}" onclick="handleScheduleCellClick('${day}','${t}')">${pills}</td>`;
    });
    html+='</tr>';
  });
  html+='</tbody></table></div><div class="export-row">';
  html+='<button class="btn btn-sm" onclick="exportScheduleExcel()"><i class="ti ti-file-spreadsheet"></i> Download Excel</button>';
  html+='<button class="btn btn-sm" onclick="exportSchedulePDF()"><i class="ti ti-file-type-pdf"></i> Download PDF</button>';
  html+=`<button class="btn btn-sm btn-red" onclick="runAIOptimize()" id="ai-btn">
    <i class="ti ti-chart-dots"></i> Analyze schedule
  </button>`;
  html+='</div>';

  // Smart analysis output stays under the schedule table, not in the right sidebar.
  html+=`<div class="ai-panel schedule-analysis-panel" id="ai-out" style="display:${analysisPanelOpen?'block':'none'}">
    <div class="ai-panel-head">
      <div class="ai-panel-title"><i class="ti ti-chart-dots"></i> Smart Schedule Analysis</div>
      <div class="ai-panel-actions">
        <button class="btn btn-sm" onclick="copyAnalysisReport()"><i class="ti ti-copy"></i> Copy analysis</button>
        <button class="btn btn-sm" onclick="closeAnalysisPanel()"><i class="ti ti-x"></i> Close analysis</button>
      </div>
    </div>
    <div class="ai-body" id="ai-body">${currentAnalysisReportHTML||''}</div>
  </div>`;

  html+='</div>';

  // ── Right sidebar ──
  html+='<div>';

  // Hours summary
  html+=`<div class="panel"><div class="panel-title">Hours summary</div><div style="font-size:11px;color:var(--muted);font-weight:600;margin:-6px 0 10px">Click a name to focus their schedule, or use Add to manually place extra available hours.</div>${scheduleSettings.weeklyBudget?`<div class="gap-item" style="background:var(--cream);color:var(--ink);border-color:var(--line);margin-bottom:10px">Total scheduled: ${totalAssignedHours().toFixed(1)} / ${scheduleSettings.weeklyBudget.toFixed(1)}h weekly budget</div>`:''}<div class="hours-summary-card">`;
  tutors.forEach((t,i)=>{
    const c=colorFor(i);
    const pct=Math.min(100,Math.round(t.assignedHrs/t.hrs*100));
    const cls=t.assignedHrs>t.hrs?'over':t.assignedHrs<t.hrs*0.5?'low':'';
    const focusRowClass=focusedTutorId?(String(focusedTutorId)===String(t.id)?' focus-active':' focus-muted'):'';
    html+=`<div class="h-row hours-tutor-row${focusRowClass}" id="hours-row-${t.id}" onclick="focusTutor(${t.id})" title="Focus ${escapeHtml(t.name)}'s schedule">
      <div class="h-av" style="background:${c.bg};color:${c.text}">${initials(t.name)}</div>
      <div class="hours-tutor-info">
        <div class="h-name">${t.name}</div>
        <div class="hours-tutor-hours">${t.assignedHrs.toFixed(1)} / ${t.hrs}h</div>
      </div>
      <div class="hours-tutor-progress"><div class="h-bar-wrap"><div class="h-bar ${cls}" style="width:${pct}%"></div></div></div>
      <div class="hours-tutor-actions"><button class="btn btn-sm add-hours-btn" onclick="event.stopPropagation(); startAddHoursMode(${t.id})" title="Manually add more hours for ${escapeHtml(t.name)}"><i class="ti ti-circle-plus"></i> Add</button></div>
    </div>`;
  });
  html+='</div>';
  if(focusedTutorId && !addHoursMode){ html+='<button class="btn btn-sm" onclick="clearTutorFocus()" style="width:100%;justify-content:center;margin-top:10px"><i class="ti ti-x"></i> Exit focus mode</button>'; }
  html+='</div>';

  // Gaps
  const gaps=slots.filter(s=>!s.assigned.length);
  if(gaps.length){
    const visibleGaps = showAllGaps ? gaps : gaps.slice(0,6);
    html+=`<div class="panel" style="margin-top:12px"><div class="panel-title" style="color:var(--red)">Uncovered slots (${gaps.length})</div>`;
    visibleGaps.forEach(s=>{ html+=`<div class="gap-item">${s.day} ${fmtInterval(s.time)}</div>`; });
    if(gaps.length>6){
      html+=`<button class="btn btn-sm" onclick="toggleGaps()" style="width:100%;justify-content:center;margin-top:6px">
        <i class="ti ${showAllGaps?'ti-chevron-up':'ti-chevron-down'}"></i>
        ${showAllGaps?'Show fewer':`Show all ${gaps.length} uncovered slots`}
      </button>`;
    }
    html+='</div>';
  } else {
    html+='<div class="status-box ok" style="margin-top:12px"><i class="ti ti-check"></i> All slots covered!</div>';
  }

  html+='</div></div>';

  document.getElementById('gen-out').innerHTML=html;
  updateUndoButton();
}


// ── Export schedule ──────────────────────────────────────
function scheduleExportRows(){
  const rows = [];
  const header = ['Time', ...ALL_DAYS];
  rows.push(header);

  TIMES_MF.forEach(time => {
    const row = [fmtInterval(time)];
    ALL_DAYS.forEach(day => {
      if(day==='Friday' && !TIMES_FRI.includes(time)){
        row.push('');
        return;
      }

      const slot = getSlot(day,time);
      if(!slot || !slot.assigned.length){
        row.push('');
        return;
      }

      const names = slot.assigned.map(t => {
        const mode = t.mode==='ol' ? 'OL' : 'OC';
        return `${t.name} ${mode}`;
      }).join(' | ');

      row.push(names);
    });
    rows.push(row);
  });

  return rows;
}

function exportScheduleExcel(){
  if(!currentSlots.length){
    showToast('Generate a schedule first before downloading Excel.', 'warn');
    return;
  }

  const rows = scheduleExportRows();
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="application-name" content="CAS ESL Schedule Builder">
        <meta name="author" content="Hirbod Jabbarnezhad">
        <meta name="creator" content="Hirbod Jabbarnezhad">
        <meta name="software" content="CAS ESL Schedule Builder">
        <meta name="version" content="1.0">
        <meta name="copyright" content="Copyright (c) 2026 Hirbod Jabbarnezhad">
        ${metadataComment()}
        <style>
          table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px}
          th{background:#b03a2e;color:#fff;font-weight:bold}
          th,td{border:1px solid #999;padding:8px;vertical-align:top;min-width:130px}
          td:first-child,th:first-child{min-width:90px;font-weight:bold;background:#f3ece8;color:#1e1614}
        </style>
      </head>
      <body>
        ${metadataHiddenBlock()}
        <h2>CAS ESL Weekly Schedule</h2>
        <p><strong>Schedule period:</strong> ${esc(schedulePeriodText())}${scheduleSettings.weeklyBudget?` · <strong>Weekly budget:</strong> ${scheduleSettings.weeklyBudget.toFixed(1)} hours`:''}</p>
        <table>
  `;

  rows.forEach((row, idx) => {
    html += '<tr>';
    row.forEach(cell => {
      html += idx === 0 ? `<th>${esc(cell)}</th>` : `<td>${esc(cell)}</td>`;
    });
    html += '</tr>';
  });

  html += '</table></body></html>';

  const blob = new Blob([html], {type:'application/vnd.ms-excel'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cas-esl-weekly-schedule.xls';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Excel schedule downloaded.', 'ok');
}

function exportSchedulePDF(){
  if(!currentSlots.length){
    showToast('Generate a schedule first before downloading PDF.', 'warn');
    return;
  }

  const rows = scheduleExportRows();
  const metadata = appMetadata();

  // Use jsPDF instead of window.print(). Browser-print PDFs are made by Chrome/Skia
  // and usually ignore custom Author/Creator fields. jsPDF lets us write real PDF metadata.
  const jspdfNamespace = window.jspdf || window.jsPDF;
  const JsPDFConstructor = jspdfNamespace && (jspdfNamespace.jsPDF || jspdfNamespace);

  if(!JsPDFConstructor){
    showToast('PDF library is still loading. Please try again in a few seconds.', 'warn');
    return;
  }

  const doc = new JsPDFConstructor({
    orientation:'landscape',
    unit:'pt',
    format:'letter'
  });

  doc.setProperties({
    title:'CAS ESL Weekly Schedule',
    subject:'ESL Tutor Scheduling',
    author:metadata.createdBy,
    keywords:`${metadata.software}, ${metadata.createdBy}, Pierce College, CAS, ESL, version ${metadata.version}, ${metadata.copyright}`,
    creator:metadata.software
  });

  // Extra embedded authorship note. This is invisible on the page but searchable in the PDF text layer.
  doc.setFontSize(1);
  doc.setTextColor(255,255,255);
  doc.text(`Metadata: ${JSON.stringify(metadata)}`, 8, 8);
  doc.setTextColor(30,22,20);

  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.text('CAS ESL Weekly Schedule', 40, 42);

  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.text('Pierce College · Center for Academic Success', 40, 58);
  doc.text(`${metadata.software} v${metadata.version}`, 40, 73);
  doc.text(`Period: ${schedulePeriodText()}${scheduleSettings.weeklyBudget?` · Weekly budget: ${scheduleSettings.weeklyBudget.toFixed(1)} hours`:''}`, 40, 88);

  const head = [rows[0]];
  const body = rows.slice(1);

  doc.autoTable({
    head,
    body,
    startY:104,
    theme:'grid',
    styles:{
      font:'helvetica',
      fontSize:7,
      cellPadding:4,
      overflow:'linebreak',
      valign:'top',
      lineColor:[180,180,180],
      lineWidth:0.6
    },
    headStyles:{
      fillColor:[176,58,46],
      textColor:[255,255,255],
      fontStyle:'bold',
      halign:'center'
    },
    columnStyles:{
      0:{
        cellWidth:70,
        fontStyle:'bold',
        fillColor:[243,236,232],
        textColor:[30,22,20]
      }
    },
    margin:{top:104,right:28,bottom:34,left:28},
    didDrawPage:function(data){
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120,105,101);
      doc.text(`${metadata.software} · Created by ${metadata.createdBy}`, data.settings.margin.left, doc.internal.pageSize.height - 16);
      doc.text(`Page ${data.pageNumber} of ${pageCount}`, doc.internal.pageSize.width - 80, doc.internal.pageSize.height - 16);
      doc.setTextColor(30,22,20);
    }
  });

  doc.save('CAS ESL Weekly Schedule.pdf');
  showToast('PDF schedule downloaded with embedded author metadata.', 'ok');
}


window.addEventListener('error', function(e){
  const btn=document.getElementById('ai-btn');
  const body=document.getElementById('ai-body');
  if(btn && btn.disabled && btn.textContent.includes('Analyzing')){
    btn.disabled=false;
    btn.innerHTML='<i class="ti ti-chart-dots"></i> Analyze schedule';
    if(body) body.innerHTML='<div class="analysis-note">The analysis stopped because of a script error. Please try again after refreshing the page.</div>';
  }
});

// ── Local smart schedule analysis ─────────────────────────

function clampScore(value){
  return Math.max(0, Math.min(100, Math.round(value)));
}

function calculateScheduleQuality(slots=currentSlots){
  const totalSlots = slots.length || 1;
  const coveredSlots = slots.filter(s=>s.assigned && s.assigned.length>0);
  const uncoveredSlots = slots.filter(s=>!s.assigned || s.assigned.length===0);
  const thinCoverage = slots.filter(s=>s.assigned && s.assigned.length>0 && s.assigned.length<2);

  const coverageScore = clampScore((coveredSlots.length / totalSlots) * 100);

  const totalDesired = tutors.reduce((sum,t)=>sum+(Number(t.hrs)||0),0) || 1;
  const totalAssigned = tutors.reduce((sum,t)=>sum+(Number(t.assignedHrs)||0),0);
  const balancedAssignmentsScore = clampScore(Math.min(totalAssigned / totalDesired, 1) * 100);

  const activeTutors = tutors.filter(t=>Number(t.hrs)>0);
  let fairnessScore = 100;
  if(activeTutors.length > 1){
    const ratios = activeTutors.map(t=>{
      const target = Number(t.hrs)||1;
      return Math.min((Number(t.assignedHrs)||0) / target, 1.25);
    });
    const avg = ratios.reduce((a,b)=>a+b,0) / ratios.length;
    const variance = ratios.reduce((sum,r)=>sum+Math.pow(r-avg,2),0) / ratios.length;
    const std = Math.sqrt(variance);
    fairnessScore = clampScore(100 - (std * 85));
  }

  const maxRunSlots = MAX_CONSECUTIVE_WORK_SLOTS || 8;
  let longestRun = 0;
  ALL_DAYS.forEach(day=>{
    const times = timesForDay(day);
    tutors.forEach(tutor=>{
      let run = 0;
      times.forEach(time=>{
        const slot = slots.find(s=>s.day===day && s.time===time);
        if(slot && slot.assigned && slot.assigned.some(a=>String(a.id)===String(tutor.id))){
          run++;
          longestRun = Math.max(longestRun, run);
        } else {
          run = 0;
        }
      });
    });
  });
  const consecutiveScore = clampScore(longestRun <= maxRunSlots ? 100 : 100 - ((longestRun - maxRunSlots) * 18));

  const uncoveredScore = clampScore(100 - ((uncoveredSlots.length / totalSlots) * 100));
  const backupPenalty = Math.min(20, Math.round((thinCoverage.length / totalSlots) * 35));

  const overall = clampScore(
    coverageScore * 0.30 +
    fairnessScore * 0.20 +
    consecutiveScore * 0.15 +
    balancedAssignmentsScore * 0.20 +
    uncoveredScore * 0.15 -
    backupPenalty
  );

  let label = 'Needs work';
  if(overall >= 90) label = 'Excellent';
  else if(overall >= 80) label = 'Strong';
  else if(overall >= 70) label = 'Good';
  else if(overall >= 60) label = 'Needs review';

  return {
    overall,
    label,
    coverageScore,
    fairnessScore,
    consecutiveScore,
    balancedAssignmentsScore,
    uncoveredScore,
    thinCoverageCount: thinCoverage.length,
    uncoveredCount: uncoveredSlots.length,
    longestRunSlots: longestRun
  };
}



let qualityTooltipTimer = null;

function ensureQualityTooltip(){
  let tip = document.getElementById('quality-help-tip');
  if(!tip){
    tip = document.createElement('div');
    tip.id = 'quality-help-tip';
    tip.className = 'quality-help-tip';
    document.body.appendChild(tip);
  }
  return tip;
}

function positionQualityTooltip(event){
  const tip = ensureQualityTooltip();
  const pad = 14;
  let x = event.clientX + pad;
  let y = event.clientY + pad;

  const rect = tip.getBoundingClientRect();
  if(x + rect.width > window.innerWidth - 10) x = event.clientX - rect.width - pad;
  if(y + rect.height > window.innerHeight - 10) y = event.clientY - rect.height - pad;

  tip.style.left = Math.max(10, x) + 'px';
  tip.style.top = Math.max(10, y) + 'px';
}

function showQualityTooltip(event, el){
  const tip = ensureQualityTooltip();
  const title = el.dataset.tipTitle || '';
  const text = el.dataset.tipText || '';

  tip.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(text)}`;
  positionQualityTooltip(event);

  clearTimeout(qualityTooltipTimer);
  qualityTooltipTimer = setTimeout(()=>{
    tip.classList.add('show');
  }, 600);
}

function moveQualityTooltip(event){
  const tip = document.getElementById('quality-help-tip');
  if(tip) positionQualityTooltip(event);
}

function hideQualityTooltip(){
  clearTimeout(qualityTooltipTimer);
  const tip = document.getElementById('quality-help-tip');
  if(tip) tip.classList.remove('show');
}


function runAIOptimize(){
  const btn=document.getElementById('ai-btn');
  const outPanel=document.getElementById('ai-out');
  const body=document.getElementById('ai-body');
  if(!btn||!outPanel||!body) return;

  if(!currentSlots.length){
    showToast('Generate a schedule first before analyzing it.', 'warn');
    return;
  }

  btn.disabled=true;
  btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i> Analyzing…';
  analysisPanelOpen=true;
  outPanel.style.display='block';
  body.innerHTML='<div class="ai-loading"><div class="dot-pulse"></div> Running local smart schedule analysis…</div>';

  const slotTimesForDay = day => day==='Friday' ? TIMES_FRI : TIMES_MF;
  const slotLabel = s => `${s.day} ${fmtInterval(s.time)}`;
  const availabilityCount = tutor => Object.values(tutor.avail).filter(v=>v===true).length;
  const percentAssigned = tutor => tutor.hrs ? tutor.assignedHrs / tutor.hrs : 0;
  const esc = escapeHtml;

  const totalDesired=tutors.reduce((sum,t)=>sum+t.hrs,0);
  const totalAssigned=tutors.reduce((sum,t)=>sum+t.assignedHrs,0);
  const coveredSlots=currentSlots.filter(s=>s.assigned.length>0);
  const uncoveredSlots=currentSlots.filter(s=>s.assigned.length===0);
  const thinCoverage=currentSlots.filter(s=>s.assigned.length>0 && s.assigned.length<2);
  const quality=calculateScheduleQuality(currentSlots);

  const underAssigned=tutors
    .filter(t=>t.assignedHrs < t.hrs*0.75)
    .sort((a,b)=>(percentAssigned(a)-percentAssigned(b)) || (a.assignedHrs-b.assignedHrs));

  const veryUnderAssigned=tutors
    .filter(t=>t.assignedHrs < Math.min(2, t.hrs*0.35))
    .sort((a,b)=>a.assignedHrs-b.assignedHrs);

  const overAssigned=tutors
    .filter(t=>t.assignedHrs > t.hrs)
    .sort((a,b)=>b.assignedHrs-a.assignedHrs);

  const lowAvailability=tutors
    .map(t=>({t, count:availabilityCount(t)}))
    .filter(x=>x.count<10)
    .sort((a,b)=>a.count-b.count);

  const dayStats=ALL_DAYS.map(day=>{
    const daySlots=currentSlots.filter(s=>s.day===day);
    const assigned=daySlots.reduce((sum,s)=>sum+s.assigned.length,0);
    const uncovered=daySlots.filter(s=>s.assigned.length===0).length;
    const thin=daySlots.filter(s=>s.assigned.length>0 && s.assigned.length<2).length;
    return {day, assigned, uncovered, thin, total:daySlots.length};
  });

  const weakestDays=dayStats
    .filter(d=>d.uncovered>0 || d.thin>0)
    .sort((a,b)=>(b.uncovered-a.uncovered) || (b.thin-a.thin))
    .slice(0,3);

  // Detect long consecutive shifts per tutor/day.
  const longRuns=[];
  tutors.forEach(tutor=>{
    ALL_DAYS.forEach(day=>{
      const times=slotTimesForDay(day);
      let runStart=null, runLen=0;
      const flush=()=>{
        if(runStart!==null && runLen>=7){
          const startIndex=times.indexOf(runStart);
          const endTime=times[startIndex+runLen] || 'end';
          longRuns.push({tutor, day, start:runStart, end:endTime, hours:runLen*0.5});
        }
        runStart=null;
        runLen=0;
      };
      times.forEach(time=>{
        const slot=getSlot(day,time);
        const assigned=slot && slot.assigned.some(x=>String(x.id)===String(tutor.id));
        if(assigned){
          if(runStart===null) runStart=time;
          runLen++;
        } else {
          flush();
        }
      });
      flush();
    });
  });
  longRuns.sort((a,b)=>b.hours-a.hours);

  // Concrete gap suggestions: who is available for a currently uncovered slot?
  const gapSuggestions=[];
  uncoveredSlots.slice(0,14).forEach(slot=>{
    const available=tutors
      .filter(t=>t.avail[slot.day+'-'+slot.time]===true)
      .sort((a,b)=>(percentAssigned(a)-percentAssigned(b)) || (a.assignedHrs-b.assignedHrs));

    const underAvailable=available.filter(t=>t.assignedHrs<t.hrs);
    const best=(underAvailable.length?underAvailable:available).slice(0,3);
    gapSuggestions.push({slot, best, hasAvailable:available.length>0, onlyMaxed:available.length>0 && !underAvailable.length});
  });

  const noAvailableGaps=gapSuggestions.filter(g=>!g.hasAvailable);
  const possibleFitGaps=gapSuggestions.filter(g=>g.hasAvailable && !g.onlyMaxed);
  const maxedGaps=gapSuggestions.filter(g=>g.onlyMaxed);

  // Simple swap/move suggestions.
  const moveSuggestions=[];
  currentSlots.forEach(slot=>{
    if(moveSuggestions.length>=8) return;
    if(slot.assigned.length===0) return;

    const underCandidates=tutors
      .filter(t=>t.avail[slot.day+'-'+slot.time]===true && !slot.assigned.some(a=>String(a.id)===String(t.id)) && t.assignedHrs<t.hrs*0.75)
      .sort((a,b)=>percentAssigned(a)-percentAssigned(b));

    const heavyAssigned=slot.assigned
      .filter(t=>t.assignedHrs>=t.hrs*0.95)
      .sort((a,b)=>b.assignedHrs-a.assignedHrs);

    if(underCandidates.length && heavyAssigned.length){
      moveSuggestions.push({slot, add:underCandidates[0], reduce:heavyAssigned[0]});
    }
  });

  const textLines=[];
  textLines.push('Smart Schedule Analysis');
  textLines.push('');
  textLines.push(`Schedule Quality: ${quality.overall}% (${quality.label}).`);
  textLines.push(`Quality factors: coverage ${quality.coverageScore}%, fairness ${quality.fairnessScore}%, consecutive-hours comfort ${quality.consecutiveScore}%, balanced assignments ${quality.balancedAssignmentsScore}%, uncovered-slots control ${quality.uncoveredScore}%.`);
  textLines.push('');
  textLines.push(`Overall: ${totalAssigned.toFixed(1)} of ${totalDesired} requested tutor-hours are scheduled.`);
  textLines.push(`Coverage: ${coveredSlots.length} covered slots, ${uncoveredSlots.length} uncovered slots, and ${thinCoverage.length} thinly covered slots with only 1 tutor.`);
  textLines.push('');

  const mainFindings=[];
  mainFindings.push(`Schedule quality score: ${quality.overall}% (${quality.label}). This combines coverage, fairness, break balance, balanced assignments, and uncovered slots.`);
  if(uncoveredSlots.length===0 && thinCoverage.length===0){
    mainFindings.push('Strong coverage: every open time slot has tutor coverage, and no slot is limited to only one tutor.');
  } else {
    if(uncoveredSlots.length) mainFindings.push(`${uncoveredSlots.length} slots are completely uncovered. First few: ${uncoveredSlots.slice(0,6).map(slotLabel).join('; ')}${uncoveredSlots.length>6?'…':''}`);
    if(thinCoverage.length) mainFindings.push(`${thinCoverage.length} slots have only one tutor. Review these if backup coverage is important.`);
  }
  if(weakestDays.length) mainFindings.push(`Weakest day(s): ${weakestDays.map(d=>`${d.day} (${d.uncovered} uncovered, ${d.thin} thin)`).join('; ')}.`);
  mainFindings.push(overAssigned.length ? `Over-assigned tutor(s): ${overAssigned.map(t=>`${t.name} ${t.assignedHrs.toFixed(1)}/${t.hrs}h`).join('; ')}.` : 'No tutor is over their requested weekly hours.');

  textLines.push('1) Main findings');
  mainFindings.forEach(x=>textLines.push(`• ${x}`));
  textLines.push('');

  textLines.push('2) Tutor balance');
  if(underAssigned.length){
    underAssigned.slice(0,8).forEach(t=>textLines.push(`• ${t.name}: ${t.assignedHrs.toFixed(1)}/${t.hrs}h assigned (${Math.round(percentAssigned(t)*100)}%). Availability slots marked: ${availabilityCount(t)}.`));
  } else {
    textLines.push('• Tutor hours look balanced. Everyone is assigned at least about 75% of requested hours.');
  }
  if(veryUnderAssigned.length) textLines.push(`• Possible incomplete availability: ${veryUnderAssigned.map(t=>t.name).join(', ')}. These tutors received very low hours and may need to submit more available times.`);
  if(lowAvailability.length) textLines.push(`• Low availability forms to double-check: ${lowAvailability.slice(0,6).map(x=>`${x.t.name} (${x.count} slots)`).join('; ')}.`);
  textLines.push('');

  textLines.push('3) Coverage suggestions');
  if(gapSuggestions.length){
    if(noAvailableGaps.length){
      textLines.push('• The following slots have no tutor marked available. Ask tutors for more availability during these times:');
      noAvailableGaps.forEach(g=>textLines.push(`  - ${slotLabel(g.slot)}`));
    }
    if(possibleFitGaps.length){
      textLines.push('• Possible fits for uncovered slots:');
      possibleFitGaps.forEach(g=>textLines.push(`  - ${slotLabel(g.slot)}: ${g.best.map(t=>`${t.name} (${t.assignedHrs.toFixed(1)}/${t.hrs}h)`).join(', ')}`));
    }
    if(maxedGaps.length){
      textLines.push('• Available tutors exist but are already at/near requested hours:');
      maxedGaps.forEach(g=>textLines.push(`  - ${slotLabel(g.slot)}: ${g.best.map(t=>t.name).join(', ')}`));
    }
  } else {
    textLines.push('• No uncovered slots. Use the thin coverage list only if stronger backup coverage is needed.');
  }
  textLines.push('');

  textLines.push('4) Workload comfort check');
  if(longRuns.length){
    longRuns.slice(0,6).forEach(r=>textLines.push(`• ${r.tutor.name} has a long continuous block on ${r.day}: ${fmtTime(r.start)}–${r.end==='end'?'end':fmtTime(r.end)} (${r.hours.toFixed(1)}h). Consider a break or split if needed.`));
  } else {
    textLines.push('• No very long continuous shifts detected.');
  }
  textLines.push('');

  const nextSteps=[];
  if(uncoveredSlots.length) nextSteps.push('Review uncovered slots first, especially ones with no available tutors marked.');
  if(underAssigned.length) nextSteps.push('Ask the most under-assigned tutors if they can add more availability or take backup shifts.');
  if(moveSuggestions.length){
    const m=moveSuggestions[0];
    nextSteps.push(`Try one balancing move: consider using ${m.add.name} at ${slotLabel(m.slot)} instead of relying heavily on ${m.reduce.name}.`);
  }
  if(longRuns.length) nextSteps.push('Check long continuous shifts and decide whether those tutors need a break.');
  nextSteps.push('After manual edits, click Re-analyze schedule to re-check balance and coverage.');

  textLines.push('5) Suggested next steps');
  nextSteps.slice(0,5).forEach((step,i)=>textLines.push(`${i+1}. ${step}`));

  const li = arr => arr.map(x=>`<li>${esc(x)}</li>`).join('');
  const compactLi = arr => arr.map(x=>`<li>${esc(x)}</li>`).join('');

  const tutorBalanceHTML = underAssigned.length
    ? `<ul class="analysis-list">${underAssigned.slice(0,8).map(t=>`<li><strong>${esc(t.name)}</strong>: ${t.assignedHrs.toFixed(1)}/${t.hrs}h assigned (${Math.round(percentAssigned(t)*100)}%). Availability slots marked: ${availabilityCount(t)}.</li>`).join('')}</ul>`
    : `<div class="analysis-empty">Tutor hours look balanced. Everyone is assigned at least about 75% of requested hours.</div>`;

  const coverageHTML = gapSuggestions.length ? `
    ${noAvailableGaps.length ? `<div class="analysis-note">The slots below have no tutor marked available. Ask tutors for more availability during these times.</div><ul class="analysis-list compact">${compactLi(noAvailableGaps.map(g=>slotLabel(g.slot)))}</ul>` : ''}
    ${possibleFitGaps.length ? `<p><strong>Possible fits for uncovered slots:</strong></p><ul class="analysis-list">${possibleFitGaps.map(g=>`<li><strong>${esc(slotLabel(g.slot))}</strong>: ${g.best.map(t=>`${esc(t.name)} (${t.assignedHrs.toFixed(1)}/${t.hrs}h)`).join(', ')}</li>`).join('')}</ul>` : ''}
    ${maxedGaps.length ? `<p><strong>Available tutors exist but are already at/near requested hours:</strong></p><ul class="analysis-list compact">${maxedGaps.map(g=>`<li>${esc(slotLabel(g.slot))}: ${g.best.map(t=>esc(t.name)).join(', ')}</li>`).join('')}</ul>` : ''}
  ` : `<div class="analysis-empty">No uncovered slots. Use the thin coverage list only if stronger backup coverage is needed.</div>`;

  const workloadHTML = longRuns.length
    ? `<ul class="analysis-list">${longRuns.slice(0,6).map(r=>`<li><strong>${esc(r.tutor.name)}</strong> has a long continuous block on ${r.day}: ${fmtTime(r.start)}–${r.end==='end'?'end':fmtTime(r.end)} (${r.hours.toFixed(1)}h). Consider a break or split if needed.</li>`).join('')}</ul>`
    : `<div class="analysis-empty">No very long continuous shifts detected.</div>`;

  const htmlReport=`
    <div class="quality-score-card">
      <div class="quality-score-top">
        <div class="quality-score-number">${quality.overall}%</div>
        <div>
          <div class="quality-score-label">Schedule Quality: ${esc(quality.label)}</div>
          <div class="quality-score-sub">Based on coverage, fairness, consecutive hours, balanced assignments, and uncovered slots.</div>
        </div>
      </div>
      <div class="quality-score-bars">
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Coverage" data-tip-text="Measures how many schedule slots are successfully covered by at least one tutor.">
        <strong>${quality.coverageScore}%</strong>
        <span>Coverage</span>
      </div>
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Fairness" data-tip-text="Checks whether tutor hours are distributed evenly instead of overloading only a few people.">
        <strong>${quality.fairnessScore}%</strong>
        <span>Fairness</span>
      </div>
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Break Balance" data-tip-text="Rewards schedules that avoid excessively long continuous work blocks without breaks.">
        <strong>${quality.consecutiveScore}%</strong>
        <span>Break balance</span>
      </div>
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Balance" data-tip-text="Measures how closely assigned hours match each tutor’s requested weekly hours.">
        <strong>${quality.balancedAssignmentsScore}%</strong>
        <span>Balance</span>
      </div>
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Uncovered Slots" data-tip-text="Penalizes schedules that leave tutoring slots empty or without backup coverage.">
        <strong>${quality.uncoveredScore}%</strong>
        <span>Uncovered</span>
      </div>
      </div>
    </div>

    <div class="analysis-summary">
      <div class="analysis-metric"><strong>${totalAssigned.toFixed(1)} / ${totalDesired}</strong><span>Requested hours scheduled</span></div>
      <div class="analysis-metric"><strong>${coveredSlots.length}</strong><span>Covered slots</span></div>
      <div class="analysis-metric"><strong>${uncoveredSlots.length}</strong><span>Uncovered slots</span></div>
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-search"></i> 1) Main findings</h4>
      <ul class="analysis-list">${li(mainFindings)}</ul>
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-scale"></i> 2) Tutor balance</h4>
      ${tutorBalanceHTML}
      ${veryUnderAssigned.length ? `<p><strong>Possible incomplete availability:</strong> ${esc(veryUnderAssigned.map(t=>t.name).join(', '))}. These tutors received very low hours and may need to submit more available times.</p>` : ''}
      ${lowAvailability.length ? `<p><strong>Low availability forms to double-check:</strong> ${esc(lowAvailability.slice(0,6).map(x=>`${x.t.name} (${x.count} slots)`).join('; '))}.</p>` : ''}
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-calendar-exclamation"></i> 3) Coverage suggestions</h4>
      ${coverageHTML}
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-clock-pause"></i> 4) Workload comfort check</h4>
      ${workloadHTML}
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-list-check"></i> 5) Suggested next steps</h4>
      <ul class="analysis-list">${nextSteps.slice(0,5).map((step,i)=>`<li><strong>${i+1}.</strong> ${esc(step)}</li>`).join('')}</ul>
    </div>
  `;

  const report=textLines.join('\n');

  setTimeout(()=>{
    currentAnalysisReportText=report;
    currentAnalysisReportHTML=htmlReport;
    body.innerHTML=htmlReport;
    btn.disabled=false;
    btn.innerHTML='<i class="ti ti-chart-dots"></i> Re-analyze schedule';
  },250);
}

function closeAnalysisPanel(){
  analysisPanelOpen=false;
  const outPanel=document.getElementById('ai-out');
  if(outPanel) outPanel.style.display='none';
}

function copyAnalysisReport(){
  if(!currentAnalysisReportText){
    showToast('Run the analysis first, then copy it.', 'warn');
    return;
  }

  const fallbackCopy=()=>{
    const ta=document.createElement('textarea');
    ta.value=currentAnalysisReportText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Analysis copied.', 'ok', 2200);
  };

  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(currentAnalysisReportText)
      .then(()=>showToast('Analysis copied.', 'ok', 2200))
      .catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

// ── Spin keyframe for loader ─────────────────────────────
const style=document.createElement('style');
style.textContent='@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(style);

// ── Init ─────────────────────────────────────────────────
function formatPhone(input){
  const digits = input.value.replace(/\D/g,'');
  if(!digits) return;
  if(digits.length === 10){
    input.value = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  } else if(digits.length === 11 && digits[0]==='1'){
    input.value = `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  // if neither, leave as-is so user can correct it
}

buildAvailTable();
renderTutors();
applyScheduleSettingsToInputs();
updateScrollTopButton('upload');
updateUndoButton();