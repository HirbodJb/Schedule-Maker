// ── Smart Schedule Analysis ─────────────────────────────────

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
