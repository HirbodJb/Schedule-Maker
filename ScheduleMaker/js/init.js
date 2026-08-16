// ── App initialization ───────────────────────────────────
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

// Keep sensitive roster data out of the browser's back-forward page cache.
// The only durable copy is one the user explicitly downloads.
window.addEventListener('pagehide', ()=>{
  tutors=[];
  avail={};
  currentSlots=[];
  cetClasses=[];
  rosterSearchResults=[];
  scheduleSearchResults=[];
  rosterSearchQuery='';
  scheduleSearchQuery='';
  cetStudyGroupWarnings=[];
  selectedShift=null;
  moveMode=null;
  addHoursMode=null;
  focusedTutorId=null;
  cetFocusedTutorId=null;
  undoSnapshot=null;
  currentAnalysisReportText='';
  currentAnalysisReportHTML='';
  document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea').forEach(input=>{
    if(input.type === 'file') input.value='';
    else if(input.type === 'checkbox' || input.type === 'radio') input.checked=false;
    else input.value='';
  });
  ['tutor-list','gen-out','pane-cet','toast-container'].forEach(id=>{
    const element=document.getElementById(id);
    if(element) element.replaceChildren();
  });
  document.querySelectorAll('[id$="-overlay"], .tutor-quick-summary, #shift-popover').forEach(element=>element.remove());
});
