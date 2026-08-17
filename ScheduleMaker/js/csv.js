// ── CSV Import & Drag-and-Drop ──────────────────────────────
function handleCSV(input){
  const file = input.files[0];
  if(!file) return;
  if(!localFileIsAllowed(file,'CSV file')){ input.value=''; return; }
  const reader = new FileReader();
  reader.onload = e => parseCSVText(e.target.result);
  reader.readAsText(file);
  input.value = ''; // reset so same file can be selected again
}


function parseDesiredHours(raw){
  const text = String(raw || '').trim().toLowerCase();
  if(!text) return 8;
  const normalizedRange = text.replace(/[–—]/g, '-');

  // Google Forms answers may come in as labels like "1–5 hrs",
  // "6–10 hrs", "10–15 hrs", or "15–24 hrs (max)".
  if(/\b15\s*(?:-\s*24|\+)/.test(normalizedRange) || text.includes('max')) return 24;
  if(/\b10\s*-\s*15\b/.test(normalizedRange)) return 12;
  if(/\b6\s*-\s*10\b/.test(normalizedRange)) return 8;
  if(/\b1\s*-\s*5\b/.test(normalizedRange)) return 3;

  // Manual CSV can use exact desired hours like 10, 16, 20, etc.
  const n = parseFloat(text.replace(/[^0-9.]/g,''));
  if(!Number.isFinite(n) || n <= 0) return 8;
  return Math.min(24, n);
}



function parseCSVLine(line){
  return parseCSVRecords(String(line || ''))[0] || [];
}

// Parse the whole document so commas and line breaks inside quoted Microsoft
// Forms / Google Forms cells remain part of the cell instead of becoming rows.
function parseCSVRecords(text){
  const records = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];
    if(ch === '"'){
      if(inQuotes && text[i+1] === '"'){
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if(ch === ',' && !inQuotes){
      row.push(cell.trim());
      cell = '';
    } else if((ch === '\n' || ch === '\r') && !inQuotes){
      if(ch === '\r' && text[i+1] === '\n') i++;
      row.push(cell.trim());
      if(row.some(value=>value !== '')) records.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if(row.some(value=>value !== '')) records.push(row);
  return records;
}

function normalizeCSVHeader(value){
  return String(value || '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function csvRowLooksLikeHeader(vals){
  const joined = vals.join(' ').toLowerCase();
  const first = (vals[0] || '').toLowerCase();
  const second = (vals[1] || '').toLowerCase();

  return (
    first.includes('name') ||
    second.includes('email') ||
    joined.includes('desired hours') ||
    joined.includes('phone') ||
    joined.includes('eng 101') ||
    joined.includes('engl c1000') ||
    joined.includes('priority')
  );
}

function normalizeCSVTimeToken(token){
  let s = (token || '').trim().toLowerCase();
  if(!s) return '';

  s = s.replace(/\s+/g,' ');
  s = s.replace(/\./g, ':');
  s = s.replace(/^0+(\d)/, '$1');

  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if(!m) return '';

  let hr = parseInt(m[1], 10);
  const min = m[2] || '00';
  let ap = (m[3] || '').toLowerCase();

  // The app's internal availability keys use 24-hour HH:MM strings like Monday-9:00 and Tuesday-13:00.
  if(ap === 'pm' && hr !== 12) hr += 12;
  if(ap === 'am' && hr === 12) hr = 0;

  if(!ap){
    // For manual CSV, assume app working hours: 9-11 = morning, 12-5 = afternoon.
    if(hr >= 1 && hr <= 5) hr += 12;
  }

  return `${hr}:${min}`;
}

function availabilityKeyFromToken(token){
  let s = (token || '').trim().replace(/"/g,'');
  if(!s) return '';

  const dmap = {
    'mon':'Monday','monday':'Monday',
    'tue':'Tuesday','tues':'Tuesday','tuesday':'Tuesday',
    'wed':'Wednesday','weds':'Wednesday','wednesday':'Wednesday',
    'thu':'Thursday','thur':'Thursday','thurs':'Thursday','thursday':'Thursday',
    'fri':'Friday','friday':'Friday'
  };

  // Accept "Mon 9:00", "Monday 9am", "Tue 1:30pm", etc.
  const m = s.match(/^(mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday)\s+(.+)$/i);
  if(!m) return '';

  const day = dmap[m[1].toLowerCase()];
  const time = normalizeCSVTimeToken(m[2]);

  if(!time) return '';
  return `${day}-${time}`;
}

function firstCSVValue(row, names, fallbackIndex=null){
  for(const name of names){
    if(row[name] !== undefined && String(row[name]).trim() !== '') return row[name];
  }
  if(fallbackIndex !== null && fallbackIndex !== undefined) return row.__vals[fallbackIndex] || '';
  return '';
}

function matchingCSVValue(row, predicate){
  for(const [header,value] of Object.entries(row)){
    if(header !== '__vals' && predicate(header) && String(value || '').trim() !== '') return value;
  }
  return '';
}

function emptyImportedAvailability(){
  const av = {};
  TIMES_MF.forEach(time=>{
    ALL_DAYS.forEach(day=>{
      av[`${day}-${time}`] = day === 'Friday' && !TIMES_FRI.includes(time) ? null : false;
    });
  });
  return av;
}

function isFormsAvailabilityCSV(headers){
  return headers.some(header=>header.startsWith('mondays: select the times')) &&
    headers.some(header=>header.startsWith('anything to add?'));
}

function parseFormsAvailabilityRow(vals, headers){
  const row = {__vals:vals};
  headers.forEach((header,index)=>row[header]=vals[index] || '');

  const name = cleanPlainText(firstCSVValue(row, ['name'], null), 120);
  const contactEmail = matchingCSVValue(row, header=>header.includes('laccd email contact address'));
  const email = cleanPlainText(contactEmail || firstCSVValue(row, ['email'], null), 254);
  const phone = cleanPlainText(matchingCSVValue(row, header=>header.startsWith('what is your phone number')), 40);
  const eng101Raw = matchingCSVValue(row, header=>header.includes('completed eng 101') || header.includes('completed engl c1000'));
  const otherRaw = matchingCSVValue(row, header=>header.startsWith('are you working in another position'));
  const hrsRaw = matchingCSVValue(row, header=>header.startsWith('how many hours are you hoping to work'));
  const stableRaw = matchingCSVValue(row, header=>header.includes('availability likely to change'));
  const notes = cleanPlainText(matchingCSVValue(row, header=>header.startsWith('anything to add?')), 4000);
  const av = emptyImportedAvailability();
  let sat = false;

  const days = {
    mondays:'Monday', tuesdays:'Tuesday', wednesdays:'Wednesday',
    thursdays:'Thursday', fridays:'Friday'
  };

  headers.forEach((header,index)=>{
    const dayPrefix = Object.keys(days).find(prefix=>header.startsWith(`${prefix}:`));
    if(dayPrefix){
      String(vals[index] || '').split(';').forEach(interval=>{
        const start = interval.match(/^\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
        const time = start ? normalizeCSVTimeToken(start[1]) : '';
        const key = time ? `${days[dayPrefix]}-${time}` : '';
        if(key && key in av && av[key] !== null) av[key] = true;
      });
    }
    if(header.startsWith('saturdays:') && String(vals[index] || '').trim()) sat = true;
  });

  const otherMatch = String(otherRaw || '').match(/\d+(?:\.\d+)?/);
  return {
    name,email,phone,
    hrs:parseDesiredHours(hrsRaw),
    other:otherMatch ? Math.min(25, Number(otherMatch[0])) : 0,
    mode:'both',
    sat,
    stable:String(stableRaw || '').toLowerCase().startsWith('maybe') ? 'maybe' : 'stable',
    eng101:yesNoFromText(eng101Raw, 'yes'),
    priority:'agree',
    notes,
    av
  };
}

function yesNoFromText(raw, defaultValue='yes'){
  const text = String(raw || '').trim().toLowerCase();
  if(!text) return defaultValue;
  if(text.includes('disagree') || text === 'no' || text.includes('not') || text.includes('nope')) return 'no';
  if(text.includes('agree') || text === 'yes' || text.includes('completed') || text === 'y') return 'yes';
  return defaultValue;
}

function parseManualCSVRow(vals, headers, hasHeader){
  const row = {__vals: vals};

  if(hasHeader){
    headers.forEach((h,idx)=>row[h]=vals[idx]||'');
  }

  const name = cleanPlainText(firstCSVValue(row, ['name','full name','tutor name'], 0), 120);
  const email = cleanPlainText(firstCSVValue(row, ['email','laccd email','student email','work email'], 1), 254);

  let phone = firstCSVValue(row, ['phone','phone number','cell','cell phone','mobile'], null);
  let hrsRaw = firstCSVValue(row, ['hours','desired hours','hrs','desired hrs','desired hrs / week','desired hours per week'], null);
  let modeRaw = firstCSVValue(row, ['mode','mode preference','modality'], null);
  let satRaw = firstCSVValue(row, ['saturday','sat'], null);
  let eng101Raw = firstCSVValue(row, ['eng101','eng 101','engl c1000','completed eng 101','completed eng 101 / engl c1000','completed eng101'], null);
  let priorityRaw = firstCSVValue(row, ['priority','agree','scheduling priority','priority acknowledgment','scheduling priority acknowledgment'], null);
  let otherRaw = firstCSVValue(row, ['other campus hours','other college hours','other hours','other'], null);
  let stableRaw = firstCSVValue(row, ['stability','schedule stability'], null);

  if(!hasHeader){
    // Supported headerless format:
    // Name, Email, Phone, Desired Hours, Mode, Saturday, ENG101, Priority, Mon 9:00, Mon 9:30...
    // Phone / ENG101 / Priority are optional. Availability can appear anywhere after the basics.
    let yesNoCountAfterSaturday = 0;

    for(let idx=2; idx<vals.length; idx++){
      const v = (vals[idx] || '').trim();
      const low = v.toLowerCase();

      if(!v || availabilityKeyFromToken(v)) continue;

      if(!phone && /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/.test(v)){
        phone = v;
        continue;
      }

      if(!hrsRaw && /^\d+(\.\d+)?$/.test(v)){
        hrsRaw = v;
        continue;
      }

      if(!modeRaw && (low === 'both' || low === 'oc' || low === 'ol' || low.includes('online') || low.includes('person'))){
        modeRaw = v;
        continue;
      }

      if(!satRaw && (low === 'yes' || low === 'no' || low.includes('saturday'))){
        satRaw = v;
        yesNoCountAfterSaturday++;
        continue;
      }

      if(satRaw && !eng101Raw && (low === 'yes' || low === 'no' || low.includes('completed') || low.includes('not yet') || low.includes('eng'))){
        eng101Raw = v;
        continue;
      }

      if(!priorityRaw && (low.includes('agree') || low.includes('disagree'))){
        priorityRaw = v;
        continue;
      }

      if(!stableRaw && (low.includes('stable') || low.includes('maybe') || low.includes('tentative'))){
        stableRaw = v;
        continue;
      }
    }
  }

  const av = emptyImportedAvailability();

  if(hasHeader){
    headers.forEach((h,idx)=>{
      const keyFromHeader = availabilityKeyFromToken(h);
      if(keyFromHeader && keyFromHeader in av){
        const cell = (vals[idx]||'').toLowerCase();
        av[keyFromHeader] = cell==='true'||cell==='1'||cell==='yes'||cell==='available'||cell==='x'||cell==='✓';
      }
    });
  }

  // Always scan the entire row for availability tokens like Mon 9:00, Tue 1pm, etc.
  vals.forEach(token=>{
    const key = availabilityKeyFromToken(token);
    if(key && key in av) av[key] = true;
  });

  const hrs = parseDesiredHours(hrsRaw || '8');
  const modeLow = (modeRaw || 'both').toLowerCase();
  const mode = modeLow.includes('online')&&!modeLow.includes('person')?'ol':modeLow.includes('person')&&!modeLow.includes('online')?'oc':modeLow==='oc'?'oc':modeLow==='ol'?'ol':'both';
  const sat = (satRaw || '').toLowerCase().includes('yes');
  const stable = (stableRaw || 'stable').toLowerCase().includes('tentative')?'tentative':(stableRaw || '').toLowerCase().includes('maybe')?'maybe':'stable';
  const eng101 = yesNoFromText(eng101Raw || 'yes', 'yes');
  const priority = String(priorityRaw || 'agree').toLowerCase().includes('disagree') ? 'disagree' : 'agree';
  const other = parseInt(otherRaw || '0') || 0;

  const notes = cleanPlainText(firstCSVValue(row, ['notes','note','additional notes','comments'], null), 4000);
  return {name,email,phone:cleanPlainText(phone,40),hrs,other,mode,sat,stable,eng101,priority,notes,av};
}

function mergeTutorNotes(existing, incoming){
  const parts = [existing, incoming].map(value=>cleanPlainText(value, 4000)).filter(Boolean);
  return [...new Set(parts)].join('\n\n').slice(0, 4000);
}

function mergeImportedTutor(target, parsed){
  Object.keys(target.avail || {}).forEach(key=>{
    if(parsed.av && parsed.av[key] === true) target.avail[key] = true;
  });
  target.email = parsed.email || target.email;
  target.phone = parsed.phone || target.phone;
  target.eng101 = parsed.eng101 || target.eng101;
  target.priority = parsed.priority || target.priority;
  target.hrs = Math.max(Number(target.hrs)||0, Number(parsed.hrs)||0) || 8;
  target.other = Math.max(Number(target.other)||0, Number(parsed.other)||0);
  target.mode = parsed.mode || target.mode;
  target.sat = target.sat || parsed.sat;
  target.stable = parsed.stable || target.stable;
  target.notes = mergeTutorNotes(target.notes, parsed.notes);
}

function parseCSVText(text){
  if(typeof text !== 'string' || new Blob([text]).size > MAX_LOCAL_FILE_BYTES){
    showStatus('import-status','The pasted CSV is too large. The local safety limit is 5 MB.','err');
    return;
  }
  const records = parseCSVRecords(text);

  if(records.length < 1){
    showStatus('import-status','Paste at least one tutor row before parsing.','err');
    return;
  }

  const firstVals = records[0];
  const hasHeader = csvRowLooksLikeHeader(firstVals);
  const headers = hasHeader ? firstVals.map(normalizeCSVHeader) : [];
  const formsFormat = hasHeader && isFormsAvailabilityCSV(headers);
  const startIndex = hasHeader ? 1 : 0;

  if(records.length <= startIndex){
    showStatus('import-status','The CSV has a header but no tutor rows. Add at least one tutor on the next line.','err');
    return;
  }

  let added = 0;
  let skipped = 0;
  let merged = 0;

  for(let i=startIndex;i<records.length && tutors.length<MAX_TUTOR_RECORDS;i++){
    const vals = records[i];
    if(vals.every(v=>!v)) continue;

    const parsed = formsFormat
      ? parseFormsAvailabilityRow(vals, headers)
      : parseManualCSVRow(vals, headers, hasHeader);
    const name = parsed.name;

    if(!name || name.length < 2){
      skipped++;
      continue;
    }

    const duplicate = tutors.find(t=>(parsed.email && t.email && t.email.toLowerCase()===parsed.email.toLowerCase()) || t.name.toLowerCase()===name.toLowerCase());
    if(duplicate){
      mergeImportedTutor(duplicate, parsed);
      merged++;
      continue;
    }

    tutors.push({
      id:Date.now()+i,
      name:parsed.name,
      email:parsed.email,
      phone:parsed.phone,
      eng101:parsed.eng101,
      priority:parsed.priority,
      hrs:parsed.hrs,
      other:parsed.other,
      mode:parsed.mode,
      sat:parsed.sat,
      stable:parsed.stable,
      notes:parsed.notes,
      avail:parsed.av,
      assignedHrs:0,
      assignments:[],
      manual:false
    });
    added++;
  }

  renderTutors();

  if(added>0){
    const mergeMessage = merged ? ` Merged ${merged} repeated response${merged>1?'s':''}.` : '';
    showStatus('import-status',`Imported ${added} tutor${added>1?'s':''} from CSV.${mergeMessage} Switch to the Roster tab to review or add missing tutors.`,'ok');
    setTimeout(()=>switchPane('tutors'), 1200);
  } else if(merged>0){
    showStatus('import-status',`Updated ${merged} existing tutor response${merged>1?'s':''} from CSV.`,'ok');
  } else {
    showStatus('import-status','No new tutors found. Check that each row starts with name and email, then includes hours/mode/Saturday and availability times.','err');
  }
}

// ── Drag-and-drop on upload zone ─────────────────────────
const DZ = document.getElementById('drop-zone');
DZ.addEventListener('dragover', e=>{ e.preventDefault(); DZ.classList.add('drag'); });
DZ.addEventListener('dragleave', ()=> DZ.classList.remove('drag'));
DZ.addEventListener('drop', e=>{
  e.preventDefault(); DZ.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if(f && localFileIsAllowed(f,'CSV file')){ const r=new FileReader(); r.onload=ev=>parseCSVText(ev.target.result); r.readAsText(f); }
});

// ── Schedule generation ───────────────────────────────────
