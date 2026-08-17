const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const STORAGE_KEY = 'planifprof-state-v7';

const defaultState = {
  days: 9,
  am: 2,
  pm: 2,
  lunch: true,
  hours: false,
  selectedGroupId: '601',
  data: {},
  theme: 'forest',
  themeOptions: null,
  meta: {
    school: 'École du bonheur',
    calendar: 'Calendrier scolaire 2026-2027',
    teacher: 'Nom de l’enseignant'
  },
  courses: [
    {id:'math', name:'Mathématique', color:'#4f7cff'},
    {id:'fr', name:'Français', color:'#ef5da8'},
    {id:'sci', name:'Sciences', color:'#10b981'},
    {id:'art', name:'Arts', color:'#f59e0b'}
  ],
  groups: [
    {id:'601', name:'Groupe 601', level:'Primaire', teacher:'', room:'', notes:''},
    {id:'602', name:'Groupe 602', level:'Primaire', teacher:'', room:'', notes:''},
    {id:'sec1', name:'Secondaire 1', level:'Secondaire', teacher:'', room:'', notes:''}
  ],
  students: [
    {id:'s1', name:'Alex Morin', groupId:'601', info:''},
    {id:'s2', name:'Camille Roy', groupId:'601', info:''},
    {id:'s3', name:'Noah Tremblay', groupId:'602', info:''}
  ]
};

let state = structuredClone(defaultState);
let currentSession = null;
function loadState(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? deepMerge(structuredClone(defaultState), saved) : structuredClone(defaultState);
  } catch { return structuredClone(defaultState); }
}

async function loadSupabaseState(){
  const protectedPages = ['builder','library','groups','certificates'];
  const page = document.body?.dataset?.page || 'home';
  const client = window.PlanifProfSupabase;
  if(!client){
    if(protectedPages.includes(page)) window.location.href = 'login.html';
    return loadState();
  }
  const { data: sessionData } = await client.auth.getSession();
  currentSession = sessionData.session;
  if(!currentSession){
    if(protectedPages.includes(page)) window.location.href = 'login.html';
    return loadState();
  }
  const userId = currentSession.user.id;
  const { data, error } = await client.from('user_settings').select('state').eq('user_id', userId).maybeSingle();
  if(error){ console.warn('Erreur Supabase lecture state', error); return loadState(); }
  if(data?.state) return deepMerge(structuredClone(defaultState), data.state);
  const fresh = structuredClone(defaultState);
  await client.from('user_settings').upsert({ user_id: userId, state: fresh, updated_at: new Date().toISOString() });
  return fresh;
}
function deepMerge(base, saved){
  Object.keys(saved || {}).forEach(key => {
    if(saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key]) && base[key]) base[key] = deepMerge(base[key], saved[key]);
    else base[key] = saved[key];
  });
  return base;
}
function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const client = window.PlanifProfSupabase;
  if(client && currentSession){
    client.from('user_settings').upsert({
      user_id: currentSession.user.id,
      state,
      updated_at: new Date().toISOString()
    }).then(({ error }) => { if(error) console.warn('Erreur Supabase sauvegarde state', error); });
  }
}
function makeId(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function getCourse(id){ return state.courses.find(c => c.id === id); }
function getGroup(id){ return state.groups.find(g => g.id === id); }
function key(row, day){ return `${row}-${day}`; }
function hourFor(index){ return ['08:30','09:25','10:20','11:15','12:10','13:05','14:00','14:55','15:40'][index] || ''; }
function rows(){
  const out = [];
  for(let i=1;i<=state.am;i++) out.push({type:'course', label:`Cours ${i}`, slot:`am${i}`});
  if(state.lunch) out.push({type:'lunch', label:'Dîner', slot:'lunch'});
  for(let i=1;i<=state.pm;i++) out.push({type:'course', label:`Cours ${state.am+i}`, slot:`pm${i}`});
  return out;
}

const themePresets = {
  forest: {font:'Inter, system-ui, sans-serif', line:'solid', accent:'#2f8f61', texture:'paper', imperfections:'soft', header:'banner', background:'#f5fbf3', palette:'forest'},
  aurora: {font:'Trebuchet MS, sans-serif', line:'solid', accent:'#7c3aed', texture:'dots', imperfections:'clean', header:'badge', background:'#f6fbff', palette:'aurora'},
  chalk: {font:'Courier New, monospace', line:'dashed', accent:'#4f7cff', texture:'grid', imperfections:'ink', header:'simple', background:'#ffffff', palette:'pastel'},
  camp: {font:'Georgia, serif', line:'double', accent:'#b45309', texture:'paper', imperfections:'soft', header:'banner', background:'#fff8f1', palette:'earth'},
  sky: {font:'Inter, system-ui, sans-serif', line:'solid', accent:'#0284c7', texture:'none', imperfections:'clean', header:'badge', background:'#f6fbff', palette:'pastel'},
  clay: {font:'Trebuchet MS, sans-serif', line:'dashed', accent:'#c2410c', texture:'paper', imperfections:'ink', header:'banner', background:'#fff8f1', palette:'earth'}
};

function syncMetaFields(){
  if($('#schoolName')) $('#schoolName').value = state.meta.school;
  if($('#calendarTitle')) $('#calendarTitle').value = state.meta.calendar;
  if($('#teacherName')) $('#teacherName').value = state.meta.teacher;
  syncPrintDetails();
}
function syncPrintDetails(){
  if($('#printSchoolName')) $('#printSchoolName').textContent = state.meta.school || 'Nom de l’école';
  if($('#printCalendarTitle')) $('#printCalendarTitle').textContent = state.meta.calendar || 'Calendrier de l’année';
  if($('#printTeacherName')) $('#printTeacherName').textContent = state.meta.teacher || 'Nom de l’enseignant';
}
function bindMetaFields(){
  [['schoolName','school'],['calendarTitle','calendar'],['teacherName','teacher']].forEach(([id,key]) => {
    const field = $('#'+id);
    if(!field) return;
    field.addEventListener('input', () => { state.meta[key] = field.value; persist(); syncPrintDetails(); });
  });
}

function populateDialogOptions(){
  if($('#cellCourse')) $('#cellCourse').innerHTML = '<option value="">Aucun cours</option>' + state.courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if($('#cellGroup')) $('#cellGroup').innerHTML = '<option value="">Aucun groupe</option>' + state.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
}
function renderGrid(){
  const grid = $('#scheduleGrid');
  if(!grid) return;
  grid.style.setProperty('--days', state.days);
  grid.innerHTML = `<div></div>` + Array.from({length:state.days},(_,i)=>`<div class="day-title">Jour ${i+1}</div>`).join('');
  const lunchIcons = ['🧁','🍉','🍰','🍍','🥗','🍒','🥬','🍓','🍩','🍎'];
  rows().forEach((row, rowIndex) => {
    const addTarget = row.type === 'course' && row.slot.startsWith('am') ? 'am' : row.type === 'course' ? 'pm' : '';
    grid.insertAdjacentHTML('beforeend', addTarget ? `<button class="row-add" data-add="${addTarget}" title="Ajouter un cours">+</button>` : '<div></div>');
    for(let day=1; day<=state.days; day++){
      const cellKey = key(row.slot, day);
      const item = state.data[cellKey] || {};
      const course = getCourse(item.courseId);
      const group = getGroup(item.groupId);
      const style = course ? `style="--course-color:${course.color}"` : '';
      const classes = [row.type === 'lunch' ? 'lunch-cell' : '', course ? 'course-filled' : ''].join(' ');
      const content = row.type === 'lunch'
        ? `<div class="cell-content"><span class="group-text">Dîner</span></div><span class="lunch-icon">${lunchIcons[(day-1)%lunchIcons.length]}</span>`
        : `<div class="cell-content">
            ${course ? `<span class="course-pill" style="background:${course.color};border-color:${course.color}">${course.name}</span>` : ''}
            ${group ? `<span class="group-text">${group.name}</span>` : ''}
            ${item.room ? `<span class="room-text">Local : ${item.room}</span>` : ''}
            ${item.note ? `<span class="note-text">${item.note}</span>` : ''}
          </div>`;
      grid.insertAdjacentHTML('beforeend', `<button class="cell ${classes}" data-cell="${cellKey}" ${row.type === 'lunch' ? 'data-lunch="true"' : ''} ${style}>
        <span class="placeholder">${row.label}</span>${content}${state.hours ? `<span class="time-label">${item.time || hourFor(rowIndex)}</span>` : ''}
      </button>`);
    }
  });
  $$('.row-add').forEach(button => button.addEventListener('click', () => {
    if(button.dataset.add === 'am') state.am = Math.min(5, state.am + 1);
    if(button.dataset.add === 'pm') state.pm = Math.min(5, state.pm + 1);
    persist(); syncControls(); renderGrid();
  }));
  $$('[data-cell]').forEach(cell => cell.addEventListener('click', () => openCellDialog(cell.dataset.cell, cell.dataset.lunch === 'true')));
}
function syncControls(){
  if($('#amCount')) $('#amCount').value = state.am;
  if($('#pmCount')) $('#pmCount').value = state.pm;
  if($('#dayCount')) $('#dayCount').value = state.days;
  if($('#dayCountLabel')) $('#dayCountLabel').textContent = `${state.days} jours`;
  if($('#lunchToggle')) $('#lunchToggle').checked = state.lunch;
  if($('#hoursToggle')) $('#hoursToggle').checked = state.hours;
}
function openCellDialog(cellKey, isLunch){
  if(isLunch || !$('#cellDialog')) return;
  populateDialogOptions();
  const item = state.data[cellKey] || {};
  $('#editingKey').value = cellKey;
  $('#cellCourse').value = item.courseId || '';
  $('#cellGroup').value = item.groupId || '';
  $('#cellRoom').value = item.room || '';
  $('#cellTime').value = item.time || '';
  $('#cellNote').value = item.note || '';
  $('#cellDialog').showModal();
}

function applyTheme(values, save=true){
  const wrapper = $('#scheduleWrapper');
  if(!wrapper) return;
  wrapper.style.setProperty('--theme-font', values.font);
  wrapper.style.setProperty('--theme-accent', values.accent);
  wrapper.style.setProperty('--theme-bg', values.background);
  wrapper.dataset.line = values.line;
  wrapper.dataset.texture = values.texture;
  wrapper.dataset.imperfections = values.imperfections;
  wrapper.dataset.header = values.header;
  wrapper.dataset.palette = values.palette;
  if($('#themeFont')) $('#themeFont').value = values.font;
  if($('#themeLine')) $('#themeLine').value = values.line;
  if($('#themeAccent')) $('#themeAccent').value = values.accent;
  if($('#themeTexture')) $('#themeTexture').value = values.texture;
  if($('#themeImperfections')) $('#themeImperfections').value = values.imperfections;
  if($('#themeHeader')) $('#themeHeader').value = values.header;
  if($('#themeBackground')) $('#themeBackground').value = values.background;
  if($('#themePalette')) $('#themePalette').value = values.palette;
  if(save){ state.themeOptions = values; persist(); }
}
function currentThemeValues(){
  return {
    font: $('#themeFont').value,
    line: $('#themeLine').value,
    accent: $('#themeAccent').value,
    texture: $('#themeTexture').value,
    imperfections: $('#themeImperfections').value,
    header: $('#themeHeader').value,
    background: $('#themeBackground').value,
    palette: $('#themePalette').value
  };
}
function bindBuilder(){
  if(!$('#scheduleGrid')) return;
  syncMetaFields(); bindMetaFields(); syncControls(); populateDialogOptions();
  const initialTheme = state.themeOptions || themePresets[state.theme] || themePresets.forest;
  applyTheme(initialTheme, false);
  renderGrid();
  $('#amCount')?.addEventListener('change', e => { state.am = Number(e.target.value); persist(); renderGrid(); });
  $('#pmCount')?.addEventListener('change', e => { state.pm = Number(e.target.value); persist(); renderGrid(); });
  $('#lunchToggle')?.addEventListener('change', e => { state.lunch = e.target.checked; persist(); renderGrid(); });
  $('#hoursToggle')?.addEventListener('change', e => { state.hours = e.target.checked; persist(); renderGrid(); });
  $('#dayCount')?.addEventListener('input', e => { state.days = Number(e.target.value); persist(); syncControls(); renderGrid(); });
  $('#quickFill')?.addEventListener('click', () => {
    rows().filter(r => r.type === 'course').forEach((r, i) => {
      for(let d=1; d<=state.days; d++) state.data[key(r.slot,d)] = {courseId: state.courses[i % state.courses.length]?.id, groupId: state.groups[d % state.groups.length]?.id, room:'', time:hourFor(i), note:''};
    }); persist(); renderGrid();
  });
  $('#clearGrid')?.addEventListener('click', () => { state.data = {}; persist(); renderGrid(); });
  $('#saveLocal')?.addEventListener('click', () => { persist(); alert('Horaire sauvegardé dans ce navigateur.'); });
  $('#loadLocal')?.addEventListener('click', () => { state = loadState(); syncMetaFields(); syncControls(); applyTheme(state.themeOptions || themePresets[state.theme] || themePresets.forest, false); renderGrid(); alert('Horaire chargé.'); });
  $('#cellForm')?.addEventListener('submit', e => {
    e.preventDefault();
    state.data[$('#editingKey').value] = {courseId: $('#cellCourse').value, groupId: $('#cellGroup').value, room: $('#cellRoom').value.trim(), time: $('#cellTime').value, note: $('#cellNote').value.trim()};
    persist(); $('#cellDialog').close(); renderGrid();
  });
  $('#deleteCell')?.addEventListener('click', () => { delete state.data[$('#editingKey').value]; persist(); $('#cellDialog').close(); renderGrid(); });
  $$('.theme').forEach(btn => btn.addEventListener('click', () => {
    $$('.theme').forEach(item => item.classList.remove('active'));
    btn.classList.add('active'); state.theme = btn.dataset.theme; state.themeOptions = themePresets[btn.dataset.theme]; applyTheme(state.themeOptions); 
  }));
  ['themeFont','themeLine','themeAccent','themeTexture','themeImperfections','themeHeader','themeBackground','themePalette'].forEach(id => $('#'+id)?.addEventListener('change', () => applyTheme(currentThemeValues())));
  $('#previewTheme')?.addEventListener('click', () => { applyTheme(currentThemeValues()); $('#scheduleWrapper')?.classList.add('theme-flash'); setTimeout(() => $('#scheduleWrapper')?.classList.remove('theme-flash'), 650); });
  $('#toggleThemeEditor')?.addEventListener('click', () => {
    const editor = $('#themeEditor'); editor.classList.toggle('collapsed'); $('#toggleThemeEditor').textContent = editor.classList.contains('collapsed') ? 'Ouvrir' : 'Fermer';
  });
  function preparePrint(){ syncPrintDetails(); document.body.classList.add('printing-schedule'); setTimeout(() => window.print(), 80); }
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-schedule'));
  $('#printBtn')?.addEventListener('click', preparePrint);
  $('#generateBtn')?.addEventListener('click', preparePrint);
}

function renderLibrary(){
  if($('#courseList')) $('#courseList').innerHTML = state.courses.map(c => `<li><span><strong style="color:${c.color}">●</strong> ${c.name}</span><button data-del-course="${c.id}">Supprimer</button></li>`).join('');
  if($('#groupList')) $('#groupList').innerHTML = state.groups.map(g => `<li><span><strong>${g.name}</strong><br><small>${g.level || 'Niveau non précisé'}</small></span><a class="btn btn-small" href="groupes.html" data-open-group="${g.id}">Modifier</a></li>`).join('');
  if($('#studentList')) $('#studentList').innerHTML = state.students.slice(0,8).map(s => `<li><span><strong>${s.name}</strong><br><small>${getGroup(s.groupId)?.name || 'Sans groupe'}</small></span></li>`).join('') || '<li>Aucun élève</li>';
  $$('[data-del-course]').forEach(b => b.onclick = () => { state.courses = state.courses.filter(c => c.id !== b.dataset.delCourse); persist(); renderLibrary(); });
  $$('[data-open-group]').forEach(b => b.onclick = () => { state.selectedGroupId = b.dataset.openGroup; persist(); });
}
function bindLibrary(){
  renderLibrary();
  $('#addCourse')?.addEventListener('click', () => {
    const name = $('#courseName')?.value.trim(); if(!name) return;
    state.courses.push({id:makeId('c'), name, color:$('#courseColor')?.value || '#4f7cff'});
    $('#courseName').value=''; persist(); renderLibrary();
  });
}

function renderGroupWorkspace(){
  if(!$('#groupTabs')) return;
  if(!state.groups.length){ $('#groupTabs').innerHTML = '<li>Aucun groupe</li>'; return; }
  if(!state.selectedGroupId || !getGroup(state.selectedGroupId)) state.selectedGroupId = state.groups[0].id;
  const group = getGroup(state.selectedGroupId);
  $('#groupTabs').innerHTML = state.groups.map(g => `<li><button class="${g.id === state.selectedGroupId ? 'active' : ''}" data-select-group="${g.id}">${g.name}<br><small>${g.level || 'Niveau non précisé'}</small></button></li>`).join('');
  $('#groupEditorTitle').textContent = `Détails - ${group.name}`;
  $('#editGroupName').value = group.name || '';
  $('#editGroupLevel').value = group.level || '';
  $('#editGroupTeacher').value = group.teacher || '';
  $('#editGroupRoom').value = group.room || '';
  $('#editGroupNotes').value = group.notes || '';
  renderGroupStudents();
  $$('[data-select-group]').forEach(b => b.onclick = () => { state.selectedGroupId = b.dataset.selectGroup; persist(); renderGroupWorkspace(); });
}
function renderGroupStudents(){
  if(!$('#groupStudentList')) return;
  const students = state.students.filter(s => s.groupId === state.selectedGroupId);
  $('#groupStudentList').innerHTML = students.map(s => `<li><span><strong>${s.name}</strong><br><small>${s.info || 'Aucune note'}</small></span><button data-remove-student="${s.id}">Supprimer</button></li>`).join('') || '<li>Aucun élève dans ce groupe</li>';
  $$('[data-remove-student]').forEach(b => b.onclick = () => { state.students = state.students.filter(s => s.id !== b.dataset.removeStudent); persist(); renderGroupStudents(); });
}
function bindGroups(){
  if(!$('#groupTabs')) return;
  renderGroupWorkspace();
  $('#newGroupBtn')?.addEventListener('click', () => { const id = makeId('g'); state.groups.push({id, name:'Nouveau groupe', level:'', teacher:'', room:'', notes:''}); state.selectedGroupId = id; persist(); renderGroupWorkspace(); });
  $('#saveGroupDetails')?.addEventListener('click', () => { const group = getGroup(state.selectedGroupId); if(!group) return; group.name = $('#editGroupName').value.trim() || 'Groupe sans nom'; group.level = $('#editGroupLevel').value.trim(); group.teacher = $('#editGroupTeacher').value.trim(); group.room = $('#editGroupRoom').value.trim(); group.notes = $('#editGroupNotes').value.trim(); persist(); renderGroupWorkspace(); });
  $('#deleteGroupBtn')?.addEventListener('click', () => { const id = state.selectedGroupId; state.groups = state.groups.filter(g => g.id !== id); state.students = state.students.filter(s => s.groupId !== id); Object.values(state.data).forEach(cell => { if(cell.groupId === id) cell.groupId = ''; }); state.selectedGroupId = state.groups[0]?.id || ''; persist(); renderGroupWorkspace(); });
  $('#addStudentToGroup')?.addEventListener('click', () => { const name = $('#newStudentName').value.trim(); if(!name || !state.selectedGroupId) return; state.students.push({id:makeId('s'), name, groupId:state.selectedGroupId, info:$('#newStudentInfo').value.trim()}); $('#newStudentName').value=''; $('#newStudentInfo').value=''; persist(); renderGroupStudents(); });
}

function bindCertificates(){
  const update = () => { if($('#certNameView')) $('#certNameView').textContent = $('#certName')?.value || 'Nom de l’élève'; if($('#certReasonView')) $('#certReasonView').textContent = $('#certReason')?.value || 'Réussite'; };
  $('#certName')?.addEventListener('input', update);
  $('#certReason')?.addEventListener('input', update);
  update();
}

async function initializePlanifProf(){
  state = await loadSupabaseState();
  bindBuilder();
  bindLibrary();
  bindGroups();
  bindCertificates();
  bindAdvancedGroupTools();
  const header = document.querySelector('.site-header');
  if(header && currentSession && !document.getElementById('logoutBtn')){
    const btn = document.createElement('button');
    btn.id = 'logoutBtn';
    btn.className = 'logout-btn';
    btn.textContent = 'Déconnexion';
    btn.addEventListener('click', async () => {
      if(window.PlanifProfSupabase) await window.PlanifProfSupabase.auth.signOut();
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = 'login.html';
    });
    header.appendChild(btn);
  }
}
initializePlanifProf();

/* --- Outils avancés de groupe : plan de classe, étapes et évaluations --- */
function ensureAdvancedGroupData(){
  state.groups.forEach(group => {
    group.seating = group.seating || {rows:4, cols:6, seats:{}, mode:'auto'};
    group.constraints = group.constraints || {canTogether:[], cannotTogether:[]};
    group.interventions = group.interventions || {};
    group.evaluations = group.evaluations || {
      step1: {items:[{id:'lecture', name:'Lecture', weight:40},{id:'ecriture', name:'Écriture', weight:40},{id:'oral', name:'Oral', weight:20}], results:{}},
      step2: {items:[{id:'lecture2', name:'Lecture', weight:40},{id:'projet2', name:'Projet', weight:35},{id:'oral2', name:'Oral', weight:25}], results:{}},
      step3: {items:[{id:'lecture3', name:'Lecture', weight:35},{id:'ecriture3', name:'Écriture', weight:35},{id:'oral3', name:'Oral', weight:30}], results:{}}
    };
  });
}
function currentGroup(){ ensureAdvancedGroupData(); return getGroup(state.selectedGroupId) || state.groups[0]; }
function currentGroupStudents(){ return state.students.filter(s => s.groupId === state.selectedGroupId); }

const oldRenderGroupWorkspace = renderGroupWorkspace;
renderGroupWorkspace = function(){
  ensureAdvancedGroupData();
  oldRenderGroupWorkspace();
  renderSeatingTool();
  renderStudentSections();
  renderEvaluationGrid();
};

function setGroupTool(tool){
  $$('.group-tool').forEach(b => b.classList.toggle('active', b.dataset.groupTool === tool));
  $$('.group-tool-pane').forEach(p => p.classList.remove('active'));
  $(`#tool-${tool}`)?.classList.add('active');
  if(tool === 'seating') renderSeatingTool();
  if(tool === 'students') renderStudentSections();
  if(tool === 'grid') renderEvaluationGrid();
}
function bindGroupToolTabs(){
  $$('.group-tool').forEach(btn => btn.addEventListener('click', () => setGroupTool(btn.dataset.groupTool)));
}

function populateConstraintSelects(){
  const students = currentGroupStudents();
  const options = students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  if($('#constraintA')) $('#constraintA').innerHTML = options;
  if($('#constraintB')) $('#constraintB').innerHTML = options;
}
function normalizePair(a,b){ return [a,b].sort().join('|'); }
function pairLabel(pair){
  const [a,b] = pair.split('|');
  const sa = state.students.find(s => s.id === a)?.name || 'Élève A';
  const sb = state.students.find(s => s.id === b)?.name || 'Élève B';
  return `${sa} + ${sb}`;
}
function areAdjacent(posA, posB, cols){
  const [ra, ca] = posA.split('-').map(Number);
  const [rb, cb] = posB.split('-').map(Number);
  return Math.abs(ra-rb) + Math.abs(ca-cb) === 1;
}
function studentSeatMap(group){
  const map = {};
  Object.entries(group.seating.seats || {}).forEach(([seat, studentId]) => { if(studentId) map[studentId] = seat; });
  return map;
}
function renderConstraints(){
  const group = currentGroup(); if(!group || !$('#constraintList')) return;
  const can = group.constraints.canTogether.map(pair => `<li><span>✅ ${pairLabel(pair)}</span><button data-remove-constraint="can:${pair}">×</button></li>`).join('');
  const cannot = group.constraints.cannotTogether.map(pair => `<li><span>🚫 ${pairLabel(pair)}</span><button data-remove-constraint="cannot:${pair}">×</button></li>`).join('');
  $('#constraintList').innerHTML = can + cannot || '<li>Aucune contrainte</li>';
  $$('[data-remove-constraint]').forEach(btn => btn.onclick = () => {
    const [type,pair] = btn.dataset.removeConstraint.split(':');
    const arr = type === 'can' ? group.constraints.canTogether : group.constraints.cannotTogether;
    const index = arr.indexOf(pair); if(index >= 0) arr.splice(index,1);
    persist(); renderSeatingTool();
  });
}
let selectedManualStudent = null;
function renderSeatingTool(){
  const group = currentGroup(); if(!group || !$('#seatGrid')) return;
  $('#seatRows').value = group.seating.rows;
  $('#seatCols').value = group.seating.cols;
  $('#seatGrid').style.gridTemplateColumns = `repeat(${group.seating.cols}, 112px)`;
  $('#seatGrid').innerHTML = '';
  const map = studentSeatMap(group);
  for(let r=0; r<group.seating.rows; r++){
    for(let c=0; c<group.seating.cols; c++){
      const seatKey = `${r}-${c}`;
      const studentId = group.seating.seats[seatKey];
      const student = state.students.find(s => s.id === studentId);
      let cls = 'seat' + (student ? '' : ' empty');
      if(studentId){
        group.constraints.cannotTogether.forEach(pair => {
          if(pair.includes(studentId)){
            const other = pair.split('|').find(id => id !== studentId);
            if(map[other] && areAdjacent(seatKey, map[other], group.seating.cols)) cls += ' conflict';
          }
        });
        group.constraints.canTogether.forEach(pair => {
          if(pair.includes(studentId)){
            const other = pair.split('|').find(id => id !== studentId);
            if(map[other] && areAdjacent(seatKey, map[other], group.seating.cols)) cls += ' good-pair';
          }
        });
      }
      $('#seatGrid').insertAdjacentHTML('beforeend', `<button class="${cls}" data-seat="${seatKey}">${student ? student.name : 'Place libre'}</button>`);
    }
  }
  const seated = new Set(Object.values(group.seating.seats || {}).filter(Boolean));
  const unplaced = currentGroupStudents().filter(s => !seated.has(s.id));
  $('#unplacedStudents').innerHTML = unplaced.map(s => `<button class="student-chip ${selectedManualStudent===s.id?'selected':''}" data-pick-student="${s.id}">${s.name}</button>`).join('') || '<span class="muted">Tous les élèves sont placés.</span>';
  $$('.student-chip').forEach(chip => chip.onclick = () => { selectedManualStudent = chip.dataset.pickStudent; renderSeatingTool(); });
  $$('.seat').forEach(seat => seat.onclick = () => {
    if(!selectedManualStudent){
      const current = group.seating.seats[seat.dataset.seat];
      if(current) { delete group.seating.seats[seat.dataset.seat]; persist(); renderSeatingTool(); }
      return;
    }
    Object.keys(group.seating.seats).forEach(k => { if(group.seating.seats[k] === selectedManualStudent) delete group.seating.seats[k]; });
    group.seating.seats[seat.dataset.seat] = selectedManualStudent;
    selectedManualStudent = null; persist(); renderSeatingTool();
  });
  populateConstraintSelects(); renderConstraints();
}
function autoPlaceStudents(){
  const group = currentGroup(); if(!group) return;
  const students = [...currentGroupStudents()];
  const seats = [];
  for(let r=0; r<group.seating.rows; r++) for(let c=0; c<group.seating.cols; c++) seats.push(`${r}-${c}`);
  const assigned = {};
  const seatOf = {};
  function scoreSeat(studentId, seatKey){
    let score = Math.random();
    group.constraints.cannotTogether.forEach(pair => {
      if(pair.includes(studentId)){
        const other = pair.split('|').find(id => id !== studentId);
        if(seatOf[other] && areAdjacent(seatKey, seatOf[other], group.seating.cols)) score -= 100;
      }
    });
    group.constraints.canTogether.forEach(pair => {
      if(pair.includes(studentId)){
        const other = pair.split('|').find(id => id !== studentId);
        if(seatOf[other] && areAdjacent(seatKey, seatOf[other], group.seating.cols)) score += 20;
      }
    });
    return score;
  }
  students.sort((a,b) => Math.random() - .5).forEach(student => {
    const available = seats.filter(seat => !assigned[seat]);
    if(!available.length) return;
    available.sort((a,b) => scoreSeat(student.id,b) - scoreSeat(student.id,a));
    assigned[available[0]] = student.id; seatOf[student.id] = available[0];
  });
  group.seating.seats = assigned; persist(); renderSeatingTool();
}
function bindAdvancedSeating(){
  $('#autoSeatMode')?.addEventListener('click', () => { $('#autoSeatMode').classList.add('active'); $('#manualSeatMode').classList.remove('active'); });
  $('#manualSeatMode')?.addEventListener('click', () => { $('#manualSeatMode').classList.add('active'); $('#autoSeatMode').classList.remove('active'); });
  $('#autoPlaceStudents')?.addEventListener('click', autoPlaceStudents);
  $('#clearSeats')?.addEventListener('click', () => { const g=currentGroup(); g.seating.seats={}; selectedManualStudent=null; persist(); renderSeatingTool(); });
  $('#seatRows')?.addEventListener('change', e => { const g=currentGroup(); g.seating.rows=Number(e.target.value); g.seating.seats={}; persist(); renderSeatingTool(); });
  $('#seatCols')?.addEventListener('change', e => { const g=currentGroup(); g.seating.cols=Number(e.target.value); g.seating.seats={}; persist(); renderSeatingTool(); });
  $('#addCanPair')?.addEventListener('click', () => addConstraint('can'));
  $('#addCannotPair')?.addEventListener('click', () => addConstraint('cannot'));
  $('#printSeating')?.addEventListener('click', () => { setGroupTool('seating'); window.print(); });
}
function addConstraint(type){
  const a = $('#constraintA')?.value, b = $('#constraintB')?.value;
  if(!a || !b || a === b) return;
  const group = currentGroup(); const pair = normalizePair(a,b);
  const arr = type === 'can' ? group.constraints.canTogether : group.constraints.cannotTogether;
  const other = type === 'can' ? group.constraints.cannotTogether : group.constraints.canTogether;
  if(!arr.includes(pair)) arr.push(pair);
  const i = other.indexOf(pair); if(i >= 0) other.splice(i,1);
  persist(); renderSeatingTool();
}

function renderStudentSections(section='intervention'){
  if(!$('#studentSectionContent')) return;
  $$('.student-section-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.studentSection === section));
  if(section === 'intervention') renderInterventionSection();
  else renderStageStudentSection(section);
}
function renderInterventionSection(){
  const group = currentGroup(); const students = currentGroupStudents();
  $('#studentSectionContent').innerHTML = `<div class="intervention-grid">${students.map(s => `<div class="intervention-row"><strong>${s.name}</strong><textarea data-intervention="${s.id}" placeholder="Plan d’intervention, mesures d’aide, suivis importants...">${group.interventions[s.id] || ''}</textarea></div>`).join('') || '<p class="muted">Aucun élève dans ce groupe.</p>'}</div>`;
  $$('[data-intervention]').forEach(area => area.addEventListener('input', () => { group.interventions[area.dataset.intervention] = area.value; persist(); }));
}
function renderStageStudentSection(stage){
  const group = currentGroup(); const evals = group.evaluations[stage]; const students = currentGroupStudents();
  $('#studentSectionContent').innerHTML = `<div class="evaluation-grid-wrap"><table class="evaluation-table"><thead><tr><th>Élève</th>${evals.items.map(item => `<th>${item.name}<br><small>${item.weight}%</small></th>`).join('')}<th>Total</th></tr></thead><tbody>${students.map(s => renderEvalRow(s, stage)).join('')}</tbody></table></div>`;
  bindEvaluationInputs(stage);
}
function renderEvalRow(student, stage){
  const group = currentGroup(); const evals = group.evaluations[stage]; const scores = evals.results[student.id] || {};
  const total = computeTotal(stage, student.id);
  return `<tr><td><strong>${student.name}</strong></td>${evals.items.map(item => `<td><input data-score-stage="${stage}" data-score-student="${student.id}" data-score-item="${item.id}" value="${scores[item.id] || ''}" placeholder="Note"></td>`).join('')}<td class="average-cell">${total}</td></tr>`;
}
function bindEvaluationInputs(stage){
  $$('[data-score-stage]').forEach(input => input.addEventListener('input', () => {
    const group = currentGroup(); const st = input.dataset.scoreStage, studentId = input.dataset.scoreStudent, itemId = input.dataset.scoreItem;
    group.evaluations[st].results[studentId] = group.evaluations[st].results[studentId] || {};
    group.evaluations[st].results[studentId][itemId] = input.value;
    persist();
  }));
}
function computeTotal(stage, studentId){
  const group = currentGroup(); const evals = group.evaluations[stage]; const scores = evals.results[studentId] || {};
  let total = 0, weights = 0;
  evals.items.forEach(item => { const num = parseFloat(scores[item.id]); if(!isNaN(num)){ total += num * item.weight; weights += item.weight; } });
  return weights ? (total / weights).toFixed(1) : '';
}
function renderEvaluationGrid(){
  if(!$('#evaluationGrid')) return;
  const stage = $('#evaluationStage')?.value || 'step1';
  renderStageTable(stage);
}
function renderStageTable(stage){
  const group = currentGroup(); if(!group || !$('#evaluationGrid')) return;
  const evals = group.evaluations[stage]; const students = currentGroupStudents();
  $('#evaluationGrid').innerHTML = `<table class="evaluation-table"><thead><tr><th>Élève</th>${evals.items.map(item => `<th><span class="eval-head"><input data-eval-name="${item.id}" value="${item.name}"><input type="number" data-eval-weight="${item.id}" value="${item.weight}"><button data-remove-eval="${item.id}">×</button></span></th>`).join('')}<th>Total</th></tr></thead><tbody>${students.map(s => renderEvalRow(s, stage)).join('')}</tbody></table>`;
  bindEvaluationInputs(stage);
  $$('[data-eval-name]').forEach(input => input.addEventListener('input', () => { const item=evals.items.find(i=>i.id===input.dataset.evalName); if(item) item.name=input.value; persist(); }));
  $$('[data-eval-weight]').forEach(input => input.addEventListener('input', () => { const item=evals.items.find(i=>i.id===input.dataset.evalWeight); if(item) item.weight=Number(input.value)||0; persist(); }));
  $$('[data-remove-eval]').forEach(btn => btn.addEventListener('click', () => { evals.items = evals.items.filter(i => i.id !== btn.dataset.removeEval); persist(); renderStageTable(stage); }));
}
function bindStageTools(){
  $$('.student-section-tab').forEach(tab => tab.addEventListener('click', () => renderStudentSections(tab.dataset.studentSection)));
  $('#evaluationStage')?.addEventListener('change', () => renderEvaluationGrid());
  $('#addEvaluation')?.addEventListener('click', () => {
    const group=currentGroup(); const stage=$('#evaluationStage').value; const name=$('#evaluationName').value.trim() || 'Nouvelle évaluation';
    group.evaluations[stage].items.push({id:makeId('eval'), name, weight:Number($('#evaluationWeight').value)||0});
    $('#evaluationName').value=''; persist(); renderEvaluationGrid();
  });
}

function bindAdvancedGroupTools(){
  if(!$('body[data-page="groups"]')) return;
  ensureAdvancedGroupData(); persist(); bindGroupToolTabs(); bindAdvancedSeating(); bindStageTools(); renderGroupWorkspace();
}

