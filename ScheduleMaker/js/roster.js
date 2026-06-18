// ── Roster Rendering, Search, Edit, Remove ─────────────────
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
  if(typeof markScheduleNeedsRegeneration === 'function') markScheduleNeedsRegeneration('roster changes');
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
      if(typeof markScheduleNeedsRegeneration === 'function') markScheduleNeedsRegeneration('roster changes');
      showToast(`${escapeHtml(tutor.name)} was removed from the roster.`, 'ok');
    },
    'Remove tutor'
  );
}

// ── Add tutor manually ───────────────────────────────────
