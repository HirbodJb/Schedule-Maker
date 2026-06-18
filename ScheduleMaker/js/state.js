// ── State ───────────────────────────────────────────────────
let tutors = [];
let avail = {};
let currentSlots = [];
let selectedShift = null;
let moveMode = null;
let showAllGaps = false;
let focusedTutorId = null;
let addHoursMode = null;
let rosterSearchResults = [];
let rosterSearchIndex = -1;
let rosterSearchQuery = '';
let scheduleSearchResults = [];
let scheduleSearchIndex = -1;
let scheduleSearchQuery = '';
let currentAnalysisReportText = '';
let currentAnalysisReportHTML = '';
let analysisPanelOpen = false;
let undoSnapshot = null;
let undoLabel = '';
let undoMeta = null;
let scheduleSettings = {semesterType:'regular', weeklyBudget:null, dateFrom:'', dateTo:''};
let cetClasses = [];
let cetFocusedTutorId = null;
let cetStudyGroupWarnings = [];

// ── Availability table ───────────────────────────────────
