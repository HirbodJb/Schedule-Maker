// ── Add Tutor Manually & Clear All ──────────────────────────
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
