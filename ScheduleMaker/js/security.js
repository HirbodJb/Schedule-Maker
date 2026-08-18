// Security and privacy boundaries for all user-controlled imports.
const MAX_LOCAL_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TUTOR_RECORDS = 2000;
const MAX_PROJECT_SLOTS = 1000;
const MAX_CET_CLASSES = 1000;
const MAX_CET_ASSIGNMENTS_PER_CLASS = 100;

function cleanPlainText(value, maxLength=200){
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function safeFiniteNumber(value, fallback, min, max){
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function safeRecordId(value, fallback){
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && Number.isSafeInteger(Math.trunc(number))
    ? number
    : fallback;
}

function normalizeAvailabilityMap(source){
  const normalized = {};
  TIMES_MF.forEach(time => {
    ALL_DAYS.forEach(day => {
      const key = `${day}-${time}`;
      normalized[key] = day === 'Friday' && !TIMES_FRI.includes(time)
        ? null
        : !!(source && source[key] === true);
    });
  });
  return normalized;
}

function normalizeTutorRecord(source, fallbackId){
  const raw = source && typeof source === 'object' ? source : {};
  const mode = ['both','oc','ol'].includes(raw.mode) ? raw.mode : 'both';
  const stable = ['stable','maybe','tentative'].includes(raw.stable) ? raw.stable : 'stable';
  return {
    id:safeRecordId(raw.id, fallbackId),
    name:cleanPlainText(raw.name, 120),
    email:cleanPlainText(raw.email, 254),
    phone:cleanPlainText(raw.phone, 40),
    notes:cleanPlainText(raw.notes, 4000),
    eng101:raw.eng101 === 'no' ? 'no' : 'yes',
    hrs:safeFiniteNumber(raw.hrs, 8, 0, 24),
    other:safeFiniteNumber(raw.other, 0, 0, 25),
    mode,
    sat:raw.sat === true,
    stable,
    priority:raw.priority === 'disagree' ? 'disagree' : 'agree',
    avail:normalizeAvailabilityMap(raw.avail),
    assignedHrs:0,
    assignments:[],
    manual:raw.manual === true
  };
}

function normalizeCETProjectState(source, tutorIdMap){
  const rawState = source && typeof source === 'object' ? source : {};
  const rawClasses = Array.isArray(rawState.cetClasses) ? rawState.cetClasses : [];
  if(rawClasses.length > MAX_CET_CLASSES) throw new Error('Project contains too many CET classes');

  const validDays = new Set([...ALL_DAYS, 'Saturday']);
  const validTime = value=>/^\d{1,2}:\d{2}$/.test(String(value || '')) ? String(value) : '';
  const seenClassIds = new Set();

  const cetClasses = rawClasses.map((sourceClass,index)=>{
    const raw = sourceClass && typeof sourceClass === 'object' ? sourceClass : {};
    let id = safeRecordId(raw.id, Date.now() + index + 10000);
    if(seenClassIds.has(String(id))) id = Date.now() + index + 20000;
    seenClassIds.add(String(id));
    const modality = ['in-person','online-live','async'].includes(raw.modality) ? raw.modality : 'in-person';
    const requiresStudyGroup = raw.requiresStudyGroup !== false;
    const rawAssignments = Array.isArray(raw.assignments)
      ? raw.assignments.slice(0, MAX_CET_ASSIGNMENTS_PER_CLASS)
      : [];

    const assignments = rawAssignments.map((sourceAssignment,assignmentIndex)=>{
      const assignment = sourceAssignment && typeof sourceAssignment === 'object' ? sourceAssignment : {};
      const tutorId = tutorIdMap.get(String(assignment.tutorId));
      if(tutorId === undefined) return null;
      const placement = assignment.sgPlacement && typeof assignment.sgPlacement === 'object'
        ? assignment.sgPlacement
        : null;
      const placementDay = placement && validDays.has(placement.day) ? placement.day : '';
      const sgPlacement = placementDay ? {
        day:placementDay,
        startTime:validTime(placement.startTime),
        endTime:validTime(placement.endTime),
        weeklyHours:1,
        manual:placement.manual === true
      } : null;
      return {
        id:safeRecordId(assignment.id, Date.now() + index * 1000 + assignmentIndex + 1),
        tutorId,
        days:modality === 'async' ? [] : [...new Set((Array.isArray(assignment.days) ? assignment.days : []).filter(day=>validDays.has(day)))],
        startTime:modality === 'async' ? '' : validTime(assignment.startTime),
        endTime:modality === 'async' ? '' : validTime(assignment.endTime),
        weeklyHours:safeFiniteNumber(assignment.weeklyHours, 0, 0, 168),
        asyncCoursework:modality === 'async' || assignment.asyncCoursework === true,
        note:cleanPlainText(assignment.note, 500),
        sgStatus:['scheduled','manual-needed','pending','not-needed'].includes(assignment.sgStatus)
          ? assignment.sgStatus
          : (requiresStudyGroup ? 'pending' : 'not-needed'),
        sgPlacement,
        sgNote:cleanPlainText(assignment.sgNote, 500)
      };
    }).filter(Boolean);

    return {
      id,
      title:cleanPlainText(raw.title, 120),
      professor:cleanPlainText(raw.professor, 120),
      semester:cleanPlainText(raw.semester, 80),
      section:cleanPlainText(raw.section, 40),
      status:cleanPlainText(raw.status, 120),
      room:cleanPlainText(raw.room, 240),
      meetingDates:cleanPlainText(raw.meetingDates, 100),
      requestNotes:cleanPlainText(raw.requestNotes, 1000),
      sourceSchedule:cleanPlainText(raw.sourceSchedule, 500),
      modality,
      days:modality === 'async' ? [] : [...new Set((Array.isArray(raw.days) ? raw.days : []).filter(day=>validDays.has(day)))],
      startTime:modality === 'async' ? '' : validTime(raw.startTime),
      endTime:modality === 'async' ? '' : validTime(raw.endTime),
      hrsPerWeek:safeFiniteNumber(raw.hrsPerWeek, 0, 0, 168),
      studyGroupMode:['in-person','online','none'].includes(raw.studyGroupMode) ? raw.studyGroupMode : (requiresStudyGroup ? 'in-person' : 'none'),
      requiresStudyGroup,
      wantsCET:raw.wantsCET !== false,
      assignedTutorId:null,
      assignments
    };
  }).filter(cls=>cls.title);

  return {cetClasses};
}

function normalizeProjectSnapshot(source){
  if(!source || typeof source !== 'object' || !Array.isArray(source.tutors)){
    throw new Error('Invalid project file');
  }
  if(source.tutors.length > MAX_TUTOR_RECORDS){
    throw new Error('Project contains too many tutor records');
  }

  const seenIds = new Set();
  const idMap = new Map();
  const tutors = source.tutors.map((raw, index) => {
    let tutor = normalizeTutorRecord(raw, Date.now() + index + 1);
    if(seenIds.has(String(tutor.id))){
      tutor.id = Date.now() + source.tutors.length + index + 1;
    }
    seenIds.add(String(tutor.id));
    idMap.set(String(raw && raw.id), tutor.id);
    return tutor;
  }).filter(tutor => tutor.name);

  const validDays = new Set(ALL_DAYS);
  const validTimes = new Set([...TIMES_MF, ...TIMES_FRI]);
  const rawSlots = Array.isArray(source.slots) ? source.slots.slice(0, MAX_PROJECT_SLOTS) : [];
  const slots = rawSlots
    .filter(slot => slot && validDays.has(slot.day) && validTimes.has(slot.time))
    .map(slot => ({
      day:slot.day,
      time:slot.time,
      assignedIds:(Array.isArray(slot.assignedIds) ? slot.assignedIds : [])
        .slice(0, 3)
        .map(id => idMap.get(String(id)))
        .filter(id => id !== undefined)
    }));

  const settings = source.scheduleSettings && typeof source.scheduleSettings === 'object'
    ? source.scheduleSettings
    : {};
  const semesterType = ['regular','summer','winter'].includes(settings.semesterType)
    ? settings.semesterType
    : 'regular';
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const rawCETState = source.cetState || source.cet || (Array.isArray(source.cetClasses) ? {cetClasses:source.cetClasses} : {});
  const cetState = normalizeCETProjectState(rawCETState, idMap);

  return {
    tutors,
    slots,
    cetState,
    showAllGaps:source.showAllGaps === true,
    focusedTutorId:idMap.get(String(source.focusedTutorId)) ?? null,
    currentAnalysisReportText:cleanPlainText(source.currentAnalysisReportText, 200000),
    // Analysis HTML is always regenerated locally; never trust markup from a file.
    currentAnalysisReportHTML:'',
    analysisPanelOpen:false,
    scheduleSettings:{
      semesterType,
      weeklyBudget:settings.weeklyBudget == null ? null : safeFiniteNumber(settings.weeklyBudget, null, 0, 168),
      dateFrom:validDate(settings.dateFrom),
      dateTo:validDate(settings.dateTo)
    },
    activePane:['upload','tutors','cet','generate'].includes(source.activePane) ? source.activePane : 'generate'
  };
}

function setSafeRichText(element, value){
  const template = document.createElement('template');
  template.innerHTML = String(value ?? '');
  const allowed = new Set(['STRONG','BR']);
  [...template.content.querySelectorAll('*')].forEach(node => {
    if(allowed.has(node.tagName)){
      [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
    } else {
      node.replaceWith(document.createTextNode(node.textContent || ''));
    }
  });
  element.replaceChildren(template.content.cloneNode(true));
}

function localFileIsAllowed(file, label='file'){
  if(!file) return false;
  if(file.size > MAX_LOCAL_FILE_BYTES){
    showToast(`The selected ${label} is too large. The local safety limit is 5 MB.`, 'warn');
    return false;
  }
  return true;
}
