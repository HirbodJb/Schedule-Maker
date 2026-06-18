// ── CET Study Group auto-placement helpers ─────────────────
function scheduleSlotKey(day, time){ return day + '-' + time; }
function minsToScheduleTime(mins){ return `${Math.floor(mins/60)}:${mins%60===0?'00':String(mins%60).padStart(2,'0')}`; }
function scheduleFindSlot(slots, day, time){ return slots.find(s => s.day === day && s.time === time); }
function scheduleSlotHasTutor(slot, tutorId){ return !!(slot && slot.assigned && slot.assigned.some(x => String(x.id) === String(tutorId))); }
function isStudyGroupBlockValid(tutor, day, startTime, slots){
  const times = timesForDay(day);
  const startMins = timeToMins(startTime);
  const blockTimes = [startTime, minsToScheduleTime(startMins + 30)];
  if(!blockTimes.every(t => times.includes(t))) return false;
  return blockTimes.every(t => {
    const key = scheduleSlotKey(day, t);
    const slot = scheduleFindSlot(slots, day, t);
    return tutor.avail && tutor.avail[key] === true
      && !(typeof isTutorBusyWithCET === 'function' && isTutorBusyWithCET(tutor, day, t))
      && !scheduleSlotHasTutor(slot, tutor.id);
  });
}
function placeStudyGroupBlock(tutor, cls, assignment, day, startTime, slots){
  const startMins = timeToMins(startTime);
  const blockTimes = [startTime, minsToScheduleTime(startMins + 30)];
  const sgTutor = Object.assign({}, tutor, {
    _type:'sg',
    _sgClassId: cls.id,
    _sgAssignmentId: assignment.id,
    _sgTitle: cls.title || 'Study group'
  });
  blockTimes.forEach(t => {
    const slot = scheduleFindSlot(slots, day, t);
    if(slot && !scheduleSlotHasTutor(slot, tutor.id)) slot.assigned.push(sgTutor);
  });
  assignment.sgStatus = 'scheduled';
  assignment.sgPlacement = {
    day,
    startTime,
    endTime: minsToScheduleTime(startMins + 60),
    weeklyHours: 1
  };
  assignment.sgNote = 'Study group auto-placed next to class time.';
  tutor.assignedHrs = Number(tutor.assignedHrs || 0) + 1;
}
function autoPlaceCETStudyGroups(slots){
  if(typeof normalizeAllCETClasses !== 'function') return [];
  normalizeAllCETClasses();
  const unresolved = [];
  cetClasses.forEach(cls => {
    (cls.assignments || []).forEach(a => {
      if(!(typeof assignmentNeedsStudyGroup === 'function' && assignmentNeedsStudyGroup(cls, a))) return;
      const tutor = getTutorById(a.tutorId);
      if(!tutor){
        a.sgStatus = 'manual-needed';
        a.sgPlacement = null;
        a.sgNote = 'Tutor was not found in the roster.';
        unresolved.push({cls, assignment:a});
        return;
      }
      a.sgStatus = 'pending';
      a.sgPlacement = null;
      a.sgNote = '';

      const candidates = [];
      (a.days || []).forEach(day => {
        const after = a.endTime;
        const before = minsToScheduleTime(timeToMins(a.startTime) - 60);
        candidates.push({day, startTime: after, priority: 'after'});
        candidates.push({day, startTime: before, priority: 'before'});
      });

      const chosen = candidates.find(c => isStudyGroupBlockValid(tutor, c.day, c.startTime, slots));
      if(chosen){
        placeStudyGroupBlock(tutor, cls, a, chosen.day, chosen.startTime, slots);
      } else {
        a.sgStatus = 'manual-needed';
        a.sgPlacement = null;
        a.sgNote = 'No available 1-hour SG block immediately before or after the CET class time. Please assign SG manually.';
        unresolved.push({cls, assignment:a});
      }
    });
  });
  return unresolved;
}
function cetStudyGroupWarningBanner(){
  if(typeof getUnresolvedCETStudyGroups !== 'function') return '';
  const unresolved = getUnresolvedCETStudyGroups();
  if(!unresolved.length) return '';
  const items = unresolved.map(({cls, assignment:a}) => {
    const tutor = getTutorById(a.tutorId);
    return `<li><strong>${escapeHtml(tutor ? tutor.name : 'Tutor')}</strong> — ${escapeHtml(cls.title || 'CET class')}: ${escapeHtml(a.sgNote || 'Study group needs manual time.')}</li>`;
  }).join('');
  return `<div class="sg-warning-banner"><div><strong><i class="ti ti-alert-triangle"></i> Study groups needing manual time</strong><ul>${items}</ul></div></div>`;
}

// ── Schedule Generation, Rendering & Export ─────────────────
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

  if(typeof resetCETStudyGroupStatus === 'function') resetCETStudyGroupStatus();
  tutors.forEach(t=>{ t.assignedHrs=(typeof getCETHoursFor==='function'?getCETHoursFor(t.id):0); t.assignments=[]; });

  const allSlots=[];
  ALL_DAYS.forEach(day=>{
    const times=day==='Friday'?TIMES_FRI:TIMES_MF;
    times.forEach(t=>allSlots.push({day,time:t,assigned:[]}));
  });

  const unresolvedSG = autoPlaceCETStudyGroups(allSlots);

  allSlots.forEach(slot=>{
    const eligible=tutors.filter(t=>{
      const key=slot.day+'-'+slot.time;
      return t.avail[key]===true
        && !scheduleSlotHasTutor(slot, t.id)
        && !(typeof isTutorBusyWithCET==='function' && isTutorBusyWithCET(t,slot.day,slot.time))
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
  if(unresolvedSG && unresolvedSG.length){
    showToast(`${unresolvedSG.length} study group${unresolvedSG.length!==1?'s':''} could not be placed automatically. Please assign manually.`, 'warn', 6500);
  }
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

function displayModeShortForDay(tutor, day){
  if(day === 'Friday') return 'OL';
  return tutorModeShort(tutor);
}

function displayModeLabelForDay(tutor, day){
  if(day === 'Friday') return 'Online';
  return tutorModeLabel(tutor);
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

function showTutorQuickSummary(event, tutorId, day=null){
  const tutor = getTutorById(tutorId);
  if(!tutor) return;

  const card = ensureTutorHoverCard();
  const assigned = Number(tutor.assignedHrs || 0);
  const target = Number(tutor.hrs || 0);
  const modeShort = day ? displayModeShortForDay(tutor, day) : tutorModeShort(tutor);
  const modeLabel = day ? displayModeLabelForDay(tutor, day) : tutorModeLabel(tutor);
  const availabilitySlots = tutorAvailabilityCount(tutor);

  card.innerHTML = `
    <div class="tutor-hover-title">${escapeHtml(tutor.name)} ${modeShort}</div>
    <div class="tutor-hover-row">
      <span class="tutor-hover-label">Assigned</span>
      <span class="tutor-hover-value">${assigned.toFixed(1)} / ${target} hrs</span>
    </div>
    <div class="tutor-hover-row">
      <span class="tutor-hover-label">Mode</span>
      <span class="tutor-hover-value">${escapeHtml(modeLabel)}</span>
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
  html += cetStudyGroupWarningBanner();
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
  html+=`<div class="panel ${focusedTutorId?'focus-mode':''}"><div class="panel-title">Weekly schedule grid</div><div class="schedule-period-label"><i class="ti ti-calendar-time"></i> ${escapeHtml(schedulePeriodText())}${scheduleSettings.weeklyBudget?` · Weekly budget: ${scheduleSettings.weeklyBudget.toFixed(1)}h`:''} · Friday shifts display as online</div><div class="sched-wrap"><table class="sched-table">`;
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
        const cetFree=!(typeof isTutorBusyWithCET==='function' && isTutorBusyWithCET(movingTutor,day,t));
        cellClass=(available&&!duplicate&&!sameCell&&breakOk&&cetFree)?'drop-ok':'drop-no';
      } else if(addHoursMode){
        const addTutor=getTutorById(addHoursMode.tutorId);
        cellClass=(addTutor && isManualAddSlotValid(addTutor,day,t) && !(typeof isTutorBusyWithCET==='function' && isTutorBusyWithCET(addTutor,day,t)))?'add-ok':'add-no';
      }
      if(focusedTutorId && !moveMode && !addHoursMode){
        const hasFocused=assignedHere.some(x=>String(x.id)===String(focusedTutorId));
        cellClass=(cellClass+' '+(hasFocused?'focus-match-cell':'focus-other')).trim();
      }

      if(!assignedHere.length){html+=`<td class="${cellClass}" onclick="handleScheduleCellClickGuarded('${day}','${t}')"></td>`;return;}

      let pills='';
      assignedHere.forEach(tt=>{
        const c=colorFor(tutors.findIndex(x=>String(x.id)===String(tt.id)));
        const isSG = tt._type === 'sg';
        const mode=isSG ? 'SG' : displayModeShortForDay(tt, day);
        const info=shiftInfo[day+'-'+t+'-'+tt.id];
        const isMerged=info&&info.runLen>1;
        const pillClass=(isMerged?'pill-merged':'pill') + (isSG ? ' sg-pill' : '');

        let timeLabel='';
        if(isMerged&&info.isStart){
          const endTime=TIMES_MF[TIMES_MF.indexOf(info.startTime)+info.runLen];
          timeLabel=`<span class="pill-time">${fmtTime(info.startTime)}–${endTime?fmtTime(endTime):'end'}</span>`;
        } else if(isMerged&&!info.isStart){
          // continuation row — show a faint continuation indicator, not a full pill
          const editClass=moveMode&&String(moveMode.tutorId)===String(tt.id)&&moveMode.day===day&&moveMode.time===t?' move-source':'';
          const focusClass=focusedTutorId?(String(focusedTutorId)===String(tt.id)?' focus-match':' focus-nonmatch'):'';
          pills+=`<span class="pill${isSG?' sg-pill':''}${editClass}${focusClass}" onmouseenter="showTutorQuickSummary(event,${tt.id},'${day}')" onmousemove="moveTutorQuickSummary(event)" onmouseleave="hideTutorQuickSummary()" onclick="openShiftPopover(event,${tt.id},'${day}','${t}')" style="background:${isSG?'#eaf3de':c.bg};color:${isSG?'#27500a':c.text};border:1px dashed ${isSG?'#8bc46b':c.border};opacity:.72;font-size:9px;">${isSG?'SG ':''}${tt.name.split(' ')[0]} ···</span>`;
          return;
        }

        const editClass=moveMode&&String(moveMode.tutorId)===String(tt.id)&&moveMode.day===day&&moveMode.time===t?' move-source':'';
        const focusClass=focusedTutorId?(String(focusedTutorId)===String(tt.id)?' focus-match':' focus-nonmatch'):'';
        const labelText = isSG ? `SG ${tt.name.split(' ')[0]}` : `${tt.name.split(' ')[0]} ${mode}`;
        pills+=`<span class="${pillClass}${editClass}${focusClass}" onmouseenter="showTutorQuickSummary(event,${tt.id},'${day}')" onmousemove="moveTutorQuickSummary(event)" onmouseleave="hideTutorQuickSummary()" onclick="openShiftPopover(event,${tt.id},'${day}','${t}')" style="background:${isSG?'#eaf3de':c.bg};color:${isSG?'#27500a':c.text};border:1.5px solid ${isSG?'#8bc46b':c.border}">${labelText}${timeLabel}</span>`;
      });

      html+=`<td class="${cellClass}" onclick="handleScheduleCellClickGuarded('${day}','${t}')">${pills}</td>`;
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
        const mode = displayModeShortForDay(t, day);
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


// ── CET conflict guard for manual Add-hours mode ─────────────
// Prevents a tutor from being manually added to a schedule slot that is already
// reserved by one of their CET blocks. The auto-generator already checks this;
// this guard makes manual Add behave the same way.
function handleScheduleCellClickGuarded(day, time){
  if(addHoursMode && addHoursMode.tutorId && typeof isTutorBusyWithCET === 'function'){
    const tutor = getTutorById(addHoursMode.tutorId);
    if(tutor && isTutorBusyWithCET(tutor, day, time)){
      showToast(`${escapeHtml(tutor.name)} cannot be assigned at ${day} ${fmtInterval(time)} because they already have a CET during this time.`, 'warn', 4200);
      return;
    }
  }

  if(typeof handleScheduleCellClick === 'function'){
    handleScheduleCellClick(day, time);
  }
}


// ══════════════════════════════════════════════════════════════
//  Async CET SG scheduling override
//  Async classes do not use before/after class SG logic; their SG must be
//  manually selected on the CET assignment and then placed into the schedule.
// ══════════════════════════════════════════════════════════════

function isStudyGroupBlockValid(tutor, day, startTime, slots){
  const times = timesForDay(day);
  const startMins = timeToMins(startTime);
  const blockTimes = [startTime, minsToScheduleTime(startMins + 30)];
  if(!blockTimes.every(t => times.includes(t))) return false;
  return blockTimes.every(t => {
    const key = scheduleSlotKey(day, t);
    const slot = scheduleFindSlot(slots, day, t);
    return tutor.avail && tutor.avail[key] === true
      && !(typeof isTutorBusyWithCET === 'function' && isTutorBusyWithCET(tutor, day, t))
      && !scheduleSlotHasTutor(slot, tutor.id);
  });
}

function placeStudyGroupBlock(tutor, cls, assignment, day, startTime, slots, isManual=false){
  const startMins = timeToMins(startTime);
  const blockTimes = [startTime, minsToScheduleTime(startMins + 30)];
  const sgTutor = Object.assign({}, tutor, {
    _type:'sg',
    _sgClassId: cls.id,
    _sgAssignmentId: assignment.id,
    _sgTitle: cls.title || 'Study group'
  });
  blockTimes.forEach(t => {
    const slot = scheduleFindSlot(slots, day, t);
    if(slot && !scheduleSlotHasTutor(slot, tutor.id)) slot.assigned.push(sgTutor);
  });
  assignment.sgStatus = 'scheduled';
  assignment.sgPlacement = {
    day,
    startTime,
    endTime: minsToScheduleTime(startMins + 60),
    weeklyHours: 1,
    manual: !!isManual
  };
  assignment.sgNote = isManual ? 'Study group manually selected for this asynchronous class.' : 'Study group auto-placed next to class time.';
  tutor.assignedHrs = Number(tutor.assignedHrs || 0) + 1;
}

function autoPlaceCETStudyGroups(slots){
  if(typeof normalizeAllCETClasses !== 'function') return [];
  normalizeAllCETClasses();
  const unresolved = [];

  cetClasses.forEach(cls => {
    (cls.assignments || []).forEach(a => {
      if(!(typeof assignmentNeedsStudyGroup === 'function' && assignmentNeedsStudyGroup(cls, a))) return;
      const tutor = getTutorById(a.tutorId);
      if(!tutor){
        a.sgStatus = 'manual-needed';
        a.sgPlacement = null;
        a.sgNote = 'Tutor was not found in the roster.';
        unresolved.push({cls, assignment:a});
        return;
      }

      if(cls.modality === 'async'){
        // Async SG must already be manually selected in the CET assignment.
        if(a.sgPlacement && a.sgPlacement.day && a.sgPlacement.startTime){
          if(isStudyGroupBlockValid(tutor, a.sgPlacement.day, a.sgPlacement.startTime, slots)){
            placeStudyGroupBlock(tutor, cls, a, a.sgPlacement.day, a.sgPlacement.startTime, slots, true);
          } else {
            a.sgStatus = 'manual-needed';
            a.sgNote = 'The selected asynchronous SG time is no longer valid because it is outside CAS hours, overlaps another block, or the tutor is unavailable.';
            unresolved.push({cls, assignment:a});
          }
        } else {
          a.sgStatus = 'manual-needed';
          a.sgPlacement = null;
          a.sgNote = 'Asynchronous class: SG must be manually selected in the CET tutor block.';
          unresolved.push({cls, assignment:a});
        }
        return;
      }

      a.sgStatus = 'pending';
      a.sgPlacement = null;
      a.sgNote = '';

      const candidates = [];
      (a.days || []).forEach(day => {
        const after = a.endTime;
        const before = minsToScheduleTime(timeToMins(a.startTime) - 60);
        candidates.push({day, startTime: after, priority: 'after'});
        candidates.push({day, startTime: before, priority: 'before'});
      });

      const chosen = candidates.find(c => isStudyGroupBlockValid(tutor, c.day, c.startTime, slots));
      if(chosen){
        placeStudyGroupBlock(tutor, cls, a, chosen.day, chosen.startTime, slots, false);
      } else {
        a.sgStatus = 'manual-needed';
        a.sgPlacement = null;
        a.sgNote = 'No available 1-hour SG block immediately before or after the CET class time. Please assign SG manually.';
        unresolved.push({cls, assignment:a});
      }
    });
  });
  return unresolved;
}
