// ── Utilities, Schedule Settings, Undo, Save/Load, Shift Interaction ───
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
