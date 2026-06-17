// ══════════════════════════════════════════════════════════════
//  cet.js — Course Embedded Tutor (CET) feature
//  CAS ESL Schedule Builder · Hirbod Jabbarnezhad
// ══════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────

function cetColorFor(tutorId){
  const idx = tutors.findIndex(t => t.id === tutorId);
  return idx >= 0 ? colorFor(idx) : {bg:'#f3ece8', text:'#7a6965', border:'#c8bab5'};
}

// Parse "HH:MM" → total minutes since midnight
function timeToMins(t){
  if(!t) return 0;
  const [h,m] = t.split(':').map(Number);
  return h*60 + (m||0);
}

// CET assignment now has NO hard availability restriction.
// We still calculate overlap so the app can warn the coordinator before assigning
// a tutor whose availability does not fully cover the class meeting time.
function minsToTimeLabel(totalMins){
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2,'0')}${suffix}`;
}

function formatMinsAsHours(mins){
  if(!mins) return '0h';
  const hrs = mins / 60;
  return `${hrs.toFixed(mins % 60 ? 1 : 0)}h`;
}

function slotKeyFor(day, mins){
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${day}-${hh}:${mm === 0 ? '00' : mm}`;
}

// Returns the tutor's class-time coverage details for warning messages.
// This does NOT block assignment anymore.
function tutorClassCoverageInfo(tutor, cls){
  if(!cls.days || !cls.days.length){
    return {
      fullCoverage:false,
      hasAnyOverlap:false,
      minCoverageMins:0,
      classMins:0,
      dayCoverages:[],
      label:'No class days',
      warning:'This class has no selected days, so availability could not be checked.'
    };
  }

  // Async classes have no fixed class-time conflict.
  if(cls.modality === 'async'){
    return {
      fullCoverage:true,
      hasAnyOverlap:true,
      minCoverageMins:0,
      classMins:0,
      dayCoverages:[],
      label:'Async class',
      warning:''
    };
  }

  const startMins = timeToMins(cls.startTime);
  const endMins   = timeToMins(cls.endTime);

  if(!cls.startTime || !cls.endTime || endMins <= startMins){
    return {
      fullCoverage:false,
      hasAnyOverlap:false,
      minCoverageMins:0,
      classMins:0,
      dayCoverages:[],
      label:'Missing class time',
      warning:'This class is missing a valid start/end time, so availability could not be checked.'
    };
  }

  const classMins = endMins - startMins;

  const dayCoverages = cls.days.map(day => {
    let bestStart = null;
    let currentStart = null;
    let currentMins = 0;
    let bestMins = 0;
    let totalOverlapMins = 0;
    let availableSlots = 0;
    let totalSlots = 0;

    for(let m = startMins; m < endMins; m += 30){
      totalSlots++;
      const isAvailable = tutor.avail && tutor.avail[slotKeyFor(day, m)] === true;

      if(isAvailable){
        availableSlots++;
        totalOverlapMins += 30;
        if(currentStart === null) currentStart = m;
        currentMins += 30;

        if(currentMins > bestMins){
          bestMins = currentMins;
          bestStart = currentStart;
        }
      } else {
        currentStart = null;
        currentMins = 0;
      }
    }

    return {
      day,
      coverageMins: bestMins,
      totalOverlapMins,
      fullCoverage: totalSlots > 0 && availableSlots === totalSlots,
      startMins: bestStart,
      endMins: bestStart === null ? null : bestStart + bestMins
    };
  });

  const minCoverageMins = Math.min(...dayCoverages.map(d => d.coverageMins));
  const minTotalOverlapMins = Math.min(...dayCoverages.map(d => d.totalOverlapMins));
  const fullCoverage = dayCoverages.every(d => d.fullCoverage);
  const hasAnyOverlap = dayCoverages.some(d => d.totalOverlapMins > 0);

  const label = fullCoverage
    ? 'Full class coverage'
    : hasAnyOverlap
      ? `${formatMinsAsHours(minTotalOverlapMins)}+ overlap`
      : 'No overlap';

  let warning = '';
  if(!fullCoverage){
    const detail = dayCoverages.map(d => {
      const bestBlock = d.startMins === null
        ? 'no continuous block'
        : `${minsToTimeLabel(d.startMins)}–${minsToTimeLabel(d.endMins)}`;
      return `${d.day}: ${formatMinsAsHours(d.totalOverlapMins)} overlap (${bestBlock})`;
    }).join('\n');

    warning = `${tutor.name} does not fully cover ${cls.title || 'this class'} (${fmtTime(cls.startTime)}–${fmtTime(cls.endTime)}).\n\n${detail}\n\nYou can still assign them if this is intentional.`;
  }

  return { fullCoverage, hasAnyOverlap, minCoverageMins, classMins, dayCoverages, label, warning };
}

// CET assignments are intentionally unrestricted by class-time availability.
// This keeps every tutor selectable; assignment will show a warning if coverage is partial or missing.
function tutorAvailableForClass(tutor, cls){
  return true;
}

// Net hours a tutor has left after existing CET assignments
function tutorCETRemainingHrs(tutor){
  const cetAssigned = cetClasses
    .filter(c => c.assignedTutorId === tutor.id)
    .reduce((s, c) => s + (c.hrsPerWeek || 0), 0);
  return tutor.hrs - cetAssigned;
}

// Total CET hours assigned to a tutor this semester
function tutorCETHrs(tutor){
  return cetClasses
    .filter(c => c.assignedTutorId === tutor.id)
    .reduce((s, c) => s + (c.hrsPerWeek || 0), 0);
}

function classContactHours(cls){
  const total = Number(cls.hrsPerWeek || 0);
  const hasStudyGroup = cls.requiresStudyGroup !== false;
  return Math.max(0, total - (hasStudyGroup ? 1 : 0));
}

function studyGroupHours(cls){
  return cls.requiresStudyGroup === false ? 0 : 1;
}

function studyGroupLabel(cls){
  return cls.requiresStudyGroup === false ? 'No study group' : `+1h study group (${cls.studyGroupMode||'TBD'})`;
}

// ── Render main CET pane ─────────────────────────────────────

function renderCET(){
  const pane = document.getElementById('pane-cet');
  if(!pane) return;

  const hasClasses = cetClasses.length > 0;
  const hasTutors  = tutors.length > 0;

  let html = '';

  // ── Top toolbar ──
  html += `<div class="cet-toolbar">
    <div class="cet-toolbar-left">
      <h3 class="cet-heading">CET Assignments</h3>
      <span class="cet-count-badge" ${!hasClasses?'style="display:none"':''}>
        ${cetClasses.length} class${cetClasses.length!==1?'es':''}
        · ${cetClasses.filter(c=>c.assignedTutorId).length} assigned
      </span>
    </div>
    <div class="cet-toolbar-right">
      <button class="btn btn-red" onclick="openAddClassModal()">
        <i class="ti ti-plus"></i> Add class
      </button>
      <button class="btn btn-sm" onclick="openBulkAddModal()">
        <i class="ti ti-list-check"></i> Bulk add
      </button>
    </div>
  </div>`;

  // ── Empty state ──
  if(!hasClasses){
    html += `<div class="empty" style="margin-top:12px">
      <i class="ti ti-school" style="font-size:28px;display:block;margin-bottom:10px;opacity:.4"></i>
      No ESL classes yet. Click <strong>Add class</strong> to add one, or use <strong>Bulk add</strong> to paste a list quickly.
    </div>`;
    pane.innerHTML = html;
    return;
  }

  // ── Split layout: class list left, tutor sidebar right ──
  html += `<div class="cet-split">`;

  // ── Left: class list ──
  html += `<div class="cet-classes-col">`;

  // Group by whether they want a CET
  const wantsCET  = cetClasses.filter(c => c.wantsCET);
  const noCET     = cetClasses.filter(c => !c.wantsCET);

  if(wantsCET.length){
    html += `<div class="cet-group-label">Needs a CET (${wantsCET.length})</div>`;
    wantsCET.forEach(cls => { html += renderClassCard(cls); });
  }
  if(noCET.length){
    html += `<div class="cet-group-label" style="margin-top:14px">No CET requested (${noCET.length})</div>`;
    noCET.forEach(cls => { html += renderClassCard(cls); });
  }

  html += `</div>`; // end classes col

  // ── Right: tutor sidebar ──
  html += `<div class="cet-tutor-col">`;
  html += `<div class="panel">`;
  html += `<div class="panel-title" style="margin-bottom:12px">Tutors <span style="font-size:11px;font-weight:500;color:var(--muted)">· click to highlight compatible classes</span></div>`;

  if(!hasTutors){
    html += `<div style="font-size:12px;color:var(--muted);padding:8px 0">No tutors in roster yet.</div>`;
  } else {
    tutors.forEach((t, i) => {
      const c = colorFor(i);
      const cetHrs = tutorCETHrs(t);
      const remaining = t.hrs - cetHrs;
      const isFocused = cetFocusedTutorId === t.id;
      const pct = Math.min(100, Math.round(cetHrs / Math.max(t.hrs,1) * 100));
      const assignedCount = cetClasses.filter(c2=>c2.assignedTutorId===t.id).length;

      html += `<div class="cet-tutor-row ${isFocused?'cet-tutor-focused':''}"
        onclick="toggleCETFocus(${t.id})"
        style="--tc:${c.text};--tbg:${c.bg};--tb:${c.border}">
        <div class="h-av" style="background:${c.bg};color:${c.text};width:32px;height:32px;font-size:11px">${initials(t.name)}</div>
        <div style="flex:1;min-width:0">
          <div class="h-name" style="font-size:12px">${t.name}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
            ${cetHrs > 0
              ? `${cetHrs}h CET · ${remaining}h left for CAS`
              : `${t.hrs}h available · no CET yet`}
            ${assignedCount > 0 ? ` · ${assignedCount} class${assignedCount!==1?'es':''}` : ''}
          </div>
          ${cetHrs > 0 ? `<div class="h-bar-wrap" style="margin-top:4px"><div class="h-bar" style="width:${pct}%;background:${c.text}"></div></div>` : ''}
        </div>
        ${isFocused ? `<span class="cet-focused-badge">Focusing</span>` : ''}
      </div>`;
    });
  }

  if(cetFocusedTutorId){
    html += `<button class="btn btn-sm" style="width:100%;margin-top:10px;justify-content:center" onclick="clearCETFocus()">
      <i class="ti ti-x"></i> Exit focus mode
    </button>`;
  }

  html += `</div>`; // panel
  html += `</div>`; // tutor col
  html += `</div>`; // split

  pane.innerHTML = html;
}

// ── Render a single class card ────────────────────────────────

function renderClassCard(cls){
  const assigned = cls.assignedTutorId
    ? tutors.find(t => t.id === cls.assignedTutorId)
    : null;
  const c = assigned ? cetColorFor(cls.assignedTutorId) : null;

  // Focus mode: dim classes the focused tutor can't cover
  let dimmed = false;
  if(cetFocusedTutorId){
    const ft = tutors.find(t => t.id === cetFocusedTutorId);
    if(ft && !tutorAvailableForClass(ft, cls)){
      dimmed = true;
    }
  }

  // Highlight compatible unassigned classes when a tutor is focused
  let highlighted = false;
  if(cetFocusedTutorId && !cls.assignedTutorId && !dimmed){
    highlighted = true;
  }

  const modalityIcon = {
    'in-person': 'ti-building',
    'online-live': 'ti-video',
    'async': 'ti-clock-off'
  }[cls.modality] || 'ti-school';

  const modalityLabel = {
    'in-person': 'In-person',
    'online-live': 'Online – live Zoom',
    'async': 'Asynchronous'
  }[cls.modality] || cls.modality;

  const daysStr = cls.days && cls.days.length
    ? cls.days.map(d=>d.slice(0,3)).join(', ')
    : 'TBD';

  const timeStr = cls.startTime && cls.endTime
    ? `${fmtTime(cls.startTime)} – ${fmtTime(cls.endTime)}`
    : 'TBD';

  const classHrs = classContactHours(cls);
  const sgHrs = studyGroupHours(cls);

  let html = `<div class="cet-class-card ${dimmed?'cet-dimmed':''} ${highlighted?'cet-highlighted':''} ${!cls.wantsCET?'cet-no-cet':''}"
    data-cet-id="${cls.id}">

    <div class="cet-card-top">
      <div class="cet-card-title">
        <span class="cet-course-title">${cls.title||'Untitled class'}</span>
      </div>
      <div class="cet-card-actions">
        <button class="btn btn-sm" onclick="openEditClassModal(${cls.id})" title="Edit class"><i class="ti ti-pencil"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteCETClass(${cls.id})" title="Remove class"><i class="ti ti-trash"></i></button>
      </div>
    </div>

    <div class="cet-card-meta">
      <span class="cet-meta-chip"><i class="ti ti-user-tie"></i> ${cls.professor||'Prof. TBD'}</span>
      <span class="cet-meta-chip"><i class="ti ${modalityIcon}"></i> ${modalityLabel}</span>
      <span class="cet-meta-chip"><i class="ti ti-calendar"></i> ${daysStr}</span>
      ${cls.modality !== 'async' ? `<span class="cet-meta-chip"><i class="ti ti-clock"></i> ${timeStr}</span>` : ''}
      <span class="cet-meta-chip"><i class="ti ti-hours-24"></i> ${cls.hrsPerWeek||'?'}h/wk</span>
    </div>

    ${cls.hrsPerWeek > 0 ? `
    <div class="cet-hours-breakdown">
      <span class="cet-hrs-chip cet-hrs-class">${classHrs}h class contact</span>
      ${sgHrs > 0 ? `<span class="cet-hrs-chip cet-hrs-sg">${studyGroupLabel(cls)}</span>` : `<span class="cet-hrs-chip cet-hrs-no-sg">No study group</span>`}
    </div>` : ''}

    <div class="cet-assign-row">`;

  if(!cls.wantsCET){
    html += `<span style="font-size:11px;color:var(--muted);font-style:italic">No CET requested for this class.</span>`;
  } else if(assigned){
    html += `
      <div class="cet-assigned-pill" style="background:${c.bg};color:${c.text};border:1.5px solid ${c.border}">
        <div class="avatar" style="background:${c.bg};color:${c.text};width:22px;height:22px;font-size:9px;flex-shrink:0">${initials(assigned.name)}</div>
        ${assigned.name}
        <span class="cet-assigned-hrs">${cls.hrsPerWeek}h/wk</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="unassignCET(${cls.id})" title="Remove assignment" style="padding:5px 8px">
        <i class="ti ti-x"></i>
      </button>`;
  } else {
    // Show assign button — if a tutor is focused, pre-fill
    const focusedTutor = cetFocusedTutorId ? tutors.find(t=>t.id===cetFocusedTutorId) : null;
    const canAssignFocused = focusedTutor && highlighted;

    const eligibleTutors = tutors.filter(t => {
      const remaining = tutorCETRemainingHrs(t);
      const canHandle = remaining >= (cls.hrsPerWeek || 0);
      return canHandle;
    });

    html += `<div class="cet-assign-controls">`;

    if(!eligibleTutors.length){
      html += `<div class="cet-no-compatible">
        No tutor has enough remaining hours for this class.
      </div>`;
    } else {
      html += `<select class="cet-tutor-select" id="cet-select-${cls.id}" onchange="updateAssignBtn(${cls.id})">
        <option value="">— Select tutor for this course —</option>`;

      eligibleTutors.forEach((t) => {
        const remaining = tutorCETRemainingHrs(t);
        const coverage = tutorClassCoverageInfo(t, cls);
        html += `<option value="${t.id}" ${canAssignFocused&&t.id===focusedTutor.id?'selected':''}>${t.name} · ${remaining}h left · ${coverage.label}</option>`;
      });

      html += `</select>
        <button class="btn btn-red btn-sm" onclick="assignCET(${cls.id})" id="cet-assign-btn-${cls.id}">
          <i class="ti ti-check"></i> Assign
        </button>`;
    }

    html += `</div>`;
  }

  html += `</div></div>`; // assign-row + card

  return html;
}

// ── Focus mode ────────────────────────────────────────────────

function toggleCETFocus(tutorId){
  cetFocusedTutorId = cetFocusedTutorId === tutorId ? null : tutorId;
  renderCET();
}

function clearCETFocus(){
  cetFocusedTutorId = null;
  renderCET();
}

// ── Assign / unassign ─────────────────────────────────────────

function assignCET(classId){
  const cls = cetClasses.find(c => c.id === classId);
  if(!cls) return;

  const sel = document.getElementById(`cet-select-${classId}`);
  const tutorId = sel ? parseInt(sel.value) : null;
  if(!tutorId){ showToast('Select a tutor first.','warn'); return; }

  const tutor = tutors.find(t => t.id === tutorId);
  if(!tutor){ showToast('Tutor not found.','err'); return; }

  const remaining = tutorCETRemainingHrs(tutor);
  const needed = cls.hrsPerWeek || 0;

  if(remaining < needed){
    showToast(`${tutor.name} only has ${remaining}h left — this class needs ${needed}h/wk${cls.requiresStudyGroup===false?'':' including study group'}.`,'warn');
    return;
  }

  const coverage = tutorClassCoverageInfo(tutor, cls);
  if(cls.modality !== 'async' && !coverage.fullCoverage){
    showConfirm(
      'Assign with partial availability?',
      coverage.warning || `${tutor.name} does not fully cover this class time. You can still assign them if this is intentional.`,
      () => doAssignCET(cls, tutorId),
      'Assign anyway'
    );
    return;
  }

  doAssignCET(cls, tutorId);
}

function doAssignCET(cls, tutorId){
  cls.assignedTutorId = tutorId;
  showToast(`Assigned! ${cls.hrsPerWeek}h/wk deducted from their CAS hours (${classContactHours(cls)}h class/coursework${cls.requiresStudyGroup===false?'':' + 1h study group'}).`,'ok', 5000);
  renderCET();
}

function unassignCET(classId){
  const cls = cetClasses.find(c => c.id === classId);
  if(!cls) return;
  cls.assignedTutorId = null;
  renderCET();
}

// ── Update assign button state ────────────────────────────────
function updateAssignBtn(classId){
  // nothing needed — the assign button is always visible, validation is on click
}

// ── Add class modal ───────────────────────────────────────────

function openAddClassModal(prefill){
  _openClassModal(null, prefill || {});
}

function openEditClassModal(classId){
  const cls = cetClasses.find(c => c.id === classId);
  if(!cls) return;
  _openClassModal(classId, cls);
}

function _openClassModal(editId, data){
  const old = document.getElementById('cet-modal-overlay');
  if(old) old.remove();

  const isEdit = editId !== null;
  const days = data.days || [];

  const ov = document.createElement('div');
  ov.id = 'cet-modal-overlay';
  ov.className = 'cet-modal-overlay';

  ov.innerHTML = `
  <div class="cet-modal" role="dialog" aria-modal="true" aria-label="${isEdit?'Edit':'Add'} ESL class">
    <div class="cet-modal-header">
      <h3>${isEdit ? 'Edit class' : 'Add ESL class'}</h3>
      <button class="cet-modal-close" onclick="closeClassModal()" aria-label="Close">&times;</button>
    </div>
    <div class="cet-modal-body">

      <div class="form-grid two">
        <div class="fg">
          <span class="fl">Course title</span>
          <input id="cm-title" placeholder="e.g. ESL 4B" value="${data.title||data.courseCode||''}">
        </div>
      </div>

      <div class="form-grid two" style="margin-top:10px">
        <div class="fg">
          <span class="fl">Professor</span>
          <input id="cm-prof" placeholder="e.g. Prof. Martinez" value="${data.professor||''}">
        </div>
        <div class="fg">
          <span class="fl">Semester</span>
          <input id="cm-semester" placeholder="e.g. Fall 2026" value="${data.semester||''}">
        </div>
      </div>

      <div style="margin-top:12px">
        <span class="fl" style="display:block;margin-bottom:6px">Class days</span>
        <div class="cet-day-checkboxes">
          ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d=>`
            <label class="cet-day-label">
              <input type="checkbox" name="cm-days" value="${d}" ${days.includes(d)?'checked':''}> ${d.slice(0,3)}
            </label>`).join('')}
        </div>
      </div>

      <div class="form-grid" style="margin-top:12px;grid-template-columns:1fr 1fr 1fr">
        <div class="fg">
          <span class="fl">Start time</span>
          <input id="cm-start" type="time" value="${data.startTime||''}">
        </div>
        <div class="fg">
          <span class="fl">End time</span>
          <input id="cm-end" type="time" value="${data.endTime||''}">
        </div>
        <div class="fg">
          <span class="fl">Modality</span>
          <select id="cm-modality">
            <option value="in-person" ${(data.modality||'')==='in-person'?'selected':''}>In-person</option>
            <option value="online-live" ${(data.modality||'')==='online-live'?'selected':''}>Online – live Zoom</option>
            <option value="async" ${(data.modality||'')==='async'?'selected':''}>Asynchronous</option>
          </select>
        </div>
      </div>

      <div class="form-grid two" style="margin-top:12px">
        <div class="fg">
          <span class="fl">Total hrs/wk for CET</span>
          <input id="cm-hrs" type="number" min="1" max="20" step="0.5"
            placeholder="e.g. 2 if no SG, 3 if 2h class + 1h SG"
            value="${data.hrsPerWeek||''}">
        </div>
        <div class="fg">
          <span class="fl">Study group</span>
          <label class="cet-study-toggle">
            <input type="checkbox" id="cm-requires-sg" ${(data.requiresStudyGroup===false)?'':'checked'} onchange="toggleStudyGroupModeVisibility()">
            <span>This class needs 1-hour study group</span>
          </label>
          <select id="cm-sg-mode" style="margin-top:8px">
            <option value="in-person" ${(data.studyGroupMode||'in-person')==='in-person'?'selected':''}>In-person at CAS</option>
            <option value="online" ${(data.studyGroupMode||'')==='online'?'selected':''}>Online</option>
          </select>
        </div>
      </div>

      <div class="cet-study-note">
        If study group is checked, the total CET hours should include that extra 1 hour. If it is unchecked, all entered hours are treated as class attendance or course-work hours.
      </div>

      <div style="margin-top:12px;background:var(--warn-bg);border:1px solid var(--warn-b);border-radius:11px;padding:12px 14px">
        <span class="fl" style="display:block;margin-bottom:6px">Does this class want a CET?</span>
        <div style="display:flex;gap:12px">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;cursor:pointer">
            <input type="radio" name="cm-wants" value="yes" ${(data.wantsCET===false)?'':'checked'}> Yes
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;cursor:pointer">
            <input type="radio" name="cm-wants" value="no" ${(data.wantsCET===false)?'checked':''}> No
          </label>
        </div>
      </div>

    </div>
    <div class="cet-modal-footer">
      <button class="btn" onclick="closeClassModal()">Cancel</button>
      <button class="btn btn-red" onclick="saveClassModal(${JSON.stringify(isEdit)}, ${editId||'null'})">
        <i class="ti ti-check"></i> ${isEdit ? 'Save changes' : 'Add class'}
      </button>
    </div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if(e.target === ov) closeClassModal(); });
  toggleStudyGroupModeVisibility();
  document.getElementById('cm-title').focus();
}

function toggleStudyGroupModeVisibility(){
  const cb = document.getElementById('cm-requires-sg');
  const sg = document.getElementById('cm-sg-mode');
  if(!cb || !sg) return;
  sg.disabled = !cb.checked;
  sg.style.opacity = cb.checked ? '1' : '.45';
}

function closeClassModal(){
  const ov = document.getElementById('cet-modal-overlay');
  if(ov) ov.remove();
}

function saveClassModal(isEdit, editId){
  const title     = document.getElementById('cm-title').value.trim();
  const professor = document.getElementById('cm-prof').value.trim();
  const semester  = document.getElementById('cm-semester').value.trim();
  const days      = [...document.querySelectorAll('input[name="cm-days"]:checked')].map(el=>el.value);
  const startTime = document.getElementById('cm-start').value;
  const endTime   = document.getElementById('cm-end').value;
  const modality  = document.getElementById('cm-modality').value;
  const hrsPerWeek= parseFloat(document.getElementById('cm-hrs').value)||0;
  const requiresSG = document.getElementById('cm-requires-sg')?.checked !== false;
  const sgMode    = requiresSG ? document.getElementById('cm-sg-mode').value : 'none';
  const wantsCET  = document.querySelector('input[name="cm-wants"]:checked')?.value !== 'no';

  if(!title){
    showToast('Please enter the course title.','warn');
    return;
  }
  if(wantsCET && hrsPerWeek <= 0){
    showToast('Enter the total CET hours per week. Include study group only if this class needs one.','warn');
    return;
  }

  const obj = {
    id: isEdit ? editId : Date.now(),
    title, professor, semester,
    days, startTime, endTime, modality,
    hrsPerWeek, studyGroupMode: sgMode, requiresStudyGroup: requiresSG,
    wantsCET,
    assignedTutorId: isEdit ? (cetClasses.find(c=>c.id===editId)?.assignedTutorId || null) : null
  };

  if(isEdit){
    const idx = cetClasses.findIndex(c => c.id === editId);
    if(idx >= 0) cetClasses[idx] = obj;
  } else {
    cetClasses.push(obj);
  }

  closeClassModal();
  renderCET();
  showToast(isEdit ? 'Class updated.' : `"${title}" added.`, 'ok', 2500);
}

// ── Delete class ──────────────────────────────────────────────

function deleteCETClass(classId){
  const cls = cetClasses.find(c => c.id === classId);
  if(!cls) return;
  showConfirm(
    'Remove class?',
    `Remove ${cls.title||'this class'} and its CET assignment?`,
    () => {
      cetClasses = cetClasses.filter(c => c.id !== classId);
      renderCET();
    },
    'Remove'
  );
}

// ── Bulk add modal ────────────────────────────────────────────

function openBulkAddModal(){
  const old = document.getElementById('cet-bulk-overlay');
  if(old) old.remove();

  const ov = document.createElement('div');
  ov.id = 'cet-bulk-overlay';
  ov.className = 'cet-modal-overlay';

  ov.innerHTML = `
  <div class="cet-modal" role="dialog" aria-modal="true" style="max-width:640px">
    <div class="cet-modal-header">
      <h3>Bulk add classes</h3>
      <button class="cet-modal-close" onclick="closeBulkModal()">&times;</button>
    </div>
    <div class="cet-modal-body">
      <p style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.6">
        Paste one class per line. Minimum: <strong>Course Title, Professor</strong>.<br>
        Full format: <code>Title, Professor, Days, Start, End, Modality, Hrs/wk, Wants CET, Study Group (yes/no), Semester</code>
      </p>
      <div style="background:var(--cream);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-family:var(--mono);font-size:11px;margin-bottom:10px;line-height:1.8">
        ESL 4B, Prof. Martinez, Mon Wed, 9:00, 10:30, in-person, 3, yes, yes, Fall 2026<br>
        ESL 8, Prof. Lee, Tue Thu, 11:00, 12:30, online-live, 2, yes, no, Fall 2026<br>
        ESL 3B, Prof. Kim, Mon Wed Fri, 10:00, 11:00, in-person, 0, no, no
      </div>
      <textarea id="cet-bulk-input" style="min-height:140px" placeholder="Paste your class list here…"></textarea>
      <div id="cet-bulk-preview" style="margin-top:10px;font-size:12px;color:var(--muted)"></div>
    </div>
    <div class="cet-modal-footer">
      <button class="btn" onclick="closeBulkModal()">Cancel</button>
      <button class="btn btn-sm" onclick="previewBulk()"><i class="ti ti-eye"></i> Preview</button>
      <button class="btn btn-red" onclick="importBulk()"><i class="ti ti-table-import"></i> Import all</button>
    </div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if(e.target === ov) closeBulkModal(); });
  document.getElementById('cet-bulk-input').focus();
}

function closeBulkModal(){
  const ov = document.getElementById('cet-bulk-overlay');
  if(ov) ov.remove();
}

function parseBulkLine(line){
  const parts = line.split(',').map(s=>s.trim());
  if(parts.length < 1 || !parts[0]) return null;

  const title       = parts[0] || '';
  const professor   = parts[1] || '';
  const daysRaw     = (parts[2] || '').split(/[\s\/]+/).map(d=>{
    const map = {mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'};
    return map[d.toLowerCase().slice(0,3)] || '';
  }).filter(Boolean);
  const startTime   = parts[3] || '';
  const endTime     = parts[4] || '';
  const modality    = (['in-person','online-live','async'].includes(parts[5])) ? parts[5] : 'in-person';
  const hrsPerWeek  = parseFloat(parts[6]) || 0;
  const wantsCET    = (parts[7] || 'yes').toLowerCase() !== 'no';
  const requiresStudyGroup = (parts[8] || 'yes').toLowerCase() !== 'no';
  const semester    = parts[9] || '';

  return {
    id: Date.now() + Math.random(),
    title, professor,
    days: daysRaw,
    startTime, endTime, modality,
    hrsPerWeek, studyGroupMode: requiresStudyGroup ? 'in-person' : 'none', requiresStudyGroup,
    wantsCET, semester,
    assignedTutorId: null
  };
}

function previewBulk(){
  const text = document.getElementById('cet-bulk-input').value.trim();
  const lines = text.split('\n').filter(l=>l.trim());
  const preview = document.getElementById('cet-bulk-preview');

  if(!lines.length){ preview.innerHTML=''; return; }

  let ok = 0, bad = 0;
  lines.forEach(l => { if(parseBulkLine(l)) ok++; else bad++; });

  preview.innerHTML = `<span style="color:var(--ok);font-weight:700">${ok} valid</span>${bad?` · <span style="color:var(--red);font-weight:700">${bad} invalid (skipped)</span>`:''} · ${lines.length} total`;
}

function importBulk(){
  const text = document.getElementById('cet-bulk-input').value.trim();
  const lines = text.split('\n').filter(l=>l.trim());
  let added = 0;

  lines.forEach(l => {
    const obj = parseBulkLine(l);
    if(!obj) return;
    // Avoid exact duplicate course code + professor
    if(cetClasses.find(c => c.title===obj.title && c.professor===obj.professor)) return;
    cetClasses.push(obj);
    added++;
  });

  closeBulkModal();
  renderCET();
  showToast(`${added} class${added!==1?'es':''} imported.`, 'ok', 3000);
}

// ── CET hours deduction for schedule page ────────────────────
// Call this from schedule.js when computing tutor available hours.
// Returns how many hours/wk a tutor has committed to CET (reduces CAS hours).
function getCETHoursFor(tutorId){
  return cetClasses
    .filter(c => c.assignedTutorId === tutorId)
    .reduce((s,c) => s + (c.hrsPerWeek||0), 0);
}

// ── Export CET data (for project save/load) ──────────────────
function exportCETState(){
  return { cetClasses };
}

function importCETState(data){
  if(data && Array.isArray(data.cetClasses)){
    cetClasses = data.cetClasses;
  }
}


// ══════════════════════════════════════════════════════════════
//  CET v2 overrides — multiple tutors + specific CET blocks
// ══════════════════════════════════════════════════════════════

function cetEsc(v){
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function normalizeCETClass(cls){
  if(!cls) return cls;
  if(!Array.isArray(cls.assignments)) cls.assignments = [];

  // Backward compatibility for old saved projects that used assignedTutorId.
  if(cls.assignedTutorId && !cls.assignments.some(a => String(a.tutorId) === String(cls.assignedTutorId))){
    cls.assignments.push({
      id: Date.now() + Math.random(),
      tutorId: cls.assignedTutorId,
      days: Array.isArray(cls.days) ? [...cls.days] : [],
      startTime: cls.startTime || '',
      endTime: cls.endTime || '',
      weeklyHours: Number(cls.hrsPerWeek || 0),
      note: 'Imported from older single-tutor CET assignment'
    });
  }
  cls.assignedTutorId = null;

  cls.assignments = cls.assignments.map(a => ({
    id: a.id || Date.now() + Math.random(),
    tutorId: Number(a.tutorId),
    days: Array.isArray(a.days) ? a.days : [],
    startTime: a.startTime || cls.startTime || '',
    endTime: a.endTime || cls.endTime || '',
    weeklyHours: Number(a.weeklyHours ?? calcCETAssignmentHours(a) ?? 0),
    note: a.note || ''
  })).filter(a => a.tutorId && a.days.length && a.weeklyHours > 0);

  return cls;
}

function normalizeAllCETClasses(){
  cetClasses = (cetClasses || []).map(normalizeCETClass);
}

function calcCETAssignmentHours(a){
  if(!a || !a.startTime || !a.endTime || !Array.isArray(a.days)) return 0;
  const start = timeToMins(a.startTime);
  const end = timeToMins(a.endTime);
  if(end <= start) return 0;
  return ((end - start) / 60) * a.days.length;
}

function formatCETHours(h){
  const n = Number(h || 0);
  return `${n.toFixed(n % 1 ? 1 : 0)}h`;
}

function tutorHasAnyAvailabilityDuringClass(tutor, cls){
  normalizeCETClass(cls);
  if(!tutor || !cls || !cls.wantsCET) return false;

  // Async or incomplete class info should not be treated as impossible.
  // In focus mode, keep these as possible so Jamie can still inspect/assign them.
  if(cls.modality === 'async') return true;
  if(!Array.isArray(cls.days) || !cls.days.length) return true;
  if(!cls.startTime || !cls.endTime) return true;

  const start = timeToMins(cls.startTime);
  const end = timeToMins(cls.endTime);
  if(end <= start) return true;

  for(const day of cls.days){
    for(let m = start; m < end; m += 30){
      if(tutor.avail && tutor.avail[slotKeyFor(day, m)] === true){
        return true;
      }
    }
  }

  return false;
}

function cetAssignmentTimeLabel(a){
  return `${(a.days||[]).map(d=>d.slice(0,3)).join(', ')} · ${fmtTime(a.startTime)}–${fmtTime(a.endTime)}`;
}

function getCETAssignmentsForTutor(tutorId){
  normalizeAllCETClasses();
  const out = [];
  cetClasses.forEach(cls => {
    (cls.assignments || []).forEach(a => {
      if(String(a.tutorId) === String(tutorId)) out.push({cls, assignment:a});
    });
  });
  return out;
}

function tutorCETHrs(tutor){
  if(!tutor) return 0;
  return getCETAssignmentsForTutor(tutor.id).reduce((s,x)=>s + Number(x.assignment.weeklyHours || 0), 0);
}

function tutorCETRemainingHrs(tutor){
  return Math.max(0, Number(tutor?.hrs || 0) - tutorCETHrs(tutor));
}

function getCETHoursFor(tutorId){
  return getCETAssignmentsForTutor(tutorId).reduce((s,x)=>s + Number(x.assignment.weeklyHours || 0), 0);
}

function isTutorBusyWithCET(tutorOrId, day, time){
  const tutorId = typeof tutorOrId === 'object' ? tutorOrId.id : tutorOrId;
  const slotStart = timeToMins(time);
  const slotEnd = slotStart + 30;
  return getCETAssignmentsForTutor(tutorId).some(({assignment:a}) => {
    if(!a.days || !a.days.includes(day)) return false;
    const aStart = timeToMins(a.startTime);
    const aEnd = timeToMins(a.endTime);
    return slotStart < aEnd && slotEnd > aStart;
  });
}

function classAssignmentCount(cls){
  normalizeCETClass(cls);
  return (cls.assignments || []).length;
}

function renderCET(){
  const pane = document.getElementById('pane-cet');
  if(!pane) return;
  normalizeAllCETClasses();

  const hasClasses = cetClasses.length > 0;
  const hasTutors  = tutors.length > 0;
  const assignmentCount = cetClasses.reduce((s,c)=>s + classAssignmentCount(c), 0);

  let html = `<div class="cet-toolbar">
    <div class="cet-toolbar-left">
      <h3 class="cet-heading">CET Assignments</h3>
      <span class="cet-count-badge" ${!hasClasses?'style="display:none"':''}>
        ${cetClasses.length} class${cetClasses.length!==1?'es':''}
        · ${assignmentCount} assignment${assignmentCount!==1?'s':''}
      </span>
    </div>
    <div class="cet-toolbar-right">
      <button class="btn btn-red" onclick="openAddClassModal()"><i class="ti ti-plus"></i> Add class</button>
      <button class="btn btn-sm" onclick="openBulkAddModal()"><i class="ti ti-list-check"></i> Bulk add</button>
      <button class="btn btn-sm btn-danger" ${!hasClasses?'style="display:none"':''} onclick="clearAllCETClasses()"><i class="ti ti-trash"></i> Clear classes</button>
    </div>
  </div>`;

  if(!hasClasses){
    html += `<div class="empty" style="margin-top:12px"><i class="ti ti-school" style="font-size:28px;display:block;margin-bottom:10px;opacity:.4"></i>No ESL classes yet. Click <strong>Add class</strong> to add one, or use <strong>Bulk add</strong> to paste a list quickly.</div>`;
    pane.innerHTML = html;
    return;
  }

  html += `<div class="cet-split"><div class="cet-classes-col">`;
  const wantsCET = cetClasses.filter(c => c.wantsCET);
  const noCET = cetClasses.filter(c => !c.wantsCET);

  if(wantsCET.length){
    html += `<div class="cet-group-label">Needs a CET (${wantsCET.length})</div>`;
    wantsCET.forEach(cls => html += renderClassCard(cls));
  }
  if(noCET.length){
    html += `<div class="cet-group-label" style="margin-top:14px">No CET requested (${noCET.length})</div>`;
    noCET.forEach(cls => html += renderClassCard(cls));
  }
  html += `</div>`;

  html += `<div class="cet-tutor-col"><div class="panel"><div class="panel-title" style="margin-bottom:12px">Tutors <span style="font-size:11px;font-weight:500;color:var(--muted)">· click to highlight possible classes</span></div>`;
  if(!hasTutors){
    html += `<div style="font-size:12px;color:var(--muted);padding:8px 0">No tutors in roster yet.</div>`;
  } else {
    tutors.forEach((t,i)=>{
      const c = colorFor(i);
      const cetHrs = tutorCETHrs(t);
      const remaining = Math.max(0, Number(t.hrs||0) - cetHrs);
      const isFocused = cetFocusedTutorId === t.id;
      const pct = Math.min(100, Math.round(cetHrs / Math.max(Number(t.hrs)||1,1) * 100));
      const assignedCount = getCETAssignmentsForTutor(t.id).length;
      html += `<div class="cet-tutor-row ${isFocused?'cet-tutor-focused':''}" onclick="toggleCETFocus(${t.id})" style="--tc:${c.text};--tbg:${c.bg};--tb:${c.border}">
        <div class="h-av" style="background:${c.bg};color:${c.text};width:32px;height:32px;font-size:11px">${initials(t.name)}</div>
        <div style="flex:1;min-width:0">
          <div class="h-name" style="font-size:12px">${cetEsc(t.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
            ${cetHrs > 0 ? `${formatCETHours(cetHrs)} CET · ${formatCETHours(remaining)} left for CAS` : `${t.hrs}h available · no CET yet`}
            ${assignedCount > 0 ? ` · ${assignedCount} block${assignedCount!==1?'s':''}` : ''}
          </div>
          ${cetHrs > 0 ? `<div class="h-bar-wrap" style="margin-top:4px"><div class="h-bar" style="width:${pct}%;background:${c.text}"></div></div>` : ''}
        </div>${isFocused ? `<span class="cet-focused-badge">Focusing</span>` : ''}</div>`;
    });
  }
  if(cetFocusedTutorId){
    html += `<button class="btn btn-sm" style="width:100%;margin-top:10px;justify-content:center" onclick="clearCETFocus()"><i class="ti ti-x"></i> Exit focus mode</button>`;
  }
  html += `</div></div></div>`;
  pane.innerHTML = html;
}

function renderClassCard(cls){
  normalizeCETClass(cls);
  const assignments = cls.assignments || [];

  // Focus mode behavior:
  // - If the focused tutor is already assigned to this class, highlight it.
  // - If the focused tutor is not assigned yet, highlight classes they could potentially take
  //   based on ANY overlap with their marked availability.
  // - Classes completely outside their availability are dimmed.
  const focusedTutor = cetFocusedTutorId ? tutors.find(t => String(t.id) === String(cetFocusedTutorId)) : null;
  const focusedAlreadyAssigned = focusedTutor && assignments.some(a => String(a.tutorId) === String(focusedTutor.id));
  const focusedHasPossibleTime = focusedTutor ? tutorHasAnyAvailabilityDuringClass(focusedTutor, cls) : false;
  const focusedHasHoursLeft = focusedTutor ? tutorCETRemainingHrs(focusedTutor) > 0 : false;
  const focusedPotential = !!(focusedTutor && cls.wantsCET && focusedHasHoursLeft && focusedHasPossibleTime);

  const highlighted = !!(focusedTutor && (focusedAlreadyAssigned || focusedPotential));
  const dimmed = !!(focusedTutor && !highlighted);

  const modalityIcon = {'in-person':'ti-building','online-live':'ti-video','async':'ti-clock-off'}[cls.modality] || 'ti-school';
  const modalityLabel = {'in-person':'In-person','online-live':'Online – live Zoom','async':'Asynchronous'}[cls.modality] || cls.modality;
  const daysStr = cls.days && cls.days.length ? cls.days.map(d=>d.slice(0,3)).join(', ') : 'TBD';
  const timeStr = cls.startTime && cls.endTime ? `${fmtTime(cls.startTime)} – ${fmtTime(cls.endTime)}` : 'TBD';
  const classHrs = classContactHours(cls);
  const sgHrs = studyGroupHours(cls);
  const totalAssigned = assignments.reduce((s,a)=>s + Number(a.weeklyHours||0), 0);

  let html = `<div class="cet-class-card ${dimmed?'cet-dimmed':''} ${highlighted?'cet-highlighted':''} ${!cls.wantsCET?'cet-no-cet':''}" data-cet-id="${cls.id}">
    <div class="cet-card-top"><div class="cet-card-title"><span class="cet-course-title">${cetEsc(cls.title||'Untitled class')}</span></div>
      <div class="cet-card-actions"><button class="btn btn-sm" onclick="openEditClassModal(${cls.id})" title="Edit class"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deleteCETClass(${cls.id})" title="Remove class"><i class="ti ti-trash"></i></button></div>
    </div>
    <div class="cet-card-meta">
      <span class="cet-meta-chip"><i class="ti ti-user-tie"></i> ${cetEsc(cls.professor||'Prof. TBD')}</span>
      <span class="cet-meta-chip"><i class="ti ${modalityIcon}"></i> ${modalityLabel}</span>
      <span class="cet-meta-chip"><i class="ti ti-calendar"></i> ${daysStr}</span>
      ${cls.modality !== 'async' ? `<span class="cet-meta-chip"><i class="ti ti-clock"></i> ${timeStr}</span>` : ''}
      <span class="cet-meta-chip"><i class="ti ti-hours-24"></i> Target ${cls.hrsPerWeek||'?'}h/wk</span>
      ${assignments.length ? `<span class="cet-meta-chip"><i class="ti ti-check"></i> Assigned ${formatCETHours(totalAssigned)}</span>` : ''}
    </div>
    ${cls.hrsPerWeek > 0 ? `<div class="cet-hours-breakdown"><span class="cet-hrs-chip cet-hrs-class">${classHrs}h class contact</span>${sgHrs > 0 ? `<span class="cet-hrs-chip cet-hrs-sg">${studyGroupLabel(cls)}</span>` : `<span class="cet-hrs-chip cet-hrs-no-sg">No study group</span>`}</div>` : ''}
    <div class="cet-assign-row">`;

  if(!cls.wantsCET){
    html += `<span style="font-size:11px;color:var(--muted);font-style:italic">No CET requested for this class.</span>`;
  } else {
    html += `<div class="cet-assignment-list">`;
    if(assignments.length){
      assignments.forEach(a => {
        const tutor = tutors.find(t => String(t.id) === String(a.tutorId));
        if(!tutor) return;
        const c = cetColorFor(tutor.id);
        html += `<div class="cet-assignment-pill" style="background:${c.bg};color:${c.text};border:1.5px solid ${c.border}">
          <div class="avatar" style="background:${c.bg};color:${c.text};width:22px;height:22px;font-size:9px;flex-shrink:0">${initials(tutor.name)}</div>
          <div class="cet-assignment-info"><strong>${cetEsc(tutor.name)}</strong><span>${cetAssignmentTimeLabel(a)} · ${formatCETHours(a.weeklyHours)}/wk</span></div>
          <button class="cet-pill-remove" onclick="removeCETAssignment(${cls.id}, ${a.id})" title="Remove this tutor"><i class="ti ti-x"></i></button>
        </div>`;
      });
    } else {
      html += `<div class="cet-no-compatible">No tutor assigned yet.</div>`;
    }
    html += `</div><button class="btn btn-red btn-sm" onclick="openCETAssignModal(${cls.id})"><i class="ti ti-user-plus"></i> Add tutor</button>`;
  }

  html += `</div></div>`;
  return html;
}

function openCETAssignModal(classId){
  normalizeAllCETClasses();
  const cls = cetClasses.find(c => String(c.id) === String(classId));
  if(!cls) return;
  if(!tutors.length){ showToast('Add tutors to the roster first.', 'warn'); return; }
  closeCETAssignModal();

  const ov = document.createElement('div');
  ov.id = 'cet-assign-overlay';
  ov.className = 'cet-modal-overlay';
  const classDays = Array.isArray(cls.days) && cls.days.length ? cls.days : ALL_DAYS;
  const focused = cetFocusedTutorId || '';

  ov.innerHTML = `<div class="cet-modal cet-assign-modal" role="dialog" aria-modal="true">
    <div class="cet-modal-header"><h3>Add CET tutor block</h3><button class="cet-modal-close" onclick="closeCETAssignModal()">&times;</button></div>
    <div class="cet-modal-body">
      <div class="cet-study-note" style="margin-top:0">${cetEsc(cls.title || 'This class')} · choose exactly which days and times this tutor will attend. These hours will be deducted from their CAS schedule availability.</div>
      <div class="form-grid two" style="margin-top:12px">
        <div class="fg"><span class="fl">Tutor</span><select id="ca-tutor" onchange="updateCETAssignPreview(${cls.id})">
          <option value="">— Select tutor —</option>
          ${tutors.map(t => `<option value="${t.id}" ${String(focused)===String(t.id)?'selected':''}>${cetEsc(t.name)} · ${formatCETHours(tutorCETRemainingHrs(t))} left</option>`).join('')}
        </select></div>
        <div class="fg"><span class="fl">Calculated hours</span><div class="cet-calc-box" id="ca-hours-preview">Select days and times</div></div>
      </div>
      <div style="margin-top:12px"><span class="fl" style="display:block;margin-bottom:6px">Days this tutor attends</span><div class="cet-day-checkboxes">
        ${classDays.map(d => `<label class="cet-day-label"><input type="checkbox" name="ca-days" value="${d}" checked onchange="updateCETAssignPreview(${cls.id})"> ${d.slice(0,3)}</label>`).join('')}
      </div></div>
      <div class="form-grid two" style="margin-top:12px">
        <div class="fg"><span class="fl">CET start time</span><input id="ca-start" type="time" value="${cls.startTime || ''}" onchange="updateCETAssignPreview(${cls.id})"></div>
        <div class="fg"><span class="fl">CET end time</span><input id="ca-end" type="time" value="${cls.endTime || ''}" onchange="updateCETAssignPreview(${cls.id})"></div>
      </div>
      <div id="ca-warning" class="cet-assign-warning" style="display:none"></div>
    </div>
    <div class="cet-modal-footer"><button class="btn" onclick="closeCETAssignModal()">Cancel</button><button class="btn btn-red" onclick="saveCETAssignment(${cls.id})"><i class="ti ti-check"></i> Add tutor block</button></div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if(e.target === ov) closeCETAssignModal(); });
  updateCETAssignPreview(classId);
}

function closeCETAssignModal(){
  const ov = document.getElementById('cet-assign-overlay');
  if(ov) ov.remove();
}

function getCETAssignDraft(){
  const tutorId = parseInt(document.getElementById('ca-tutor')?.value || '', 10);
  const days = [...document.querySelectorAll('input[name="ca-days"]:checked')].map(el=>el.value);
  const startTime = document.getElementById('ca-start')?.value || '';
  const endTime = document.getElementById('ca-end')?.value || '';
  return { tutorId, days, startTime, endTime, weeklyHours: calcCETAssignmentHours({days,startTime,endTime}) };
}

function updateCETAssignPreview(classId){
  const preview = document.getElementById('ca-hours-preview');
  const warning = document.getElementById('ca-warning');
  if(!preview) return;
  const draft = getCETAssignDraft();
  preview.textContent = draft.weeklyHours > 0 ? `${formatCETHours(draft.weeklyHours)} / week` : 'Select days and valid times';
  if(!warning) return;

  const tutor = tutors.find(t => String(t.id) === String(draft.tutorId));
  if(!tutor || !draft.days.length || !draft.startTime || !draft.endTime || draft.weeklyHours <= 0){
    warning.style.display = 'none';
    warning.innerHTML = '';
    return;
  }

  const remaining = tutorCETRemainingHrs(tutor);
  const busy = draft.days.filter(day => {
    for(let m = timeToMins(draft.startTime); m < timeToMins(draft.endTime); m += 30){
      if(isTutorBusyWithCET(tutor.id, day, `${Math.floor(m/60)}:${m%60===0?'00':m%60}`)) return true;
    }
    return false;
  });

  const missing = [];
  draft.days.forEach(day => {
    for(let m = timeToMins(draft.startTime); m < timeToMins(draft.endTime); m += 30){
      const key = slotKeyFor(day, m);
      if(!(tutor.avail && tutor.avail[key] === true)){
        missing.push(`${day} ${minsToTimeLabel(m)}`);
      }
    }
  });

  const notes = [];
  if(draft.weeklyHours > remaining) notes.push(`${cetEsc(tutor.name)} only has ${formatCETHours(remaining)} left, but this block is ${formatCETHours(draft.weeklyHours)}.`);
  if(busy.length) notes.push(`This tutor already has a CET block overlapping on: ${busy.join(', ')}.`);
  if(missing.length) notes.push(`Availability warning: ${cetEsc(tutor.name)} is not marked available for every selected slot. You can still assign if this is intentional.`);

  if(notes.length){
    warning.style.display = 'block';
    warning.innerHTML = notes.map(n=>`<div>${n}</div>`).join('');
  } else {
    warning.style.display = 'none';
    warning.innerHTML = '';
  }
}

function saveCETAssignment(classId){
  normalizeAllCETClasses();
  const cls = cetClasses.find(c => String(c.id) === String(classId));
  if(!cls) return;
  const draft = getCETAssignDraft();
  const tutor = tutors.find(t => String(t.id) === String(draft.tutorId));

  if(!tutor){ showToast('Select a tutor first.', 'warn'); return; }
  if(!draft.days.length){ showToast('Select at least one day for this CET block.', 'warn'); return; }
  if(!draft.startTime || !draft.endTime || timeToMins(draft.endTime) <= timeToMins(draft.startTime)){ showToast('Enter a valid CET start and end time.', 'warn'); return; }

  const remaining = tutorCETRemainingHrs(tutor);
  const addNow = () => {
    cls.assignments.push({
      id: Date.now() + Math.random(),
      tutorId: tutor.id,
      days: draft.days,
      startTime: draft.startTime,
      endTime: draft.endTime,
      weeklyHours: draft.weeklyHours
    });
    closeCETAssignModal();
    renderCET();
    showToast(`${tutor.name} added to ${cls.title}. ${formatCETHours(draft.weeklyHours)} deducted from CAS hours.`, 'ok', 4500);
  };

  const warnings = [];
  if(draft.weeklyHours > remaining) warnings.push(`${tutor.name} only has ${formatCETHours(remaining)} left, but this block is ${formatCETHours(draft.weeklyHours)}.`);

  const missing = [];
  draft.days.forEach(day => {
    for(let m = timeToMins(draft.startTime); m < timeToMins(draft.endTime); m += 30){
      const key = slotKeyFor(day, m);
      if(!(tutor.avail && tutor.avail[key] === true)) missing.push(`${day} ${minsToTimeLabel(m)}`);
    }
  });
  if(missing.length) warnings.push(`${tutor.name} is not marked available for every selected CET slot.`);

  const overlaps = [];
  draft.days.forEach(day => {
    for(let m = timeToMins(draft.startTime); m < timeToMins(draft.endTime); m += 30){
      const keyTime = `${Math.floor(m/60)}:${m%60===0?'00':m%60}`;
      if(isTutorBusyWithCET(tutor.id, day, keyTime)) { overlaps.push(day); break; }
    }
  });
  if(overlaps.length) warnings.push(`${tutor.name} already has another CET block overlapping on ${[...new Set(overlaps)].join(', ')}.`);

  if(warnings.length){
    showConfirm('Add CET block with warning?', warnings.join('\n\n') + '\n\nYou can still add this block if this is intentional.', addNow, 'Add anyway');
    return;
  }
  addNow();
}

function removeCETAssignment(classId, assignmentId){
  const cls = cetClasses.find(c => String(c.id) === String(classId));
  if(!cls) return;
  cls.assignments = (cls.assignments || []).filter(a => String(a.id) !== String(assignmentId));
  renderCET();
  showToast('CET tutor block removed.', 'ok', 2500);
}

function clearAllCETClasses(){
  if(!cetClasses.length) return;
  showConfirm('Clear all CET classes?', 'This will remove every CET class and every CET tutor assignment. This cannot be undone.', () => {
    cetClasses = [];
    cetFocusedTutorId = null;
    renderCET();
    showToast('All CET classes were removed.', 'ok', 2500);
  }, 'Clear all');
}

function assignCET(classId){
  openCETAssignModal(classId);
}

function doAssignCET(cls, tutorId){
  openCETAssignModal(cls.id);
}

function unassignCET(classId){
  const cls = cetClasses.find(c => String(c.id) === String(classId));
  if(!cls) return;
  cls.assignments = [];
  cls.assignedTutorId = null;
  renderCET();
}

function saveClassModal(isEdit, editId){
  const title     = document.getElementById('cm-title').value.trim();
  const professor = document.getElementById('cm-prof').value.trim();
  const semester  = document.getElementById('cm-semester').value.trim();
  const days      = [...document.querySelectorAll('input[name="cm-days"]:checked')].map(el=>el.value);
  const startTime = document.getElementById('cm-start').value;
  const endTime   = document.getElementById('cm-end').value;
  const modality  = document.getElementById('cm-modality').value;
  const hrsPerWeek= parseFloat(document.getElementById('cm-hrs').value)||0;
  const requiresSG = document.getElementById('cm-requires-sg')?.checked !== false;
  const sgMode    = requiresSG ? document.getElementById('cm-sg-mode').value : 'none';
  const wantsCET  = document.querySelector('input[name="cm-wants"]:checked')?.value !== 'no';

  if(!title){ showToast('Please enter the course title.','warn'); return; }
  if(wantsCET && hrsPerWeek <= 0){ showToast('Enter the total CET hours per week. Include study group only if this class needs one.','warn'); return; }

  const existing = isEdit ? cetClasses.find(c=>String(c.id)===String(editId)) : null;
  const obj = {
    id: isEdit ? editId : Date.now(),
    title, professor, semester, days, startTime, endTime, modality,
    hrsPerWeek, studyGroupMode: sgMode, requiresStudyGroup: requiresSG,
    wantsCET,
    assignedTutorId: null,
    assignments: existing && Array.isArray(existing.assignments) ? existing.assignments : []
  };

  if(isEdit){
    const idx = cetClasses.findIndex(c => String(c.id) === String(editId));
    if(idx >= 0) cetClasses[idx] = normalizeCETClass(obj);
  } else {
    cetClasses.push(normalizeCETClass(obj));
  }

  closeClassModal();
  renderCET();
  showToast(isEdit ? 'Class updated.' : `"${title}" added.`, 'ok', 2500);
}

function parseBulkLine(line){
  const parts = line.split(',').map(s=>s.trim());
  if(parts.length < 1 || !parts[0]) return null;
  const title       = parts[0] || '';
  const professor   = parts[1] || '';
  const daysRaw     = (parts[2] || '').split(/[\s\/]+/).map(d=>{
    const map = {mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'};
    return map[d.toLowerCase().slice(0,3)] || '';
  }).filter(Boolean);
  const startTime   = parts[3] || '';
  const endTime     = parts[4] || '';
  const modality    = (['in-person','online-live','async'].includes(parts[5])) ? parts[5] : 'in-person';
  const hrsPerWeek  = parseFloat(parts[6]) || 0;
  const wantsCET    = (parts[7] || 'yes').toLowerCase() !== 'no';
  const requiresStudyGroup = (parts[8] || 'yes').toLowerCase() !== 'no';
  const semester    = parts[9] || '';
  return normalizeCETClass({id: Date.now() + Math.random(), title, professor, days: daysRaw, startTime, endTime, modality, hrsPerWeek, studyGroupMode: requiresStudyGroup ? 'in-person' : 'none', requiresStudyGroup, wantsCET, semester, assignedTutorId:null, assignments:[]});
}

function exportCETState(){
  normalizeAllCETClasses();
  return { cetClasses };
}

function importCETState(data){
  if(data && Array.isArray(data.cetClasses)){
    cetClasses = data.cetClasses.map(normalizeCETClass);
  }
}
