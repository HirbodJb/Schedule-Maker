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

// Does a class on given days/times conflict with a tutor's marked availability?
// Returns true if the tutor IS available for ALL class slots (no conflict).
function tutorAvailableForClass(tutor, cls){
  if(!cls.days || !cls.days.length) return false;
  const startMins = timeToMins(cls.startTime);
  const endMins   = timeToMins(cls.endTime);

  // Build 30-min slots the class occupies
  const classSlots = [];
  for(let m = startMins; m < endMins; m += 30){
    const hh = Math.floor(m/60);
    const mm = m % 60;
    const key = `${hh}:${mm === 0 ? '00' : mm}`;
    cls.days.forEach(day => classSlots.push(day + '-' + key));
  }

  if(!classSlots.length) return false;

  // For a timed CET class, the tutor must be available for the full class time.
  // Async classes have no fixed time conflict, so any tutor with enough hours may be shown.
  if(cls.modality === 'async') return true;

  return classSlots.every(key => tutor.avail && tutor.avail[key] === true);
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

  const classHrs = cls.hrsPerWeek > 1 ? cls.hrsPerWeek - 1 : cls.hrsPerWeek;
  const sgHrs = cls.hrsPerWeek > 1 ? 1 : 0;

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
      ${sgHrs > 0 ? `<span class="cet-hrs-chip cet-hrs-sg">+1h study group (${cls.studyGroupMode||'TBD'})</span>` : ''}
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
    // Show assign button — if a tutor is focused and compatible, pre-fill
    const focusedTutor = cetFocusedTutorId ? tutors.find(t=>t.id===cetFocusedTutorId) : null;
    const canAssignFocused = focusedTutor && highlighted;

    const eligibleTutors = tutors.filter(t => {
      const compatible = tutorAvailableForClass(t, cls);
      const remaining = tutorCETRemainingHrs(t);
      const canHandle = remaining >= (cls.hrsPerWeek || 0);
      return compatible && canHandle;
    });

    html += `<div class="cet-assign-controls">`;

    if(!eligibleTutors.length){
      html += `<div class="cet-no-compatible">
        No tutor is available for this class time with enough remaining hours.
      </div>`;
    } else {
      html += `<select class="cet-tutor-select" id="cet-select-${cls.id}" onchange="updateAssignBtn(${cls.id})">
        <option value="">— Select tutor available for this course —</option>`;

      eligibleTutors.forEach((t) => {
        const remaining = tutorCETRemainingHrs(t);
        html += `<option value="${t.id}" ${canAssignFocused&&t.id===focusedTutor.id?'selected':''}>${t.name} · ${remaining}h left</option>`;
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
    showToast(`${tutor.name} only has ${remaining}h left — this class needs ${needed}h/wk (including 1h study group).`,'warn');
    return;
  }

  if(!tutorAvailableForClass(tutor, cls) && cls.modality !== 'async'){
    showToast(`${tutor.name} is not available for this class time.`, 'warn');
    return;
  }

  doAssignCET(cls, tutorId);
}

function doAssignCET(cls, tutorId){
  cls.assignedTutorId = tutorId;
  showToast(`Assigned! Remember: ${cls.hrsPerWeek}h/wk deducted from their CAS hours (${(cls.hrsPerWeek||0)-1}h class + 1h study group).`,'ok', 5000);
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
          <span class="fl">Total hrs/wk for CET <span style="font-size:10px;font-weight:500">(class hrs + 1 study group)</span></span>
          <input id="cm-hrs" type="number" min="1" max="20" step="0.5"
            placeholder="e.g. 3 = 2h class + 1h SG"
            value="${data.hrsPerWeek||''}">
        </div>
        <div class="fg">
          <span class="fl">Study group mode</span>
          <select id="cm-sg-mode">
            <option value="in-person" ${(data.studyGroupMode||'in-person')==='in-person'?'selected':''}>In-person at CAS</option>
            <option value="online" ${(data.studyGroupMode||'')==='online'?'selected':''}>Online</option>
          </select>
        </div>
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
  document.getElementById('cm-title').focus();
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
  const sgMode    = document.getElementById('cm-sg-mode').value;
  const wantsCET  = document.querySelector('input[name="cm-wants"]:checked')?.value !== 'no';

  if(!title){
    showToast('Please enter the course title.','warn');
    return;
  }
  if(wantsCET && hrsPerWeek <= 0){
    showToast('Enter the total CET hours per week (class contact + 1h study group).','warn');
    return;
  }

  const obj = {
    id: isEdit ? editId : Date.now(),
    title, professor, semester,
    days, startTime, endTime, modality,
    hrsPerWeek, studyGroupMode: sgMode,
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
        Full format: <code>Title, Professor, Days (Mon/Tue/...), Start, End, Modality, Hrs/wk, Wants CET (yes/no), Semester</code>
      </p>
      <div style="background:var(--cream);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-family:var(--mono);font-size:11px;margin-bottom:10px;line-height:1.8">
        ESL 4B, Prof. Martinez, Mon Wed, 9:00, 10:30, in-person, 3, yes, Fall 2026<br>
        ESL 8, Prof. Lee, Tue Thu, 11:00, 12:30, online-live, 4, yes, Fall 2026<br>
        ESL 3B, Prof. Kim, Mon Wed Fri, 10:00, 11:00, in-person, 0, no
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
  const semester    = parts[8] || '';

  return {
    id: Date.now() + Math.random(),
    title, professor,
    days: daysRaw,
    startTime, endTime, modality,
    hrsPerWeek, studyGroupMode: 'in-person',
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
