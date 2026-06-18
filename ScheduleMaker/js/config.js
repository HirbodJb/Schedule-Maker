// ── App metadata / authorship ───────────────────────────────
const APP_METADATA = Object.freeze({
  createdBy: 'Hirbod Jabbarnezhad',
  software: 'CAS ESL Schedule Builder',
  version: '2.0',
  year: '2026',
  copyright: 'Copyright (c) 2026 Hirbod Jabbarnezhad',
  attribution: 'Originally designed and developed by Hirbod Jabbarnezhad. Attribution should remain included in shared or modified copies.'
});

function appMetadata(){
  return {
    ...APP_METADATA,
    exportedAt: new Date().toISOString()
  };
}

function metadataComment(){
  return `<!-- ${JSON.stringify(appMetadata())} -->`;
}

function metadataHiddenBlock(){
  return `<pre style="display:none" data-cas-esl-metadata="true">${escapeHtml(JSON.stringify(appMetadata(), null, 2))}</pre>`;
}

// ── Constants ────────────────────────────────────────────
// ── Constants ───────────────────────────────────────────────
const DAYS_MF = ['Monday','Tuesday','Wednesday','Thursday'];
const TIMES_MF = ['9:00','9:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];
const TIMES_FRI = ['10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30'];
const ALL_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

// Work policy: a tutor may not be scheduled for more than 4 consecutive hours.
// Since the schedule uses 30-minute slots, 4 hours = 8 back-to-back slots.
// After that, the tutor must have at least one 30-minute break before being assigned again.
const MAX_CONSECUTIVE_WORK_SLOTS = 8;

function timesForDay(day){
  return day === 'Friday' ? TIMES_FRI : TIMES_MF;
}

const COLORS = [
  {bg:'#fdf0ef',text:'#a93226',border:'#e8a09a'},
  {bg:'#E6F1FB',text:'#0C447C',border:'#B5D4F4'},
  {bg:'#EAF3DE',text:'#27500A',border:'#C0DD97'},
  {bg:'#FAEEDA',text:'#633806',border:'#FAC775'},
  {bg:'#EEEDFE',text:'#3C3489',border:'#AFA9EC'},
  {bg:'#FBEAF0',text:'#72243E',border:'#ED93B1'},
  {bg:'#E1F5EE',text:'#085041',border:'#5DCAA5'},
  {bg:'#F1EFE8',text:'#444441',border:'#B4B2A9'},
  {bg:'#FCEBEB',text:'#791F1F',border:'#F09595'},
  {bg:'#fdf5e8',text:'#633806',border:'#FAC775'},
];

// ── State ────────────────────────────────────────────────
