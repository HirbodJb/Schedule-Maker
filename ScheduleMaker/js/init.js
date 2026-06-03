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

