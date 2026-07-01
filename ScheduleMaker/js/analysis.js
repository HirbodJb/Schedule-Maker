// ── Smart Schedule Analysis ─────────────────────────────────

function clampScore(value){
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Schedule analysis now understands three different visual/work block types:
// 1) regular tutoring-center schedule blocks (normal assigned tutors)
// 2) SG blocks (_type === 'sg')
// 3) display-only CET class blocks (_type === 'cet-display')
function analysisGetCETBlocksForSlot(day, time){
  if(typeof getCETDisplayBlocksForSlot === 'function'){
    return getCETDisplayBlocksForSlot(day, time) || [];
  }
  return [];
}

function analysisSlotItems(slot){
  if(!slot) return [];
  return [
    ...(slot.assigned || []),
    ...analysisGetCETBlocksForSlot(slot.day, slot.time)
  ];
}

function analysisRegularItems(slot){
  return (slot && slot.assigned ? slot.assigned : []).filter(x => !x._type);
}

function analysisSGItems(slot){
  return (slot && slot.assigned ? slot.assigned : []).filter(x => x._type === 'sg');
}

function analysisCETItems(slot){
  return analysisGetCETBlocksForSlot(slot.day, slot.time).filter(x => x._type === 'cet-display');
}

function analysisSlotHasAnyWork(slot){
  return analysisSlotItems(slot).length > 0;
}

function analysisSlotHasTutorWork(slot, tutorId){
  return analysisSlotItems(slot).some(x => String(x.id) === String(tutorId));
}

function analysisCETSummary(slots=currentSlots){
  if(typeof normalizeAllCETClasses === 'function') normalizeAllCETClasses();

  let cetAssignmentCount = 0;
  let cetAssignedHours = 0;
  let sgRequiredCount = 0;
  let sgScheduledCount = 0;
  let sgManualNeededCount = 0;
  const unresolvedSG = [];

  if(typeof cetClasses !== 'undefined' && Array.isArray(cetClasses)){
    cetClasses.forEach(cls => {
      (cls.assignments || []).forEach(a => {
        cetAssignmentCount++;
        cetAssignedHours += Number(a.weeklyHours || 0);

        if(typeof assignmentNeedsStudyGroup === 'function' && assignmentNeedsStudyGroup(cls, a)){
          sgRequiredCount++;
          if(a.sgStatus === 'scheduled' && a.sgPlacement){
            sgScheduledCount++;
          } else {
            sgManualNeededCount++;
            unresolvedSG.push({cls, assignment:a});
          }
        }
      });
    });
  }

  const cetDisplaySlotItems = slots.reduce((sum, slot)=>sum + analysisCETItems(slot).length, 0);
  const sgSlotItems = slots.reduce((sum, slot)=>sum + analysisSGItems(slot).length, 0);
  const regularSlotItems = slots.reduce((sum, slot)=>sum + analysisRegularItems(slot).length, 0);

  const cetVisibleSlots = slots.filter(slot=>analysisCETItems(slot).length > 0);
  const sgVisibleSlots = slots.filter(slot=>analysisSGItems(slot).length > 0);

  return {
    cetAssignmentCount,
    cetAssignedHours,
    cetDisplaySlotItems,
    cetVisibleSlotCount: cetVisibleSlots.length,
    cetVisibleHours: cetDisplaySlotItems * 0.5,
    sgRequiredCount,
    sgScheduledCount,
    sgManualNeededCount,
    sgSlotItems,
    sgVisibleSlotCount: sgVisibleSlots.length,
    sgVisibleHours: sgSlotItems * 0.5,
    regularSlotItems,
    regularHours: regularSlotItems * 0.5,
    unresolvedSG
  };
}

function calculateScheduleQuality(slots=currentSlots){
  const totalSlots = slots.length || 1;

  // For the overall quality score, CET and SG are treated as real scheduled work.
  // A slot with only CET display is not treated as an empty gap anymore.
  const workCoveredSlots = slots.filter(s=>analysisSlotHasAnyWork(s));
  const trueOpenSlots = slots.filter(s=>!analysisSlotHasAnyWork(s));

  // Thin coverage still means regular CAS tutoring-center backup is thin.
  // SG/CET blocks are real work, but they do not act as extra drop-in tutoring backup.
  const thinCoverage = slots.filter(s=>{
    const regular = analysisRegularItems(s).length;
    return regular > 0 && regular < 2;
  });

  const coverageScore = clampScore((workCoveredSlots.length / totalSlots) * 100);

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
        if(slot && analysisSlotHasTutorWork(slot, tutor.id)){
          run++;
          longestRun = Math.max(longestRun, run);
        } else {
          run = 0;
        }
      });
    });
  });
  const consecutiveScore = clampScore(longestRun <= maxRunSlots ? 100 : 100 - ((longestRun - maxRunSlots) * 18));

  const uncoveredScore = clampScore(100 - ((trueOpenSlots.length / totalSlots) * 100));
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
    uncoveredCount: trueOpenSlots.length,
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
  const availabilityCount = tutor => Object.values(tutor.avail || {}).filter(v=>v===true).length;
  const percentAssigned = tutor => tutor.hrs ? tutor.assignedHrs / tutor.hrs : 0;
  const esc = escapeHtml;

  const totalDesired=tutors.reduce((sum,t)=>sum+t.hrs,0);
  const totalAssigned=tutors.reduce((sum,t)=>sum+t.assignedHrs,0);

  const regularCoveredSlots=currentSlots.filter(s=>analysisRegularItems(s).length>0);
  const workCoveredSlots=currentSlots.filter(s=>analysisSlotHasAnyWork(s));
  const trueOpenSlots=currentSlots.filter(s=>!analysisSlotHasAnyWork(s));
  const thinCoverage=currentSlots.filter(s=>analysisRegularItems(s).length>0 && analysisRegularItems(s).length<2);
  const sgSlots=currentSlots.filter(s=>analysisSGItems(s).length>0);
  const cetSlots=currentSlots.filter(s=>analysisCETItems(s).length>0);
  const quality=calculateScheduleQuality(currentSlots);
  const cetSummary=analysisCETSummary(currentSlots);

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
    const regularAssigned=daySlots.reduce((sum,s)=>sum+analysisRegularItems(s).length,0);
    const sgAssigned=daySlots.reduce((sum,s)=>sum+analysisSGItems(s).length,0);
    const cetAssigned=daySlots.reduce((sum,s)=>sum+analysisCETItems(s).length,0);
    const open=daySlots.filter(s=>!analysisSlotHasAnyWork(s)).length;
    const thin=daySlots.filter(s=>analysisRegularItems(s).length>0 && analysisRegularItems(s).length<2).length;
    return {day, regularAssigned, sgAssigned, cetAssigned, uncovered:open, thin, total:daySlots.length};
  });

  const weakestDays=dayStats
    .filter(d=>d.uncovered>0 || d.thin>0)
    .sort((a,b)=>(b.uncovered-a.uncovered) || (b.thin-a.thin))
    .slice(0,3);

  // Detect long continuous work blocks per tutor/day, including CET and SG.
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
        const assigned=slot && analysisSlotHasTutorWork(slot, tutor.id);
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

  // Detect inconvenient split shifts: same tutor has separate work blocks on
  // the same day with a long empty gap between them. This is the main comfort
  // issue v2.1 tries to reduce during generation.
  const splitShiftGaps=[];
  tutors.forEach(tutor=>{
    ALL_DAYS.forEach(day=>{
      const times=slotTimesForDay(day);
      const blocks=[];
      let blockStart=null, blockEnd=null;

      const flushBlock=()=>{
        if(blockStart!==null){
          blocks.push({start:blockStart, end:blockEnd});
        }
        blockStart=null;
        blockEnd=null;
      };

      times.forEach(time=>{
        const slot=getSlot(day,time);
        const assigned=slot && analysisSlotHasTutorWork(slot, tutor.id);
        if(assigned){
          if(blockStart===null) blockStart=time;
          blockEnd=time;
        } else {
          flushBlock();
        }
      });
      flushBlock();

      for(let i=1;i<blocks.length;i++){
        const prev=blocks[i-1];
        const next=blocks[i];
        const prevEndIndex=times.indexOf(prev.end) + 1;
        const nextStartIndex=times.indexOf(next.start);
        const gapSlots=Math.max(0, nextStartIndex - prevEndIndex);
        const gapHours=gapSlots * 0.5;
        if(gapHours >= 1){
          const prevEndTime = times[prevEndIndex] || 'end';
          splitShiftGaps.push({
            tutor,
            day,
            gapHours,
            from: prevEndTime,
            to: next.start,
            prevStart: prev.start,
            prevEnd: prevEndTime,
            nextStart: next.start
          });
        }
      }
    });
  });
  splitShiftGaps.sort((a,b)=>b.gapHours-a.gapHours);


  // Concrete gap suggestions: only true open slots are suggested.
  // Slots already occupied by CET/SG are not treated as empty tutoring gaps.
  const gapSuggestions=[];
  trueOpenSlots.slice(0,14).forEach(slot=>{
    const available=tutors
      .filter(t=>{
        const key=slot.day+'-'+slot.time;
        const cetBusy = typeof isTutorBusyWithCET === 'function' && isTutorBusyWithCET(t, slot.day, slot.time);
        return t.avail[key]===true && !cetBusy;
      })
      .sort((a,b)=>(percentAssigned(a)-percentAssigned(b)) || (a.assignedHrs-b.assignedHrs));

    const underAvailable=available.filter(t=>t.assignedHrs<t.hrs);
    const best=(underAvailable.length?underAvailable:available).slice(0,3);
    gapSuggestions.push({slot, best, hasAvailable:available.length>0, onlyMaxed:available.length>0 && !underAvailable.length});
  });

  const noAvailableGaps=gapSuggestions.filter(g=>!g.hasAvailable);
  const possibleFitGaps=gapSuggestions.filter(g=>g.hasAvailable && !g.onlyMaxed);
  const maxedGaps=gapSuggestions.filter(g=>g.onlyMaxed);

  // Simple swap/move suggestions use regular tutoring blocks only.
  const moveSuggestions=[];
  currentSlots.forEach(slot=>{
    if(moveSuggestions.length>=8) return;
    const regularHere=analysisRegularItems(slot);
    if(!regularHere.length) return;

    const underCandidates=tutors
      .filter(t=>{
        const key=slot.day+'-'+slot.time;
        const cetBusy = typeof isTutorBusyWithCET === 'function' && isTutorBusyWithCET(t, slot.day, slot.time);
        return t.avail[key]===true && !cetBusy && !regularHere.some(a=>String(a.id)===String(t.id)) && t.assignedHrs<t.hrs*0.75;
      })
      .sort((a,b)=>percentAssigned(a)-percentAssigned(b));

    const heavyAssigned=regularHere
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
  textLines.push(`Quality factors: work coverage ${quality.coverageScore}%, fairness ${quality.fairnessScore}%, consecutive-hours comfort ${quality.consecutiveScore}%, balanced assignments ${quality.balancedAssignmentsScore}%, open-slot control ${quality.uncoveredScore}%.`);
  textLines.push('');
  textLines.push(`Overall: ${totalAssigned.toFixed(1)} of ${totalDesired} requested tutor-hours are scheduled, including CET and SG commitments.`);
  textLines.push(`Coverage: ${regularCoveredSlots.length} regular tutoring slots, ${sgSlots.length} SG slot(s), ${cetSlots.length} visible CET slot(s), and ${trueOpenSlots.length} truly open slot(s).`);
  textLines.push(`CET/SG: ${cetSummary.cetAssignmentCount} CET assignment(s), ${cetSummary.cetAssignedHours.toFixed(1)} CET class/coursework hour(s), ${cetSummary.sgScheduledCount}/${cetSummary.sgRequiredCount} study group(s) placed.`);
  textLines.push('');

  const mainFindings=[];
  mainFindings.push(`Schedule quality score: ${quality.overall}% (${quality.label}). This now counts CET and SG as real work blocks, while regular tutoring coverage is still reviewed separately.`);
  if(trueOpenSlots.length===0 && thinCoverage.length===0){
    mainFindings.push('Strong coverage: every visible work/open time slot has coverage, and no regular tutoring slot is limited to only one tutor.');
  } else {
    if(trueOpenSlots.length) mainFindings.push(`${trueOpenSlots.length} slots are completely open with no regular tutor, SG, or CET display. First few: ${trueOpenSlots.slice(0,6).map(slotLabel).join('; ')}${trueOpenSlots.length>6?'…':''}`);
    if(thinCoverage.length) mainFindings.push(`${thinCoverage.length} regular tutoring slots have only one tutor. Review these if backup coverage is important.`);
  }
  if(cetSummary.cetAssignmentCount) mainFindings.push(`${cetSummary.cetAssignmentCount} CET assignment(s) are included in tutor workload and shown separately from regular tutoring coverage.`);
  if(cetSummary.sgRequiredCount) mainFindings.push(`${cetSummary.sgScheduledCount} of ${cetSummary.sgRequiredCount} required study group(s) are placed.`);
  if(cetSummary.sgManualNeededCount) mainFindings.push(`${cetSummary.sgManualNeededCount} study group(s) still need manual time.`);
  if(weakestDays.length) mainFindings.push(`Weakest day(s): ${weakestDays.map(d=>`${d.day} (${d.uncovered} open, ${d.thin} thin regular tutoring)`).join('; ')}.`);
  mainFindings.push(overAssigned.length ? `Over-assigned tutor(s): ${overAssigned.map(t=>`${t.name} ${t.assignedHrs.toFixed(1)}/${t.hrs}h`).join('; ')}.` : 'No tutor is over their requested weekly hours.');

  textLines.push('1) Main findings');
  mainFindings.forEach(x=>textLines.push(`• ${x}`));
  textLines.push('');

  textLines.push('2) CET and study group check');
  if(cetSummary.cetAssignmentCount){
    textLines.push(`• CET commitments: ${cetSummary.cetAssignmentCount} assignment(s), ${cetSummary.cetAssignedHours.toFixed(1)}h class/coursework, ${cetSummary.cetVisibleHours.toFixed(1)}h visible meeting-time blocks on the grid.`);
  } else {
    textLines.push('• No CET assignments are currently active.');
  }
  if(cetSummary.sgRequiredCount){
    textLines.push(`• Study groups: ${cetSummary.sgScheduledCount}/${cetSummary.sgRequiredCount} placed, ${cetSummary.sgManualNeededCount} unresolved.`);
    cetSummary.unresolvedSG.slice(0,6).forEach(({cls, assignment:a})=>{
      const tutor = typeof getTutorById === 'function' ? getTutorById(a.tutorId) : null;
      textLines.push(`  - ${tutor ? tutor.name : 'Tutor'} — ${cls.title || 'CET class'}: ${a.sgNote || 'Study group needs manual time.'}`);
    });
  } else {
    textLines.push('• No required study groups detected.');
  }
  textLines.push('');

  textLines.push('3) Tutor balance');
  if(underAssigned.length){
    underAssigned.slice(0,8).forEach(t=>textLines.push(`• ${t.name}: ${t.assignedHrs.toFixed(1)}/${t.hrs}h assigned (${Math.round(percentAssigned(t)*100)}%). Availability slots marked: ${availabilityCount(t)}.`));
  } else {
    textLines.push('• Tutor hours look balanced. Everyone is assigned at least about 75% of requested hours, including CET/SG time.');
  }
  if(veryUnderAssigned.length) textLines.push(`• Possible incomplete availability: ${veryUnderAssigned.map(t=>t.name).join(', ')}. These tutors received very low hours and may need to submit more available times.`);
  if(lowAvailability.length) textLines.push(`• Low availability forms to double-check: ${lowAvailability.slice(0,6).map(x=>`${x.t.name} (${x.count} slots)`).join('; ')}.`);
  textLines.push('');

  textLines.push('4) Coverage suggestions');
  if(gapSuggestions.length){
    if(noAvailableGaps.length){
      textLines.push('• The following open slots have no tutor marked available and are not occupied by CET/SG. Ask tutors for more availability during these times:');
      noAvailableGaps.forEach(g=>textLines.push(`  - ${slotLabel(g.slot)}`));
    }
    if(possibleFitGaps.length){
      textLines.push('• Possible fits for truly open slots:');
      possibleFitGaps.forEach(g=>textLines.push(`  - ${slotLabel(g.slot)}: ${g.best.map(t=>`${t.name} (${t.assignedHrs.toFixed(1)}/${t.hrs}h)`).join(', ')}`));
    }
    if(maxedGaps.length){
      textLines.push('• Available tutors exist but are already at/near requested hours:');
      maxedGaps.forEach(g=>textLines.push(`  - ${slotLabel(g.slot)}: ${g.best.map(t=>t.name).join(', ')}`));
    }
  } else {
    textLines.push('• No truly open slots. Use the thin regular tutoring list only if stronger backup coverage is needed.');
  }
  textLines.push('');

  textLines.push('5) Workload comfort check');
  if(longRuns.length){
    longRuns.slice(0,6).forEach(r=>textLines.push(`• ${r.tutor.name} has a long continuous work block on ${r.day}: ${fmtTime(r.start)}–${r.end==='end'?'end':fmtTime(r.end)} (${r.hours.toFixed(1)}h). This includes regular tutoring, CET, and SG blocks. Consider a break or split if needed.`));
  } else {
    textLines.push('• No very long continuous work blocks detected.');
  }
  if(splitShiftGaps.length){
    textLines.push('• Split-shift gaps to review:');
    splitShiftGaps.slice(0,8).forEach(g=>textLines.push(`  - ${g.tutor.name} on ${g.day}: ${fmtTime(g.from)}–${fmtTime(g.to)} empty gap (${g.gapHours.toFixed(1)}h) between work blocks.`));
  } else {
    textLines.push('• No major same-day split-shift gaps detected.');
  }
  textLines.push('');

  const nextSteps=[];
  if(cetSummary.sgManualNeededCount) nextSteps.push('Resolve the study group(s) that still need manual time before finalizing the schedule.');
  if(trueOpenSlots.length) nextSteps.push('Review truly open slots first, especially ones with no available tutors marked.');
  if(underAssigned.length) nextSteps.push('Ask the most under-assigned tutors if they can add more availability or take backup shifts.');
  if(moveSuggestions.length){
    const m=moveSuggestions[0];
    nextSteps.push(`Try one balancing move: consider using ${m.add.name} at ${slotLabel(m.slot)} instead of relying heavily on ${m.reduce.name}.`);
  }
  if(longRuns.length) nextSteps.push('Check long continuous work blocks and decide whether those tutors need a break.');
  if(splitShiftGaps.length) nextSteps.push('Review split-shift gaps. The v2.1 generator tries to reduce these, but manual edits may still improve individual tutor comfort.');
  nextSteps.push('After manual edits, click Re-analyze schedule to re-check balance, CET, SG, and coverage.');

  textLines.push('6) Suggested next steps');
  nextSteps.slice(0,6).forEach((step,i)=>textLines.push(`${i+1}. ${step}`));

  const li = arr => arr.map(x=>`<li>${esc(x)}</li>`).join('');
  const compactLi = arr => arr.map(x=>`<li>${esc(x)}</li>`).join('');

  const cetStudyGroupHTML = `
    <div class="analysis-summary mini">
      <div class="analysis-metric"><strong>${cetSummary.cetAssignmentCount}</strong><span>CET assignments</span></div>
      <div class="analysis-metric"><strong>${cetSummary.cetAssignedHours.toFixed(1)}h</strong><span>CET class/coursework</span></div>
      <div class="analysis-metric"><strong>${cetSummary.sgScheduledCount} / ${cetSummary.sgRequiredCount}</strong><span>Study groups placed</span></div>
      <div class="analysis-metric"><strong>${cetSummary.sgManualNeededCount}</strong><span>SG needing time</span></div>
    </div>
    ${cetSummary.sgManualNeededCount ? `<div class="analysis-note"><strong>Study groups needing manual time:</strong><ul class="analysis-list compact">${cetSummary.unresolvedSG.slice(0,8).map(({cls, assignment:a})=>{
      const tutor = typeof getTutorById === 'function' ? getTutorById(a.tutorId) : null;
      return `<li>${esc(tutor ? tutor.name : 'Tutor')} — ${esc(cls.title || 'CET class')}: ${esc(a.sgNote || 'Study group needs manual time.')}</li>`;
    }).join('')}</ul></div>` : `<div class="analysis-empty">No unresolved study groups detected.</div>`}
  `;

  const tutorBalanceHTML = underAssigned.length
    ? `<ul class="analysis-list">${underAssigned.slice(0,8).map(t=>`<li><strong>${esc(t.name)}</strong>: ${t.assignedHrs.toFixed(1)}/${t.hrs}h assigned (${Math.round(percentAssigned(t)*100)}%). Availability slots marked: ${availabilityCount(t)}. CET/SG time is included in this total.</li>`).join('')}</ul>`
    : `<div class="analysis-empty">Tutor hours look balanced. Everyone is assigned at least about 75% of requested hours, including CET/SG time.</div>`;

  const coverageHTML = gapSuggestions.length ? `
    ${noAvailableGaps.length ? `<div class="analysis-note">The slots below are truly open: no regular tutor, no SG, and no CET display. Ask tutors for more availability during these times.</div><ul class="analysis-list compact">${compactLi(noAvailableGaps.map(g=>slotLabel(g.slot)))}</ul>` : ''}
    ${possibleFitGaps.length ? `<p><strong>Possible fits for truly open slots:</strong></p><ul class="analysis-list">${possibleFitGaps.map(g=>`<li><strong>${esc(slotLabel(g.slot))}</strong>: ${g.best.map(t=>`${esc(t.name)} (${t.assignedHrs.toFixed(1)}/${t.hrs}h)`).join(', ')}</li>`).join('')}</ul>` : ''}
    ${maxedGaps.length ? `<p><strong>Available tutors exist but are already at/near requested hours:</strong></p><ul class="analysis-list compact">${maxedGaps.map(g=>`<li>${esc(slotLabel(g.slot))}: ${g.best.map(t=>esc(t.name)).join(', ')}</li>`).join('')}</ul>` : ''}
  ` : `<div class="analysis-empty">No truly open slots. Use the thin regular tutoring list only if stronger backup coverage is needed.</div>`;

  const longRunHTML = longRuns.length
    ? `<ul class="analysis-list">${longRuns.slice(0,6).map(r=>`<li><strong>${esc(r.tutor.name)}</strong> has a long continuous work block on ${r.day}: ${fmtTime(r.start)}–${r.end==='end'?'end':fmtTime(r.end)} (${r.hours.toFixed(1)}h). This includes regular tutoring, CET, and SG blocks. Consider a break or split if needed.</li>`).join('')}</ul>`
    : `<div class="analysis-empty">No very long continuous work blocks detected.</div>`;

  const splitShiftHTML = splitShiftGaps.length
    ? `<div class="analysis-note"><strong>Split-shift gaps to review:</strong></div><ul class="analysis-list">${splitShiftGaps.slice(0,8).map(g=>`<li><strong>${esc(g.tutor.name)}</strong> on ${g.day}: ${fmtTime(g.from)}–${fmtTime(g.to)} empty gap (${g.gapHours.toFixed(1)}h) between work blocks.</li>`).join('')}</ul>`
    : `<div class="analysis-empty">No major same-day split-shift gaps detected.</div>`;

  const workloadHTML = longRunHTML + splitShiftHTML;

  const htmlReport=`
    <div class="quality-score-card">
      <div class="quality-score-top">
        <div class="quality-score-number">${quality.overall}%</div>
        <div>
          <div class="quality-score-label">Schedule Quality: ${esc(quality.label)}</div>
          <div class="quality-score-sub">Based on work coverage, fairness, continuous hours, balanced assignments, open slots, and CET/SG status.</div>
        </div>
      </div>
      <div class="quality-score-bars">
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Work Coverage" data-tip-text="Counts regular tutoring, study group, and visible CET blocks as scheduled work. CET-only blocks are no longer treated as empty gaps.">
          <strong>${quality.coverageScore}%</strong>
          <span>Work coverage</span>
        </div>
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Fairness" data-tip-text="Checks whether tutor hours are distributed evenly. CET and SG hours are included in assigned totals.">
          <strong>${quality.fairnessScore}%</strong>
          <span>Fairness</span>
        </div>
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Break Balance" data-tip-text="Rewards schedules that avoid excessively long continuous work blocks, including regular tutoring, CET, and SG.">
          <strong>${quality.consecutiveScore}%</strong>
          <span>Break balance</span>
        </div>
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Balance" data-tip-text="Measures how closely assigned hours match each tutor’s requested weekly hours, including CET/SG commitments.">
          <strong>${quality.balancedAssignmentsScore}%</strong>
          <span>Balance</span>
        </div>
        <div class="quality-score-piece" onmouseenter="showQualityTooltip(event, this)" onmousemove="moveQualityTooltip(event)" onmouseleave="hideQualityTooltip()" data-tip-title="Open Slots" data-tip-text="Penalizes slots that have no regular tutor, no study group, and no visible CET block.">
          <strong>${quality.uncoveredScore}%</strong>
          <span>Open slots</span>
        </div>
      </div>
    </div>

    <div class="analysis-summary">
      <div class="analysis-metric"><strong>${totalAssigned.toFixed(1)} / ${totalDesired}</strong><span>Total assigned hours</span></div>
      <div class="analysis-metric"><strong>${regularCoveredSlots.length}</strong><span>Regular tutoring slots</span></div>
      <div class="analysis-metric"><strong>${sgSlots.length}</strong><span>SG visible slots</span></div>
      <div class="analysis-metric"><strong>${cetSlots.length}</strong><span>CET visible slots</span></div>
      <div class="analysis-metric"><strong>${trueOpenSlots.length}</strong><span>Truly open slots</span></div>
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-search"></i> 1) Main findings</h4>
      <ul class="analysis-list">${li(mainFindings)}</ul>
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-school"></i> 2) CET and study group check</h4>
      ${cetStudyGroupHTML}
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-scale"></i> 3) Tutor balance</h4>
      ${tutorBalanceHTML}
      ${veryUnderAssigned.length ? `<p><strong>Possible incomplete availability:</strong> ${esc(veryUnderAssigned.map(t=>t.name).join(', '))}. These tutors received very low hours and may need to submit more available times.</p>` : ''}
      ${lowAvailability.length ? `<p><strong>Low availability forms to double-check:</strong> ${esc(lowAvailability.slice(0,6).map(x=>`${x.t.name} (${x.count} slots)`).join('; '))}.</p>` : ''}
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-calendar-exclamation"></i> 4) Coverage suggestions</h4>
      ${coverageHTML}
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-clock-pause"></i> 5) Workload comfort check</h4>
      ${workloadHTML}
    </div>

    <div class="analysis-section">
      <h4><i class="ti ti-list-check"></i> 6) Suggested next steps</h4>
      <ul class="analysis-list">${nextSteps.slice(0,6).map((step,i)=>`<li><strong>${i+1}.</strong> ${esc(step)}</li>`).join('')}</ul>
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
