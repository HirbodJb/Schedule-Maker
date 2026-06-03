// ── Availability table ──────────────────────────────────────
function buildAvailTable(){
  const tbl = document.getElementById('avail-tbl');
  avail = {};
  let html = '<thead><tr><th style="width:68px"></th>';
  ALL_DAYS.forEach(d => html += `<th>${d.slice(0,3)}</th>`);
  html += '</tr></thead><tbody>';
  TIMES_MF.forEach(t => {
    html += `<tr><td class="tc-time">${fmtTime(t)}</td>`;
    ALL_DAYS.forEach(d => {
      const key = d+'-'+t;
      const fri = d==='Friday', inFri = TIMES_FRI.includes(t);
      if(fri && !inFri){
        avail[key]=null;
        html+=`<td class="tc-cell" style="background:var(--soft)"></td>`;
      }
      else {
        avail[key]=false;
        html+=`<td class="tc-cell availability-click-cell" onclick="toggleAvailCell(this,'${key}')"><input type="checkbox" class="avail-cb" id="cb-${key}" onclick="event.stopPropagation()" onchange="setAvailCell(this,'${key}')"></td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody>';
  tbl.innerHTML = html;
}

function setAvailCell(cb, key){
  avail[key] = cb.checked;
  const cell = cb.closest('td');
  if(cell) cell.classList.toggle('available-cell', cb.checked);
}

function toggleAvailCell(cell, key){
  const cb = cell.querySelector('input[type="checkbox"]');
  if(!cb) return;
  cb.checked = !cb.checked;
  setAvailCell(cb, key);
}

function selectAll(){
  Object.keys(avail).forEach(k=>{
    if(avail[k]!==null){
      avail[k]=true;
      const el=document.getElementById('cb-'+k);
      if(el){
        el.checked=true;
        const cell=el.closest('td');
        if(cell) cell.classList.add('available-cell');
      }
    }
  });
}

function clearAvail(){
  Object.keys(avail).forEach(k=>{
    if(avail[k]!==null){
      avail[k]=false;
      const el=document.getElementById('cb-'+k);
      if(el){
        el.checked=false;
        const cell=el.closest('td');
        if(cell) cell.classList.remove('available-cell');
      }
    }
  });
}

// ── Utilities ────────────────────────────────────────────
