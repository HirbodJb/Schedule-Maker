// ── CSV Import & Drag-and-Drop ──────────────────────────────
function handleCSV(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => parseCSVText(e.target.result);
  reader.readAsText(file);
  input.value = ''; // reset so same file can be selected again
}


function parseDesiredHours(raw){
  const text = String(raw || '').trim().toLowerCase();
  if(!text) return 8;

  // Google Forms answers may come in as labels like "1–5 hrs",
  // "6–10 hrs", "10–15 hrs", or "15–24 hrs (max)".
  if(text.includes('15') && (text.includes('24') || text.includes('+') || text.includes('max'))) return 24;
  if(text.includes('10') && text.includes('15')) return 12;
  if(text.includes('6') && text.includes('10')) return 8;
  if(text.includes('1') && text.includes('5')) return 3;

  // Manual CSV can use exact desired hours like 10, 16, 20, etc.
  const n = parseFloat(text.replace(/[^0-9.]/g,''));
  if(!Number.isFinite(n) || n <= 0) return 8;
  return Math.min(24, n);
}



function parseCSVLine(line){
  const out = [];
  let cur = '';
  let inQuotes = false;

  for(let i=0;i<line.length;i++){
    const ch = line[i];

    if(ch === '"'){
      if(inQuotes && line[i+1] === '"'){
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if(ch === ',' && !inQuotes){
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }

  out.push(cur.trim());
  return out.map(v => v.replace(/^"|"$/g,'').trim());
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

  const name = firstCSVValue(row, ['name','full name','tutor name'], 0);
  const email = firstCSVValue(row, ['email','laccd email','student email','work email'], 1);

  let phone = firstCSVValue(row, ['phone','phone number','cell','cell phone','mobile'], null);
  let hrsRaw = firstCSVValue(row, ['hours','desired hours','hrs','desired hrs','desired hrs / week','desired hours per week'], null);
  let modeRaw = firstCSVValue(row, ['mode','mode preference','modality'], null);
  let satRaw = firstCSVValue(row, ['saturday','sat'], null);
  let eng101Raw = firstCSVValue(row, ['eng101','eng 101','engl c1000','completed eng 101','completed eng 101 / engl c1000','completed eng101'], null);
  let priorityRaw = firstCSVValue(row, ['priority','agree','scheduling priority','priority acknowledgment','scheduling priority acknowledgment'], null);
  let otherRaw = firstCSVValue(row, ['other campus hours','other hours','other','other pierce hours'], null);
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

  const av = {};
  Object.keys(avail).forEach(k=>av[k]=false);

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

  return {name,email,phone,hrs,other,mode,sat,stable,eng101,priority,av};
}

function parseCSVText(text){
  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim());

  if(lines.length < 1){
    showStatus('import-status','Paste at least one tutor row before parsing.','err');
    return;
  }

  const firstVals = parseCSVLine(lines[0]);
  const hasHeader = csvRowLooksLikeHeader(firstVals);
  const headers = hasHeader ? firstVals.map(h=>h.trim().replace(/"/g,'').toLowerCase()) : [];
  const startIndex = hasHeader ? 1 : 0;

  if(lines.length <= startIndex){
    showStatus('import-status','The CSV has a header but no tutor rows. Add at least one tutor on the next line.','err');
    return;
  }

  let added = 0;
  let skipped = 0;

  for(let i=startIndex;i<lines.length;i++){
    const vals = parseCSVLine(lines[i]);
    if(vals.every(v=>!v)) continue;

    const parsed = parseManualCSVRow(vals, headers, hasHeader);
    const name = parsed.name;

    if(!name || name.length < 2){
      skipped++;
      continue;
    }

    if(tutors.find(t=>t.name.toLowerCase()===name.toLowerCase())){
      skipped++;
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
      avail:parsed.av,
      assignedHrs:0,
      assignments:[],
      manual:false
    });
    added++;
  }

  renderTutors();

  if(added>0){
    showStatus('import-status',`Imported ${added} tutor${added>1?'s':''} from CSV. Switch to the Roster tab to review or add missing tutors.`,'ok');
    setTimeout(()=>switchPane('tutors'), 1200);
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
  if(f){ const r=new FileReader(); r.onload=ev=>parseCSVText(ev.target.result); r.readAsText(f); }
});

// ── Schedule generation ───────────────────────────────────