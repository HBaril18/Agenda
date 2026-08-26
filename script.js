const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const STORAGE_KEY = 'planifprof-state-v7';

/*
 * Version du modèle de données.
 *
 * v1 :
 * - les lignes étaient déduites de am / pm / lunch
 * - les cases étaient dans state.data
 *
 * v2 :
 * - les lignes sont explicites dans state.schedule.rows
 * - les cases sont dans state.schedule.cells
 * - les groupes peuvent avoir une couleur
 * - le calendrier scolaire possède sa propre structure
 */
const STATE_VERSION = 2;

const DEFAULT_ROW_HEIGHT = 90;
const DEFAULT_BREAK_HEIGHT = 55;

const defaultState = {
    version: STATE_VERSION,

    /*
     * Ces propriétés sont conservées pour assurer
     * la compatibilité avec l'interface actuelle.
     */
    days: 9,
    am: 2,
    pm: 2,
    lunch: true,
    hours: false,

    selectedGroupId: '601',

    /*
     * Alias temporaire de compatibilité.
     *
     * Le vrai stockage v2 est :
     * state.schedule.cells
     */
    data: {},

    /*
     * NOUVEAU MODÈLE DE L'HORAIRE
     */
    schedule: {
        rows: [],

        cells: {},

        settings: {
            rowHeight: DEFAULT_ROW_HEIGHT,
            cellWidth: null
        }
    },

    /*
     * NOUVEAU MODÈLE DU CALENDRIER SCOLAIRE
     *
     * Il sera utilisé à la phase Agenda.
     */
    calendar: {
        schoolYear: '',
        startDate: '',
        endDate: '',

        cycle: {
            length: 5,
            startDay: 1
        },

        schoolDays: [],
        holidays: [],
        pedagogicalDays: [],
        exceptions: []
    },

    theme: 'forest',
    themeOptions: null,

    meta: {
        school: 'École du bonheur',
        calendar: 'Calendrier scolaire 2026-2027',
        teacher: 'Nom de l’enseignant'
    },

    courses: [
        {
            id: 'math',
            name: 'Mathématique',
            color: '#4f7cff'
        },
        {
            id: 'fr',
            name: 'Français',
            color: '#ef5da8'
        },
        {
            id: 'sci',
            name: 'Sciences',
            color: '#10b981'
        },
        {
            id: 'art',
            name: 'Arts',
            color: '#f59e0b'
        }
    ],

    /*
     * Les groupes ont maintenant leur propre couleur.
     */
    groups: [
        {
            id: '601',
            name: 'Groupe 601',
            level: 'Primaire',
            teacher: '',
            room: '',
            notes: '',
            color: '#4f7cff'
        },
        {
            id: '602',
            name: 'Groupe 602',
            level: 'Primaire',
            teacher: '',
            room: '',
            notes: '',
            color: '#ef5da8'
        },
        {
            id: 'sec1',
            name: 'Secondaire 1',
            level: 'Secondaire',
            teacher: '',
            room: '',
            notes: '',
            color: '#10b981'
        }
    ],

    students: [
        {
            id: 's1',
            name: 'Alex Morin',
            groupId: '601',
            info: ''
        },
        {
            id: 's2',
            name: 'Camille Roy',
            groupId: '601',
            info: ''
        },
        {
            id: 's3',
            name: 'Noah Tremblay',
            groupId: '602',
            info: ''
        }
    ]
};

let state = structuredClone(defaultState);
let currentSession = null;

/*
 * ============================================================
 * MIGRATION DU MODÈLE DE DONNÉES
 * ============================================================
 *
 * Cette fonction transforme automatiquement les anciens
 * horaires PlanifProf vers le nouveau modèle v2.
 *
 * Elle permet donc de conserver les horaires déjà créés.
 */

function createLegacyRows(source) {
    const rows = [];

    const am = Number(source.am) || 0;
    const pm = Number(source.pm) || 0;

    /*
     * Périodes AM
     */
    for (let i = 1; i <= am; i++) {
        rows.push({
            id: `am${i}`,
            type: 'course',
            label: `Cours ${i}`,
            defaultTime: hourFor(i - 1),
            height: DEFAULT_ROW_HEIGHT
        });
    }

    /*
     * Dîner
     */
    if (source.lunch) {
        rows.push({
            id: 'lunch',
            type: 'lunch',
            label: 'Dîner',
            defaultTime: hourFor(am),
            height: DEFAULT_BREAK_HEIGHT
        });
    }

    /*
     * Périodes PM
     */
    for (let i = 1; i <= pm; i++) {
        const index = am + i - 1;

        rows.push({
            id: `pm${i}`,
            type: 'course',
            label: `Cours ${am + i}`,
            defaultTime: hourFor(index),
            height: DEFAULT_ROW_HEIGHT
        });
    }

    return rows;
}


/*
 * Normalisation d'une case.
 *
 * Même si une ancienne case ne possède pas encore ces propriétés,
 * elles seront automatiquement ajoutées.
 */
function normalizeCell(cell) {

    const source =
        cell && typeof cell === 'object'
            ? cell
            : {};

    return {
        ...source,

        courseId: source.courseId || '',
        groupId: source.groupId || '',
        room: source.room || '',
        time: source.time || '',
        note: source.note || '',

        /*
         * Paramètres visuels préparés pour les prochaines phases.
         */
        text: {
            color: '',
            align: 'center',
            vertical: 'center',
            wrap: true,
            showGenericLabel: true,

            ...(source.text || {})
        },

        /*
         * Mode d'affichage de la couleur du groupe.
         *
         * Valeurs prévues :
         * - dot
         * - border
         * - background
         */
        groupColorMode:
            source.groupColorMode || 'dot',

        /*
         * Dimensions personnalisées.
         */
        size: {
            width: null,
            height: null,

            ...(source.size || {})
        }
    };
}


/*
 * Migration générale.
 */
function migrateState(input) {

    const source =
        input && typeof input === 'object'
            ? input
            : {};

    /*
     * On part toujours du modèle complet.
     */
    const migrated = deepMerge(
        structuredClone(defaultState),
        source
    );

    /*
     * ==========================================================
     * ANCIEN MODÈLE → NOUVEAU MODÈLE
     * ==========================================================
     */

    if (Number(source.version || 1) < 2) {

        /*
         * Ancien stockage :
         *
         * state.data = {
         *   "am1-1": {...},
         *   "am1-2": {...}
         * }
         */
        const legacyData =
            source.data &&
                typeof source.data === 'object'
                ? source.data
                : {};

        /*
         * Génération des lignes v2 à partir
         * de l'ancien système AM / PM / Dîner.
         */
        migrated.schedule.rows =
            createLegacyRows(source);

        /*
         * Conversion des anciennes cases.
         */
        migrated.schedule.cells =
            Object.fromEntries(
                Object.entries(legacyData).map(
                    ([cellKey, cell]) => [
                        cellKey,
                        normalizeCell(cell)
                    ]
                )
            );

        migrated.version = STATE_VERSION;

    } else {

        /*
         * Le state est déjà en v2.
         */
        migrated.schedule =
            migrated.schedule || {};

        /*
         * Si les lignes n'existent pas encore,
         * on les crée à partir de la configuration actuelle.
         */
        migrated.schedule.rows =
            Array.isArray(migrated.schedule.rows) &&
                migrated.schedule.rows.length
                ? migrated.schedule.rows
                : createLegacyRows(migrated);

        /*
         * Sécurisation des cases.
         */
        migrated.schedule.cells =
            migrated.schedule.cells &&
                typeof migrated.schedule.cells === 'object'
                ? migrated.schedule.cells
                : {};

        /*
         * Normalisation de chaque case.
         */
        migrated.schedule.cells =
            Object.fromEntries(
                Object.entries(
                    migrated.schedule.cells
                ).map(
                    ([cellKey, cell]) => [
                        cellKey,
                        normalizeCell(cell)
                    ]
                )
            );

        migrated.version = STATE_VERSION;
    }

    /*
     * ==========================================================
     * COULEURS DES GROUPES
     * ==========================================================
     *
     * Les anciens groupes n'ont pas de propriété color.
     * On leur donne donc une couleur par défaut.
     */
    migrated.groups =
        (migrated.groups || []).map(group => ({
            color: '#4f7cff',
            ...group
        }));

    /*
     * ==========================================================
     * COMPATIBILITÉ AVEC L'ANCIEN CODE
     * ==========================================================
     *
     * Pendant cette phase, le reste de l'application peut
     * continuer à utiliser state.data.
     *
     * state.data et state.schedule.cells pointent vers le
     * même objet.
     */
    migrated.data =
        migrated.schedule.cells;


    /*
     * ==========================================================
     * CALENDRIER SCOLAIRE
     * ==========================================================
     */

    migrated.calendar = {

        schoolYear: '',
        startDate: '',
        endDate: '',

        cycle: {
            length: 5,
            startDay: 1
        },

        schoolDays: [],
        holidays: [],
        pedagogicalDays: [],
        exceptions: [],

        ...(migrated.calendar || {}),

        cycle: {
            length: 5,
            startDay: 1,
            ...(migrated.calendar?.cycle || {})
        }
    };

    return migrated;
}
function loadState(){

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(STORAGE_KEY)
            );

        return migrateState(
            saved || defaultState
        );

    } catch {

        return migrateState(
            defaultState
        );

    }
}

async function loadSupabaseState() {

    const protectedPages = [
        'builder',
        'library',
        'groups',
        'certificates'
    ];

    const page =
        document.body?.dataset?.page || 'home';

    const client =
        window.PlanifProfSupabase;

    /*
     * Supabase indisponible.
     */
    if (!client) {

        if (
            protectedPages.includes(page)
        ) {
            window.location.href = 'login.html';
        }

        return loadState();
    }

    /*
     * Session actuelle.
     */
    const {
        data: sessionData
    } = await client.auth.getSession();

    currentSession =
        sessionData.session;

    if (!currentSession) {

        if (
            protectedPages.includes(page)
        ) {
            window.location.href = 'login.html';
        }

        return loadState();
    }

    const userId =
        currentSession.user.id;

    /*
     * Lecture du state utilisateur.
     */
    const {
        data,
        error
    } = await client
        .from('user_settings')
        .select('state')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {

        console.warn(
            'Erreur Supabase lecture state',
            error
        );

        return loadState();
    }

    /*
     * IMPORTANT :
     *
     * Même les anciennes données Supabase
     * passent maintenant par migrateState().
     */
    if (data?.state) {

        return migrateState(
            data.state
        );
    }

    /*
     * Nouvel utilisateur.
     */
    const fresh =
        migrateState(
            defaultState
        );

    await client
        .from('user_settings')
        .upsert({
            user_id: userId,
            state: fresh,
            updated_at:
                new Date().toISOString()
        });

    return fresh;
}

function deepMerge(base, saved){
  Object.keys(saved || {}).forEach(key => {
    if(saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key]) && base[key]) base[key] = deepMerge(base[key], saved[key]);
    else base[key] = saved[key];
  });
  return base;
}
let saveTimer = null;
let activeSavePromise = null;

function ensureSaveIndicator(){
  let indicator = document.getElementById('saveIndicator');
  if(indicator) return indicator;
  indicator = document.createElement('div');
  indicator.id = 'saveIndicator';
  indicator.className = 'save-indicator is-hidden';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.innerHTML = '<span class="save-indicator-icon">✓</span><span class="save-indicator-text">Sauvegardé</span>';
  document.body.appendChild(indicator);
  return indicator;
}

function setSaveIndicator(status, message){
  const indicator = ensureSaveIndicator();
  const icon = indicator.querySelector('.save-indicator-icon');
  const text = indicator.querySelector('.save-indicator-text');
  indicator.className = `save-indicator is-${status}`;
  const icons = { saving: '↻', saved: '✓', error: '!', offline: '•' };
  icon.textContent = icons[status] || '✓';
  text.textContent = message;
  if(status === 'saved'){
    clearTimeout(indicator.hideTimer);
    indicator.hideTimer = setTimeout(() => indicator.classList.add('is-hidden'), 2200);
  }
}

async function saveStateToSupabase(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const client = window.PlanifProfSupabase;
  if(!client || !currentSession){
    setSaveIndicator('offline', 'Sauvegardé sur cet appareil');
    return { success: false, localOnly: true };
  }
  setSaveIndicator('saving', 'Sauvegarde en cours...');
  activeSavePromise = client.from('user_settings').upsert({
    user_id: currentSession.user.id,
    state,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  const { error } = await activeSavePromise;
  activeSavePromise = null;
  if(error){
    console.warn('Erreur Supabase sauvegarde state', error);
    setSaveIndicator('error', 'Échec de la sauvegarde');
    return { success: false, error };
  }
  setSaveIndicator('saved', 'Toutes les modifications sont sauvegardées');
  return { success: true };
}

function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setSaveIndicator('saving', 'Sauvegarde en cours...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveStateToSupabase(); }, 500);
}
function makeId(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function getCourse(id){ return state.courses.find(c => c.id === id); }
function getGroup(id){ return state.groups.find(g => g.id === id); }
function key(row, day){ return `${row}-${day}`; }
function hourFor(index){ return ['08:30','09:25','10:20','11:15','12:10','13:05','14:00','14:55','15:40'][index] || ''; }
function rows() {

    /*
     * À partir de la v2, les lignes explicites
     * deviennent la source de vérité.
     */
    return (
        state.schedule?.rows || []
    ).map(row => ({

        ...row,

        /*
         * Le reste de l'application utilise encore
         * row.slot. On le conserve comme alias.
         */
        slot: row.id

    }));
}

/*
 * Reconstruit les lignes lorsqu'un utilisateur
 * modifie le nombre de périodes AM/PM ou le dîner
 * avec les contrôles existants.
 *
 * C'est temporaire pendant la migration.
 */
function rebuildScheduleRows() {

    state.schedule =
        state.schedule || {};

    /*
     * On conserve les cases existantes.
     */
    const existingCells =
        state.schedule.cells ||
        state.data ||
        {};

    state.schedule.rows =
        createLegacyRows(state);

    state.schedule.cells =
        existingCells;

    /*
     * Alias de compatibilité.
     */
    state.data =
        state.schedule.cells;
}


/*
 * Vérifie que le nouveau modèle existe.
 */
function ensureScheduleModel() {

    if (
        !state.schedule ||
        !Array.isArray(
            state.schedule.rows
        )
    ) {

        state =
            migrateState(state);
    }

    if (
        !state.schedule.cells ||
        typeof state.schedule.cells !== 'object'
    ) {

        state.schedule.cells =
            state.data || {};
    }

    /*
     * Maintien de la compatibilité.
     */
    state.data =
        state.schedule.cells;
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

function populateDialogOptions() {

    if ($('#cellCourse')) {
        $('#cellCourse').innerHTML =
            '<option value="">Aucun cours</option>' +
            state.courses.map(c =>
                `<option value="${c.id}">${c.name}</option>`
            ).join('');
    }

    if ($('#cellGroup')) {
        $('#cellGroup').innerHTML =
            '<option value="">Aucun groupe</option>' +
            state.groups.map(g =>
                `<option value="${g.id}" data-color="${g.color}">
                    ${g.name}
                </option>`
            ).join('');
        // Mettre à jour la pastille couleur lorsque l'utilisateur change de groupe
        const _sel = $('#cellGroup');
        if(_sel){
            _sel.onchange = () => {
                const opt = _sel.options[_sel.selectedIndex];
                const badge = $('#cellGroupColorBadge');
                if (!badge) return;
                badge.style.background = opt?.dataset?.color || '#ccc';
                badge.style.display = opt && opt.value ? 'inline-block' : 'none';
            };
        }
    }

    if ($('#cellGroupColorMode')) {
        $('#cellGroupColorMode').innerHTML = `
            <option value="dot">Pastille</option>
            <option value="border">Bordure</option>
            <option value="background">Fond</option>
        `;
    }

    if ($('#cellTextAlign')) {
        $('#cellTextAlign').innerHTML = `
            <option value="top-left">Haut gauche</option>
            <option value="top-right">Haut droite</option>
            <option value="bottom-left">Bas gauche</option>
            <option value="bottom-right">Bas droite</option>
            <option value="center">Centre</option>
        `;
    }

    if ($('#cellType')) {
        $('#cellType').innerHTML = `
            <option value="course">Cours</option>
            <option value="lunch">Dîner</option>
            <option value="recess">Récréation</option>
            <option value="other">Autre</option>
        `;
    }
}
function renderGrid() {

    const grid = $('#scheduleGrid');
    if (!grid) return;

    ensureScheduleModel();

    grid.style.setProperty('--days', state.days);

    /*
     * En-tête des jours
     */
    grid.innerHTML =
        `<div class="hours-col-wrapper"></div>` +
        Array.from({ length: state.days }, (_, i) =>
            `<div class="day-title">Jour ${i + 1}</div>`
        ).join('');

    /*
     * Colonne des heures à gauche
     */
    const hoursCol = document.createElement('div');
    hoursCol.className = 'hours-col-wrapper';

    rows().forEach((row, rowIndex) => {
        const hourInput = document.createElement('input');
        hourInput.type = 'time';
        hourInput.className = 'row-hour-input';
        hourInput.value = row.defaultTime || hourFor(rowIndex);

        hourInput.addEventListener('change', () => {
            row.defaultTime = hourInput.value;
            persist();
            renderGrid();
        });

        hoursCol.appendChild(hourInput);
    });

    grid.appendChild(hoursCol);

    /*
     * Icônes de dîner
     */
    const lunchIcons = ['🧁','🍉','🍰','🍍','🥗','🍒','🥬','🍓','🍩','🍎'];

    /*
     * Parcours des lignes v2
     */
    rows().forEach((row, rowIndex) => {

        const addTarget =
            row.type === 'course' && row.slot.startsWith('am') ? 'am' :
            row.type === 'course' ? 'pm' : '';

        grid.insertAdjacentHTML(
            'beforeend',
            addTarget
                ? `<button class="row-add" data-add="${addTarget}" title="Ajouter un cours">+</button>`
                : '<div></div>'
        );

        /*
         * Cellules de chaque journée
         */
        for (let day = 1; day <= state.days; day++) {

            const cellKey = key(row.slot, day);
            const item = state.schedule.cells[cellKey] || normalizeCell({});

            const course = getCourse(item.courseId);
            const group = getGroup(item.groupId);

            /*
             * Couleur du groupe selon le mode
             */
            let groupColorStyle = '';
            let groupColorClass = '';

            if (group && group.color) {
                if (item.groupColorMode === 'dot') {
                    groupColorClass = 'group-dot';
                    groupColorStyle = `background:${group.color}`;
                }
                if (item.groupColorMode === 'border') {
                    groupColorClass = 'group-border';
                    groupColorStyle = `border-color:${group.color}`;
                }
                if (item.groupColorMode === 'background') {
                    groupColorClass = 'group-bg';
                    groupColorStyle = `background:${group.color}22`;
                }
            }

            /*
             * Alignement du texte
             */
            const alignClass = item.text?.align
                ? `align-${item.text.align}`
                : 'align-top-left';

            /*
             * Couleur du texte
             */
            const textColorStyle = item.text?.color
                ? `color:${item.text.color};`
                : '';

            /*
             * Contenu de la cellule
             */
            let content = '';

            if (row.type === 'lunch') {

                content = `
                    <div class="cell-content">
                        <span class="group-text">${item.note || row.label || 'Dîner'}</span>
                    </div>
                    <span class="lunch-icon">${lunchIcons[(day - 1) % lunchIcons.length]}</span>
                `;

            } else if (row.type === 'recess') {

                content = `
                    <div class="cell-content">
                        <span class="group-text">${item.note || 'Récréation'}</span>
                    </div>
                `;

            } else {

                content = `
                    <div class="cell-content">

                        ${group ? `
                            <span class="group-badge ${groupColorClass}" style="${groupColorStyle}"></span>
                        ` : ''}

                        ${course ? `
                            <span class="course-pill"
                                style="background:${course.color};border-color:${course.color}">
                                ${course.name}
                            </span>
                        ` : ''}

                        ${group ? `
                            <span class="group-text">${group.name}</span>
                        ` : ''}

                        ${item.room ? `
                            <span class="room-text">Local : ${item.room}</span>
                        ` : ''}

                        ${item.note ? `
                            <span class="note-text">${item.note}</span>
                        ` : ''}

                    </div>
                `;
            }

            /*
             * Affichage de l'heure
             */
            const timeLabel = state.hours
                ? `<span class="time-label">${item.time || row.defaultTime || hourFor(rowIndex)}</span>`
                : '';

            /*
             * Construction finale de la cellule
             */
            grid.insertAdjacentHTML(
                'beforeend',
                `
                <button
                    class="cell ${alignClass}"
                    data-cell="${cellKey}"
                    data-type="${row.type}"
                    style="${textColorStyle}"
                >
                    ${content}
                    ${timeLabel}
                </button>
                `
            );
        }
    });

    /*
     * Drag & drop
     */
    $$('[data-cell]').forEach(cell => {
        cell.draggable = true;
        cell.addEventListener('dragstart', handleDragStart);
        cell.addEventListener('dragover', handleDragOver);
        cell.addEventListener('dragleave', handleDragLeave);
        cell.addEventListener('drop', handleDrop);
        cell.addEventListener('dragend', handleDragEnd);

        cell.addEventListener('click', () => {
            openCellDialog(cell.dataset.cell, cell.dataset.type === 'lunch');
        });
    });


    /*
     * Boutons d'ajout AM/PM
     */
    $$('.row-add').forEach(button => {
        button.addEventListener('click', () => {
            if (button.dataset.add === 'am') state.am = Math.min(5, state.am + 1);
            if (button.dataset.add === 'pm') state.pm = Math.min(5, state.pm + 1);

            rebuildScheduleRows();
            persist();
            syncControls();
            renderGrid();
        });
    });
}

let dragSourceKey = null;

function handleDragStart(e) {
    const cell = e.currentTarget;
    dragSourceKey = cell.dataset.cell;
    cell.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    const cell = e.currentTarget;
    if (cell.dataset.cell !== dragSourceKey) {
        cell.classList.add('drop-target');
    }
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drop-target');
}

function handleDrop(e) {
    e.preventDefault();
    const targetCell = e.currentTarget;
    const targetKey = targetCell.dataset.cell;

    targetCell.classList.remove('drop-target');

    if (!dragSourceKey || dragSourceKey === targetKey) return;

    const sourceData = state.schedule.cells[dragSourceKey] || null;
    const targetData = state.schedule.cells[targetKey] || null;

    state.schedule.cells[dragSourceKey] = targetData;
    state.schedule.cells[targetKey] = sourceData;

    state.data = state.schedule.cells;

    persist();
    renderGrid();
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    dragSourceKey = null;
    $$('.drop-target').forEach(el => el.classList.remove('drop-target'));
}
function syncControls(){
  if($('#amCount')) $('#amCount').value = state.am;
  if($('#pmCount')) $('#pmCount').value = state.pm;
  if($('#dayCount')) $('#dayCount').value = state.days;
  if($('#dayCountLabel')) $('#dayCountLabel').textContent = `${state.days} jours`;
  if($('#lunchToggle')) $('#lunchToggle').checked = state.lunch;
  if($('#hoursToggle')) $('#hoursToggle').checked = state.hours;
}
function openCellDialog(cellKey, isLunch) {

    if (!$('#cellDialog')) return;

    populateDialogOptions();

    const item = state.schedule.cells[cellKey] || normalizeCell({});
    $('#editingKey').value = cellKey;

    // Cours
    $('#cellCourse').value = item.courseId || '';

    // Groupe
    $('#cellGroup').value = item.groupId || '';

    // Salle
    $('#cellRoom').value = item.room || '';

    // Heure
    $('#cellTime').value = item.time || '';

    // Note
    $('#cellNote').value = item.note || '';

    // Type de case
    $('#cellType').value = item.type || 'course';

    // Alignement du texte
    $('#cellTextAlign').value = item.text?.align || 'top-left';

    // Couleur du texte
    $('#cellTextColor').value = item.text?.color || '#000000';

    // Mode de couleur du groupe
    $('#cellGroupColorMode').value = item.groupColorMode || 'dot';

    // Pastille de couleur du groupe dans le dialog
    const group = getGroup(item.groupId);
    const badge = $('#cellGroupColorBadge');
    if (badge) {
        badge.style.background = group?.color || '#ccc';
        badge.style.display = group ? 'inline-block' : 'none';
    }

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
function bindBuilder() {

    if (!$('#scheduleGrid')) {
        return;
    }

    /*
     * S'assurer que les données sont en v2.
     */
    ensureScheduleModel();

    syncMetaFields();

    bindMetaFields();

    syncControls();

    populateDialogOptions();


    /*
     * Thème initial.
     */
    const initialTheme =
        state.themeOptions ||
        themePresets[state.theme] ||
        themePresets.forest;

    applyTheme(
        initialTheme,
        false
    );


    /*
     * Première génération de la grille.
     */
    renderGrid();


    /*
     * ==========================================================
     * CONTRÔLES EXISTANTS
     * ==========================================================
     */

    $('#amCount')?.addEventListener(
        'change',
        e => {

            state.am =
                Number(e.target.value);

            rebuildScheduleRows();

            persist();

            renderGrid();
        }
    );


    $('#pmCount')?.addEventListener(
        'change',
        e => {

            state.pm =
                Number(e.target.value);

            rebuildScheduleRows();

            persist();

            renderGrid();
        }
    );


    $('#lunchToggle')?.addEventListener(
        'change',
        e => {

            state.lunch =
                e.target.checked;

            rebuildScheduleRows();

            persist();

            renderGrid();
        }
    );


    $('#hoursToggle')?.addEventListener(
        'change',
        e => {

            state.hours =
                e.target.checked;

            persist();

            renderGrid();
        }
    );


    $('#dayCount')?.addEventListener(
        'input',
        e => {

            state.days =
                Number(e.target.value);

            persist();

            syncControls();

            renderGrid();
        }
    );


    /*
     * ==========================================================
     * REMPLISSAGE RAPIDE
     * ==========================================================
     */

    $('#quickFill')?.addEventListener(
        'click',
        () => {

            rows()
                .filter(
                    row =>
                        row.type === 'course'
                )
                .forEach(
                    (row, i) => {

                        for (
                            let d = 1;
                            d <= state.days;
                            d++
                        ) {

                            state.schedule.cells[
                                key(row.slot, d)
                            ] = normalizeCell({

                                courseId:
                                    state
                                        .courses[
                                        i %
                                        state.courses.length
                                    ]?.id || '',

                                groupId:
                                    state
                                        .groups[
                                        d %
                                        state.groups.length
                                    ]?.id || '',

                                room: '',

                                time:
                                    row.defaultTime ||
                                    hourFor(i),

                                note: ''
                            });
                        }
                    }
                );

            /*
             * Alias de compatibilité.
             */
            state.data =
                state.schedule.cells;

            persist();

            renderGrid();
        }
    );


    /*
     * ==========================================================
     * EFFACER LA GRILLE
     * ==========================================================
     */

    $('#clearGrid')?.addEventListener(
        'click',
        () => {

            state.schedule.cells = {};

            state.data =
                state.schedule.cells;

            persist();

            renderGrid();
        }
    );


    /*
     * ==========================================================
     * SAUVEGARDE LOCALE
     * ==========================================================
     */

    $('#saveLocal')?.addEventListener(
        'click',
        () => {

            persist();

            alert(
                'Horaire sauvegardé dans ce navigateur.'
            );
        }
    );


    /*
     * ==========================================================
     * CHARGEMENT LOCAL
     * ==========================================================
     */

    $('#loadLocal')?.addEventListener(
        'click',
        () => {

            state =
                loadState();

            syncMetaFields();

            syncControls();

            applyTheme(
                state.themeOptions ||
                themePresets[state.theme] ||
                themePresets.forest,
                false
            );

            renderGrid();

            alert(
                'Horaire chargé.'
            );
        }
    );


    /*
     * ==========================================================
     * ÉDITION D'UNE CASE
     * ==========================================================
     */

    $('#cellForm')?.addEventListener('submit', e => {
        e.preventDefault();

        const cellKey = $('#editingKey').value;

        const courseId = $('#cellCourse').value;
        const groupId = $('#cellGroup').value;
        const room = $('#cellRoom').value.trim();
        const time = $('#cellTime').value;
        const note = $('#cellNote').value.trim();
        const type = $('#cellType').value;
        const textAlign = $('#cellTextAlign').value;
        const textColor = $('#cellTextColor').value;
        const groupColorMode = $('#cellGroupColorMode').value;

        const normalized = normalizeCell({
            courseId,
            groupId,
            room,
            time,
            note,
            type,
            groupColorMode,
            text: {
                align: textAlign,
                color: textColor,
                wrap: true,
                showGenericLabel: false
            }
        });

        state.schedule.cells[cellKey] = normalized;
        state.data = state.schedule.cells;

        persist();
        $('#cellDialog').close();
        renderGrid();
    });

    /*
     * ==========================================================
     * SUPPRESSION D'UNE CASE
     * ==========================================================
     */

    $('#deleteCell')?.addEventListener('click', () => {
    const cellKey = $('#editingKey').value;

    delete state.schedule.cells[cellKey];
    state.data = state.schedule.cells;

    persist();
    $('#cellDialog').close();
    renderGrid();
});

    /*
     * ==========================================================
     * THÈMES
     * ==========================================================
     */

    $$('.theme').forEach(
        btn => {

            btn.addEventListener(
                'click',
                () => {

                    $$('.theme').forEach(
                        item =>
                            item.classList.remove(
                                'active'
                            )
                    );

                    btn.classList.add(
                        'active'
                    );

                    state.theme =
                        btn.dataset.theme;

                    state.themeOptions =
                        themePresets[
                        btn.dataset.theme
                        ];

                    applyTheme(
                        state.themeOptions
                    );
                }
            );
        }
    );


    [
        'themeFont',
        'themeLine',
        'themeAccent',
        'themeTexture',
        'themeImperfections',
        'themeHeader',
        'themeBackground',
        'themePalette'
    ].forEach(
        id => {

            $('#' + id)?.addEventListener(
                'change',
                () =>
                    applyTheme(
                        currentThemeValues()
                    )
            );

        }
    );


    $('#previewTheme')?.addEventListener(
        'click',
        () => {

            applyTheme(
                currentThemeValues()
            );

            $('#scheduleWrapper')
                ?.classList
                .add('theme-flash');

            setTimeout(
                () =>
                    $('#scheduleWrapper')
                        ?.classList
                        .remove(
                            'theme-flash'
                        ),
                650
            );
        }
    );


    $('#toggleThemeEditor')
        ?.addEventListener(
            'click',
            () => {

                const editor =
                    $('#themeEditor');

                editor.classList.toggle(
                    'collapsed'
                );

                $('#toggleThemeEditor')
                    .textContent =
                    editor.classList.contains(
                        'collapsed'
                    )
                        ? 'Ouvrir'
                        : 'Fermer';
            }
        );


    /*
     * ==========================================================
     * IMPRESSION
     * ==========================================================
     */

    function preparePrint() {

        syncPrintDetails();

        document.body.classList.add(
            'printing-schedule'
        );

        setTimeout(
            () => window.print(),
            80
        );
    }

    window.addEventListener(
        'afterprint',
        () =>
            document.body.classList.remove(
                'printing-schedule'
            )
    );

    $('#printBtn')
        ?.addEventListener(
            'click',
            preparePrint
        );

    $('#generateBtn')
        ?.addEventListener(
            'click',
            preparePrint
        );
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
  $('#groupTabs').innerHTML = state.groups.map(g => `
    <li>
      <button class="${g.id === state.selectedGroupId ? 'active' : ''}" data-select-group="${g.id}">
        <span class="group-swatch" style="display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle;margin-right:8px;background:${g.color || '#4f7cff'}"></span>
        ${g.name}<br><small>${g.level || 'Niveau non précisé'}</small>
      </button>
    </li>
  `).join('');
  $('#groupEditorTitle').textContent = `Détails - ${group.name}`;
  $('#editGroupName').value = group.name || '';
  $('#editGroupLevel').value = group.level || '';
  $('#editGroupTeacher').value = group.teacher || '';
  $('#editGroupRoom').value = group.room || '';
  // Couleur du groupe (nouveau champ)
  if($('#editGroupColor')) $('#editGroupColor').value = group.color || '#4f7cff';
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
    $('#newGroupBtn')?.addEventListener(
        'click',
        () => {

            const id =
                makeId('g');

            state.groups.push({

                id,

                name:
                    'Nouveau groupe',

                level: '',

                teacher: '',

                room: '',

                notes: '',

                /*
                 * Nouvelle propriété Phase 1.
                 */
                color: '#4f7cff'
            });

            state.selectedGroupId =
                id;

            persist();

            renderGroupWorkspace();
        }
    );
    // Enregistrer les détails du groupe (y compris la couleur)
    $('#saveGroupDetails')?.addEventListener('click', () => {
        const group = getGroup(state.selectedGroupId);
        if(!group) return;
        group.name = $('#editGroupName').value.trim();
        group.level = $('#editGroupLevel').value.trim();
        group.teacher = $('#editGroupTeacher').value.trim();
        group.room = $('#editGroupRoom').value.trim();
        group.notes = $('#editGroupNotes').value.trim();
        const colorField = $('#editGroupColor');
        if(colorField) group.color = colorField.value || group.color || '#4f7cff';
        persist();
        renderGroupWorkspace();
        renderGrid();
    });
  $('#deleteGroupBtn')?.addEventListener('click', () => { const id = state.selectedGroupId; state.groups = state.groups.filter(g => g.id !== id); state.students = state.students.filter(s => s.groupId !== id); Object.values(state.data).forEach(cell => { if(cell.groupId === id) cell.groupId = ''; }); state.selectedGroupId = state.groups[0]?.id || ''; persist(); renderGroupWorkspace(); });
  $('#addStudentToGroup')?.addEventListener('click', () => { const name = $('#newStudentName').value.trim(); if(!name || !state.selectedGroupId) return; state.students.push({id:makeId('s'), name, groupId:state.selectedGroupId, info:$('#newStudentInfo').value.trim()}); $('#newStudentName').value=''; $('#newStudentInfo').value=''; persist(); renderGroupStudents(); });
}

function bindCertificates(){
  const update = () => { if($('#certNameView')) $('#certNameView').textContent = $('#certName')?.value || 'Nom de l’élève'; if($('#certReasonView')) $('#certReasonView').textContent = $('#certReason')?.value || 'Réussite'; };
  $('#certName')?.addEventListener('input', update);
  $('#certReason')?.addEventListener('input', update);
  update();
}

function showSaveConfirmation(success, message){
  let toast = document.getElementById('logoutSaveConfirmation');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'logoutSaveConfirmation';
    toast.className = 'logout-save-confirmation';
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);
  }
  toast.className = `logout-save-confirmation ${success ? 'is-success' : 'is-error'} is-visible`;
  toast.innerHTML = `<span class="logout-save-icon">${success ? '✓' : '!'}</span><div><strong>${success ? 'Sauvegarde confirmée' : 'Attention'}</strong><p>${message}</p></div>`;
  if(!success){
    clearTimeout(toast.hideTimer);
    toast.hideTimer = setTimeout(() => toast.classList.remove('is-visible'), 5000);
  }
}

async function initializePlanifProf(){
  state = await loadSupabaseState();
  bindBuilder();
  bindLibrary();
  bindGroups();
  bindCertificates();
  bindAdvancedGroupTools();
  const header = document.querySelector('.site-header');
  if(header && currentSession && !document.getElementById('accountBadge')){
    const account = document.createElement('div');
    account.id = 'accountBadge';
    account.className = 'account-badge';
    const displayName = currentSession.user.user_metadata?.display_name || currentSession.user.email?.split('@')[0] || 'Compte';
    account.innerHTML = `<span class="account-avatar">${displayName.charAt(0).toUpperCase()}</span><span><small>Connecté</small><strong>${displayName}</strong></span>`;
    header.appendChild(account);
    const { data: adminRow } = await window.PlanifProfSupabase.from('admin_users').select('user_id').eq('user_id', currentSession.user.id).maybeSingle();
    if(adminRow && !document.querySelector('a[href="admin.html"]')){
      const adminLink = document.createElement('a');
      adminLink.href = 'admin.html'; adminLink.className = 'admin-header-link'; adminLink.textContent = 'Administration';
      header.querySelector('.main-nav')?.appendChild(adminLink);
    }
  }
  if(header && currentSession && !document.getElementById('logoutBtn')){
    const btn = document.createElement('button');
    btn.id = 'logoutBtn';
    btn.className = 'logout-btn';
    btn.textContent = 'Déconnexion';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Sauvegarde...';
      clearTimeout(saveTimer);
      const result = await saveStateToSupabase();
      if(!result.success && !result.localOnly){
        btn.disabled = false;
        btn.textContent = 'Déconnexion';
        showSaveConfirmation(false, 'La sauvegarde a échoué. La déconnexion a été annulée pour éviter une perte de données.');
        return;
      }
      showSaveConfirmation(true, 'Toutes vos modifications ont été sauvegardées. Déconnexion en cours...');
      await new Promise(resolve => setTimeout(resolve, 1200));
      if(window.PlanifProfSupabase){
        const { error } = await window.PlanifProfSupabase.auth.signOut({ scope: 'local' });
        if(error){
          btn.disabled = false;
          btn.textContent = 'Déconnexion';
          showSaveConfirmation(false, 'Les données sont sauvegardées, mais la déconnexion a échoué. Réessayez.');
          return;
        }
      }
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

/* ============================================================
   PLANIFPROF — PHASE 2
   GESTION FLEXIBLE DU TEMPS
   ============================================================

   Installation :
   - conserver tout le script existant
   - coller ce bloc tout à la fin
   - aucun autre code à supprimer

   Fonctionnalités :
   ✓ heure par ligne
   ✓ heure par case
   ✓ dîner individuel par jour
   ✓ pause / récréation personnalisable
   ✓ ajout de pauses
   ✓ suppression de pauses
   ✓ texte personnalisé
   ✓ couleur du groupe
   ✓ compatibilité v2
   ============================================================ */

(function PlanifProfPhase2() {

    'use strict';


    /*
     * ----------------------------------------------------------
     * État interne
     * ----------------------------------------------------------
     */

    let phase2Ready = false;


    const PHASE2_DEFAULT_BREAK_HEIGHT = 55;


    /*
     * ----------------------------------------------------------
     * Utilitaires
     * ----------------------------------------------------------
     */

    function p2$(selector) {
        return document.querySelector(selector);
    }


    function p2$$(selector) {
        return Array.from(
            document.querySelectorAll(selector)
        );
    }


    function p2EnsureModel() {

        if (
            !window.state &&
            typeof state === 'undefined'
        ) {
            return false;
        }


        if (
            !state.schedule
        ) {
            state.schedule = {
                rows: [],
                cells: {},
                settings: {
                    rowHeight: 90,
                    cellWidth: null
                }
            };
        }


        if (
            !Array.isArray(
                state.schedule.rows
            )
        ) {
            state.schedule.rows = [];
        }


        if (
            !state.schedule.cells ||
            typeof state.schedule.cells !== 'object'
        ) {
            state.schedule.cells =
                state.data || {};
        }


        /*
         * Compatibilité avec l'ancien code.
         */
        state.data =
            state.schedule.cells;


        return true;
    }


    function p2NormalizeCell(cell) {

        const source =
            cell &&
                typeof cell === 'object'
                ? cell
                : {};


        return {

            ...source,

            courseId:
                source.courseId || '',

            groupId:
                source.groupId || '',

            room:
                source.room || '',

            time:
                source.time || '',

            note:
                source.note || '',

            type:
                source.type || 'course',

            label:
                source.label || '',

            groupColorMode:
                source.groupColorMode ||
                'dot',

            text: {

                color: '',

                align: 'center',

                vertical: 'center',

                wrap: true,

                showGenericLabel: true,

                ...(source.text || {})

            },

            size: {

                width: null,

                height: null,

                ...(source.size || {})

            }

        };

    }


    function p2GetRow(rowId) {

        return (
            state.schedule.rows || []
        ).find(
            row =>
                row.id === rowId
        );

    }


    function p2CellKey(rowId, day) {

        return `${rowId}-${day}`;

    }


    function p2GetCell(rowId, day) {

        const cellKey =
            p2CellKey(
                rowId,
                day
            );


        if (
            !state.schedule.cells[
            cellKey
            ]
        ) {

            const row =
                p2GetRow(rowId);


            state.schedule.cells[
                cellKey
            ] =
                p2NormalizeCell({

                    type:
                        row?.type ||
                        'course',

                    time:
                        row?.defaultTime ||
                        ''

                });

        }


        return state.schedule.cells[
            cellKey
        ];

    }


    function p2Persist() {

        state.data =
            state.schedule.cells;


        if (
            typeof persist === 'function'
        ) {
            persist();
        }

    }


    /*
     * ----------------------------------------------------------
     * Création d'une pause
     * ----------------------------------------------------------
     */

    function p2CreateBreak() {

        p2EnsureModel();


        const existing =
            state.schedule.rows
                .filter(
                    row =>
                        row.type === 'break'
                );


        const number =
            existing.length + 1;


        const breakRow = {

            id:
                'break-' +
                Date.now().toString(36) +
                '-' +
                Math.random()
                    .toString(36)
                    .slice(2, 7),

            type:
                'break',

            label:
                `Récréation ${number}`,

            defaultTime:
                '',

            height:
                PHASE2_DEFAULT_BREAK_HEIGHT

        };


        /*
         * On place la pause avant le premier
         * PM lorsqu'il existe.
         */
        const pmIndex =
            state.schedule.rows.findIndex(
                row =>
                    String(row.id)
                        .startsWith('pm')
            );


        if (pmIndex >= 0) {

            state.schedule.rows.splice(
                pmIndex,
                0,
                breakRow
            );

        } else {

            state.schedule.rows.push(
                breakRow
            );

        }


        p2Persist();

        p2RenderGrid();

    }


    /*
     * ----------------------------------------------------------
     * Suppression d'une pause
     * ----------------------------------------------------------
     */

    function p2DeleteBreak(rowId) {

        p2EnsureModel();


        const row =
            p2GetRow(rowId);


        if (!row) {
            return;
        }


        if (
            row.type !== 'break'
        ) {
            return;
        }


        const confirmed =
            window.confirm(
                `Supprimer « ${row.label || 'Récréation'} » ?`
            );


        if (!confirmed) {
            return;
        }


        state.schedule.rows =
            state.schedule.rows.filter(
                item =>
                    item.id !== rowId
            );


        /*
         * Supprimer également les cases
         * de cette ligne.
         */
        Object.keys(
            state.schedule.cells
        ).forEach(
            cellKey => {

                if (
                    cellKey.startsWith(
                        `${rowId}-`
                    )
                ) {

                    delete state
                        .schedule
                        .cells[
                        cellKey
                    ];

                }

            }
        );


        p2Persist();

        p2RenderGrid();

    }


    /*
     * ----------------------------------------------------------
     * Modification de l'heure d'une ligne
     * ----------------------------------------------------------
     */

    function p2ApplyRowTime(
        rowId,
        time
    ) {

        p2EnsureModel();


        const row =
            p2GetRow(rowId);


        if (!row) {
            return;
        }


        row.defaultTime =
            time;


        /*
         * Applique l'heure à TOUTES
         * les cases de la ligne.
         */
        for (
            let day = 1;
            day <= Number(state.days || 0);
            day++
        ) {

            const cell =
                p2GetCell(
                    rowId,
                    day
                );


            cell.time =
                time;

        }


        p2Persist();

        p2RenderGrid();

    }


    /*
     * ----------------------------------------------------------
     * Édition d'une cellule spéciale
     * ----------------------------------------------------------
     */

    function p2EnsureDialogFields() {

        const dialog =
            p2$('#cellDialog');


        if (!dialog) {
            return;
        }


        /*
         * Si les champs existent déjà,
         * ne rien faire.
         */
        if (
            p2$('#p2CellType')
        ) {
            return;
        }


        const form =
            p2$('#cellForm');


        if (!form) {
            return;
        }


        const existingGrid =
            form.querySelector(
                '.dialog-grid'
            );


        if (!existingGrid) {
            return;
        }


        /*
         * TYPE
         */
        const typeLabel =
            document.createElement(
                'label'
            );


        typeLabel.id =
            'p2CellTypeField';


        typeLabel.innerHTML = `

            Type

            <select
                id="p2CellType"
            >

                <option value="course">
                    Cours
                </option>

                <option value="lunch">
                    Dîner
                </option>

                <option value="break">
                    Récréation / Pause
                </option>

            </select>

        `;


        /*
         * TEXTE
         */
        const textLabel =
            document.createElement(
                'label'
            );


        textLabel.id =
            'p2CellLabelField';


        textLabel.className =
            'p2-special-field';


        textLabel.innerHTML = `

            Texte affiché

            <input
                id="p2CellLabel"
                type="text"
                maxlength="100"
                placeholder="Ex. Surveillance"
            >

        `;


        existingGrid.prepend(
            textLabel
        );


        existingGrid.prepend(
            typeLabel
        );


        /*
         * Ajouter un bouton supprimer
         * une pause directement au dialogue.
         */
        const actions =
            form.querySelector(
                '.dialog-actions'
            );


        if (actions) {

            const deleteBreak =
                document.createElement(
                    'button'
                );


            deleteBreak.type =
                'button';


            deleteBreak.id =
                'p2DeleteBreak';


            deleteBreak.className =
                'btn btn-danger p2-delete-break';


            deleteBreak.textContent =
                'Supprimer la pause';


            actions.prepend(
                deleteBreak
            );


            deleteBreak.addEventListener(
                'click',
                () => {

                    const cellKey =
                        p2$('#editingKey')
                            ?.value;


                    if (!cellKey) {
                        return;
                    }


                    const rowId =
                        cellKey.split('-')[0];


                    p2DeleteBreak(
                        rowId
                    );


                    p2$('#cellDialog')
                        ?.close();

                }
            );

        }

    }


    /*
     * ----------------------------------------------------------
     * Ouvre notre dialogue Phase 2
     * ----------------------------------------------------------
     */

    function p2OpenDialog(
        cellKey
    ) {

        p2EnsureModel();

        p2EnsureDialogFields();


        const dialog =
            p2$('#cellDialog');


        if (!dialog) {
            return;
        }


        const rowId =
            cellKey.split('-')[0];


        const row =
            p2GetRow(rowId);


        if (!row) {
            return;
        }


        const cell =
            state.schedule.cells[
            cellKey
            ] ||
            p2NormalizeCell({

                type:
                    row.type,

                time:
                    row.defaultTime

            });


        /*
         * Sauvegarde de la cellule.
         */
        state.schedule.cells[
            cellKey
        ] =
            p2NormalizeCell(cell);


        p2$('#editingKey').value =
            cellKey;


        /*
         * Type.
         */
        const type =
            p2$('#p2CellType');


        if (type) {

            type.value =
                row.type ||
                cell.type ||
                'course';

        }


        /*
         * Texte spécial.
         */
        const label =
            p2$('#p2CellLabel');


        if (label) {

            label.value =
                cell.label ||
                row.label ||
                '';

        }


        /*
         * Champs existants.
         */
        const course =
            p2$('#cellCourse');


        const group =
            p2$('#cellGroup');


        const room =
            p2$('#cellRoom');


        const time =
            p2$('#cellTime');


        const note =
            p2$('#cellNote');


        if (
            typeof populateDialogOptions ===
            'function'
        ) {

            populateDialogOptions();

        }


        if (course) {

            course.value =
                cell.courseId ||
                '';

        }


        if (group) {

            group.value =
                cell.groupId ||
                '';

        }


        if (room) {

            room.value =
                cell.room ||
                '';

        }


        if (time) {

            time.value =
                cell.time ||
                row.defaultTime ||
                '';

        }


        if (note) {

            note.value =
                cell.note ||
                '';

        }


        p2UpdateDialogVisibility();


        /*
         * Titre.
         */
        const title =
            dialog.querySelector(
                '#cellDialogTitle, h3'
            );


        if (title) {

            title.textContent =
                row.type === 'lunch'
                    ? 'Modifier le dîner'
                    : row.type === 'break'
                        ? 'Modifier la pause'
                        : 'Modifier la case';

        }


        if (
            typeof dialog.showModal ===
            'function'
        ) {

            dialog.showModal();

        }

    }


    /*
     * ----------------------------------------------------------
     * Affichage dynamique du dialogue
     * ----------------------------------------------------------
     */

    function p2UpdateDialogVisibility() {

        const type =
            p2$('#p2CellType')?.value ||
            'course';


        const special =
            type === 'lunch' ||
            type === 'break';


        [
            '#cellCourse',
            '#cellGroup',
            '#cellRoom'
        ].forEach(
            selector => {

                const element =
                    p2$(selector);


                const field =
                    element?.closest(
                        'label'
                    );


                if (field) {

                    field.classList.toggle(
                        'p2-hidden-field',
                        special
                    );

                }

            }
        );


        const labelField =
            p2$('#p2CellLabelField');


        if (labelField) {

            labelField.classList.toggle(
                'p2-hidden-field',
                !special
            );

        }


        /*
         * Suppression d'une pause
         * seulement si c'est une pause.
         */
        const deleteButton =
            p2$('#p2DeleteBreak');


        if (deleteButton) {

            deleteButton.style.display =
                type === 'break'
                    ? ''
                    : 'none';

        }

    }


    /*
     * ----------------------------------------------------------
     * Sauvegarde du dialogue Phase 2
     * ----------------------------------------------------------
     */

    function p2SaveDialog() {

        p2EnsureModel();


        const cellKey =
            p2$('#editingKey')
                ?.value;


        if (!cellKey) {
            return;
        }


        const rowId =
            cellKey.split('-')[0];


        const row =
            p2GetRow(rowId);


        if (!row) {
            return;
        }


        const type =
            p2$('#p2CellType')
                ?.value ||
            row.type ||
            'course';


        const time =
            p2$('#cellTime')
                ?.value ||
            row.defaultTime ||
            '';


        const label =
            p2$('#p2CellLabel')
                ?.value
                .trim() ||
            '';


        const courseId =
            type === 'course'
                ? (
                    p2$('#cellCourse')
                        ?.value ||
                    ''
                )
                : '';


        const groupId =
            type === 'course'
                ? (
                    p2$('#cellGroup')
                        ?.value ||
                    ''
                )
                : '';


        const room =
            type === 'course'
                ? (
                    p2$('#cellRoom')
                        ?.value
                        .trim() ||
                    ''
                )
                : '';


        const note =
            p2$('#cellNote')
                ?.value
                .trim() ||
            '';


        /*
         * Mettre à jour la ligne
         * lorsque l'utilisateur choisit
         * Dîner / Pause.
         */
        row.type =
            type;


        if (type === 'lunch') {

            if (label) {
                row.label =
                    label;
            } else if (
                !row.label ||
                row.label.startsWith('Cours')
            ) {
                row.label =
                    'Dîner';
            }

        }


        if (type === 'break') {

            if (label) {

                row.label =
                    label;

            } else if (
                !row.label ||
                row.label.startsWith('Cours')
            ) {

                row.label =
                    'Récréation';

            }

        }


        /*
         * Important :
         * le label est stocké dans la cellule.
         *
         * Cela permet à chaque journée
         * d'avoir un texte différent.
         */
        state.schedule.cells[
            cellKey
        ] =
            p2NormalizeCell({

                courseId,

                groupId,

                room,

                time,

                note,

                type,

                label:
                    label ||
                    row.label

            });


        /*
         * L'heure saisie pour une nouvelle ligne
         * devient sa valeur par défaut.
         */
        if (
            !row.defaultTime &&
            time
        ) {

            row.defaultTime =
                time;

        }


        p2Persist();


        p2$('#cellDialog')
            ?.close();


        p2RenderGrid();

    }


    /*
     * ----------------------------------------------------------
     * Rendu complet de la grille
     * ----------------------------------------------------------
     */

    function p2RenderGrid() {

        if (
            !p2EnsureModel()
        ) {
            return;
        }


        const grid =
            p2$('#scheduleGrid');


        if (!grid) {
            return;
        }


        const days =
            Number(
                state.days || 1
            );


        grid.style.setProperty(
            '--days',
            days
        );


        /*
         * En-tête.
         */
        grid.innerHTML = `

            <div
                class="schedule-corner p2-time-header"
            >
                Heure
            </div>

            ${Array
                .from(
                    {
                        length: days
                    },
                    (_, index) => `
                            <div
                                class="day-title"
                                role="columnheader"
                            >
                                Jour ${index + 1}
                            </div>
                        `
                )
                .join('')
            }

        `;


        const lunchIcons = [
            '🍎',
            '🍉',
            '🥪',
            '🍓',
            '🥗',
            '🍊',
            '🍒',
            '🥝',
            '🍐',
            '🧁'
        ];


        /*
         * Toutes les lignes.
         */
        state.schedule.rows
            .forEach(
                (
                    row,
                    rowIndex
                ) => {

                    /*
                     * ------------------------------------------------
                     * Colonne heure
                     * ------------------------------------------------
                     */
                    grid.insertAdjacentHTML(
                        'beforeend',
                        `

                            <div
                                class="
                                    row-time-editor
                                    ${row.type === 'lunch' ||
                            row.type === 'break'
                            ? 'row-time-special'
                            : ''
                        }
                                "
                            >

                                <span
                                    class="row-time-label"
                                >
                                    ${row.label || ''}
                                </span>

                                <input
                                    type="time"
                                    class="row-time-input"
                                    data-p2-row-time="${row.id}"
                                    value="${row.defaultTime ||
                        ''
                        }"
                                    aria-label="
                                        Heure de ${row.label || 'la période'}
                                    "
                                >

                            </div>

                        `
                    );


                    /*
                     * ------------------------------------------------
                     * Cases
                     * ------------------------------------------------
                     */
                    for (
                        let day = 1;
                        day <= days;
                        day++
                    ) {

                        const cellKey =
                            p2CellKey(
                                row.id,
                                day
                            );


                        const existing =
                            state.schedule.cells[
                            cellKey
                            ];


                        const cell =
                            p2NormalizeCell(
                                existing || {
                                    type:
                                        row.type,

                                    time:
                                        row.defaultTime
                                }
                            );


                        const course =
                            typeof getCourse ===
                                'function'
                                ? getCourse(
                                    cell.courseId
                                )
                                : null;


                        const group =
                            typeof getGroup ===
                                'function'
                                ? getGroup(
                                    cell.groupId
                                )
                                : null;


                        const groupColor =
                            group?.color ||
                            '#4f7cff';


                        const courseColor =
                            course?.color ||
                            '#4f7cff';


                        const effectiveType =
                            cell.type ||
                            row.type ||
                            'course';


                        const effectiveTime =
                            cell.time ||
                            row.defaultTime ||
                            '';


                        /*
                         * ------------------------------------------------
                         * Dîner / pause
                         * ------------------------------------------------
                         */
                        if (
                            effectiveType === 'lunch' ||
                            effectiveType === 'break'
                        ) {

                            const defaultLabel =
                                effectiveType === 'lunch'
                                    ? 'Dîner'
                                    : 'Récréation';


                            const label =
                                cell.label ||
                                row.label ||
                                defaultLabel;


                            const icon =
                                effectiveType === 'lunch'
                                    ? lunchIcons[
                                    (
                                        day - 1
                                    ) %
                                    lunchIcons.length
                                    ]
                                    : '☕';


                            grid.insertAdjacentHTML(
                                'beforeend',
                                `

                                    <button
                                        type="button"
                                        class="
                                            cell
                                            ${effectiveType === 'lunch'
                                    ? 'lunch-cell'
                                    : 'break-cell'
                                }
                                            p2-special-cell
                                        "
                                        data-p2-cell="${cellKey}"
                                        style="
                                            --group-color:${groupColor};
                                        "
                                        aria-label="
                                            ${label}
                                            ${effectiveTime
                                    ? `, ${effectiveTime}`
                                    : ''
                                }
                                        "
                                    >

                                        <span
                                            class="p2-special-icon"
                                            aria-hidden="true"
                                        >
                                            ${icon}
                                        </span>

                                        <div
                                            class="
                                                cell-content
                                                p2-special-content
                                            "
                                        >

                                            <strong
                                                class="
                                                    p2-special-label
                                                "
                                            >
                                                ${label}
                                            </strong>

                                            ${effectiveTime
                                    ? `
                                                        <span
                                                            class="time-label"
                                                        >
                                                            ${effectiveTime}
                                                        </span>
                                                    `
                                    : ''
                                }

                                        </div>

                                    </button>

                                `
                            );


                            continue;

                        }


                        /*
                         * ------------------------------------------------
                         * Case normale
                         * ------------------------------------------------
                         */

                        const mode =
                            cell.groupColorMode ||
                            'dot';


                        let groupIndicator =
                            '';


                        if (group) {

                            if (
                                mode === 'dot'
                            ) {

                                groupIndicator = `

                                    <span
                                        class="
                                            group-color-dot
                                        "
                                        style="
                                            background:${groupColor}
                                        "
                                        title="
                                            ${group.name}
                                        "
                                    ></span>

                                `;

                            }

                        }


                        const classes = [

                            'cell',

                            course
                                ? 'course-filled'
                                : '',

                            group
                                ? 'has-group'
                                : '',

                            mode === 'border'
                                ? 'p2-group-border'
                                : '',

                            mode === 'background'
                                ? 'p2-group-background'
                                : ''

                        ]
                            .filter(Boolean)
                            .join(' ');


                        grid.insertAdjacentHTML(
                            'beforeend',
                            `

                                <button
                                    type="button"
                                    class="${classes}"
                                    data-p2-cell="${cellKey}"
                                    style="
                                        --course-color:${courseColor};
                                        --group-color:${groupColor};
                                    "
                                    aria-label="
                                        ${course?.name ||
                            row.label ||
                            'Case'
                            }
                                    "
                                >

                                    <span
                                        class="placeholder"
                                    >
                                        ${cell.text?.showGenericLabel === false
                                ? ''
                                : (
                                    row.label ||
                                    ''
                                )
                            }
                                    </span>


                                    <div
                                        class="cell-content"
                                    >

                                        ${course
                                ? `
                                                    <span
                                                        class="course-pill"
                                                        style="
                                                            background:${courseColor};
                                                            border-color:${courseColor}
                                                        "
                                                    >
                                                        ${course.name}
                                                    </span>
                                                `
                                : ''
                            }


                                        ${group
                                ? `
                                                    <span
                                                        class="group-text"
                                                    >
                                                        ${groupIndicator}
                                                        ${group.name}
                                                    </span>
                                                `
                                : ''
                            }


                                        ${cell.room
                                ? `
                                                    <span
                                                        class="room-text"
                                                    >
                                                        Local :
                                                        ${cell.room}
                                                    </span>
                                                `
                                : ''
                            }


                                        ${cell.note
                                ? `
                                                    <span
                                                        class="note-text"
                                                    >
                                                        ${cell.note}
                                                    </span>
                                                `
                                : ''
                            }


                                        ${effectiveTime
                                ? `
                                                    <span
                                                        class="time-label"
                                                    >
                                                        ${effectiveTime}
                                                    </span>
                                                `
                                : ''
                            }

                                    </div>

                                </button>

                            `
                        );

                    }

                }
            );


        /*
         * ----------------------------------------------------------
         * Écouteurs heure des lignes
         * ----------------------------------------------------------
         */

        p2$$(
            '[data-p2-row-time]'
        ).forEach(
            input => {

                input.addEventListener(
                    'change',
                    () => {

                        p2ApplyRowTime(
                            input.dataset.p2RowTime,
                            input.value
                        );

                    }
                );

            }
        );


        /*
         * ----------------------------------------------------------
         * Écouteurs des cellules
         * ----------------------------------------------------------
         */

        p2$$(
            '[data-p2-cell]'
        ).forEach(
            cell => {

                cell.addEventListener(
                    'click',
                    () => {

                        p2OpenDialog(
                            cell.dataset.p2Cell
                        );

                    }
                );

            }
        );

    }


    /*
     * ----------------------------------------------------------
     * Installation du dialogue
     * ----------------------------------------------------------
     */

    function p2InstallDialog() {

        const form =
            p2$('#cellForm');


        if (!form) {
            return;
        }


        p2EnsureDialogFields();


        /*
         * IMPORTANT :
         *
         * On clone le formulaire afin de supprimer
         * les anciens listeners du Phase 1.
         *
         * Cela évite que deux sauvegardes se déclenchent.
         */
        const replacement =
            form.cloneNode(true);


        form.parentNode.replaceChild(
            replacement,
            form
        );


        /*
         * Recréer les champs Phase 2
         * après le clonage.
         */
        p2EnsureDialogFields();


        const newForm =
            p2$('#cellForm');


        if (!newForm) {
            return;
        }


        newForm.addEventListener(
            'submit',
            event => {

                event.preventDefault();

                p2SaveDialog();

            }
        );


        p2$('#p2CellType')
            ?.addEventListener(
                'change',
                p2UpdateDialogVisibility
            );

    }


    /*
     * ----------------------------------------------------------
     * Barre d'outils
     * ----------------------------------------------------------
     */

    function p2InstallToolbar() {

        if (
            p2$('#phase2Toolbar')
        ) {
            return;
        }


        const wrapper =
            p2$('#scheduleWrapper');


        const grid =
            p2$('#scheduleGrid');


        if (!wrapper || !grid) {
            return;
        }


        const toolbar =
            document.createElement(
                'div'
            );


        toolbar.id =
            'phase2Toolbar';


        toolbar.className =
            'phase2-toolbar';


        toolbar.innerHTML = `

            <div
                class="phase2-toolbar-info"
            >

                <strong>
                    Gestion flexible du temps
                </strong>

                <span>
                    Modifiez une heure à gauche
                    ou cliquez sur une case.
                </span>

            </div>


            <div
                class="phase2-toolbar-actions"
            >

                <button
                    type="button"
                    class="btn btn-soft"
                    id="p2AddBreak"
                >
                    ＋ Ajouter une pause
                </button>


                <button
                    type="button"
                    class="btn btn-soft"
                    id="p2ResetTimes"
                >
                    ↺ Réinitialiser les heures
                </button>

            </div>

        `;


        wrapper.parentNode.insertBefore(
            toolbar,
            wrapper
        );


        p2$('#p2AddBreak')
            ?.addEventListener(
                'click',
                p2CreateBreak
            );


        p2$('#p2ResetTimes')
            ?.addEventListener(
                'click',
                () => {

                    p2EnsureModel();


                    const defaultHours = [
                        '08:30',
                        '09:25',
                        '10:20',
                        '11:15',
                        '12:10',
                        '13:05',
                        '14:00',
                        '14:55',
                        '15:40',
                        '16:35'
                    ];


                    state.schedule.rows
                        .forEach(
                            (
                                row,
                                index
                            ) => {

                                const time =
                                    defaultHours[
                                    index
                                    ] || '';


                                row.defaultTime =
                                    time;


                                for (
                                    let day = 1;
                                    day <= Number(
                                        state.days || 0
                                    );
                                    day++
                                ) {

                                    const cell =
                                        p2GetCell(
                                            row.id,
                                            day
                                        );


                                    cell.time =
                                        time;

                                }

                            }
                        );


                    p2Persist();

                    p2RenderGrid();

                }
            );

    }


    /*
     * ----------------------------------------------------------
     * Synchronisation avec les contrôles existants
     * ----------------------------------------------------------
     */

    function p2InstallControlHooks() {

        /*
         * Quand le nombre de périodes AM/PM
         * change, la grille existante est reconstruite.
         *
         * On attend donc un peu puis on réinstalle
         * notre rendu.
         */

        [
            '#amCount',
            '#pmCount',
            '#lunchToggle',
            '#hoursToggle',
            '#dayCount'
        ].forEach(
            selector => {

                p2$(selector)
                    ?.addEventListener(
                        'change',
                        () => {

                            setTimeout(
                                () => {

                                    p2EnsureModel();

                                    p2RenderGrid();

                                },
                                30
                            );

                        }
                    );

            }
        );

    }


    /*
     * ----------------------------------------------------------
     * Activation
     * ----------------------------------------------------------
     */

    function p2Activate() {

        if (phase2Ready) {
            return;
        }


        if (
            !p2$('#scheduleGrid')
        ) {
            return;
        }


        if (
            !p2EnsureModel()
        ) {
            return;
        }


        /*
         * Il faut attendre que Supabase ait terminé
         * son chargement initial.
         *
         * On considère la grille prête si elle
         * possède des lignes v2.
         */
        if (
            !Array.isArray(
                state.schedule.rows
            )
        ) {
            return;
        }


        phase2Ready =
            true;


        p2InstallToolbar();

        p2InstallDialog();

        p2InstallControlHooks();

        p2RenderGrid();


        console.info(
            'PlanifProf Phase 2 activée.'
        );

    }


    /*
     * ----------------------------------------------------------
     * Attente du chargement initial
     * ----------------------------------------------------------
     *
     * initializePlanifProf() est asynchrone.
     *
     * Nous attendons donc que la grille ait été
     * construite avant d'activer Phase 2.
     */

    let attempts = 0;


    const waitTimer =
        setInterval(
            () => {

                attempts++;


                try {

                    if (
                        p2$('#scheduleGrid') &&
                        typeof state !==
                        'undefined'
                    ) {

                        p2Activate();

                    }


                } catch (error) {

                    console.warn(
                        'PlanifProf Phase 2 :',
                        error
                    );

                }


                if (
                    phase2Ready ||
                    attempts >= 100
                ) {

                    clearInterval(
                        waitTimer
                    );

                }

            },
            100
        );


    /*
     * ----------------------------------------------------------
     * Exposer une fonction de test
     * ----------------------------------------------------------
     */

    window.PlanifProfPhase2 = {

        activate:
            p2Activate,

        render:
            p2RenderGrid,

        addBreak:
            p2CreateBreak

    };


})();

/* ============================================================
PLANIFPROF — PHASE 2
CORRECTION GRILLE COMPACTE
============================================================ */

(function installPlanifProfPhase2() {

    /* ---------------------------------------------------------
       Utilitaires
       --------------------------------------------------------- */

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');


    const isBreakRow = (row) => {

        if (!row) return false;

        return [
            'break',
            'recreation',
            'pause'
        ].includes(row.type);

    };


    const getScheduleRows = () => {

        ensureScheduleModel();

        return Array.isArray(state.schedule.rows)
            ? state.schedule.rows
            : [];

    };


    const getScheduleCells = () => {

        ensureScheduleModel();

        state.schedule.cells =
            state.schedule.cells || {};

        state.data =
            state.schedule.cells;

        return state.schedule.cells;

    };


    /* ---------------------------------------------------------
       S'assure que les propriétés Phase 2 existent
       --------------------------------------------------------- */

    function normalizePhase2Rows() {

        ensureScheduleModel();

        const rows =
            Array.isArray(state.schedule.rows)
                ? state.schedule.rows
                : [];

        rows.forEach((row, index) => {

            if (!row.id) {
                row.id =
                    `${row.type || 'row'}_${Date.now()}_${index}`;
            }

            if (!row.type) {
                row.type = 'course';
            }

            if (!row.label) {

                row.label =
                    row.type === 'lunch'
                        ? 'Dîner'
                        : row.type === 'break'
                            ? `Récréation ${index + 1}`
                            : `Cours ${index + 1}`;

            }

            if (!row.defaultTime) {

                row.defaultTime =
                    hourFor(index);

            }

            if (!row.height) {

                row.height =
                    isBreakRow(row) || row.type === 'lunch'
                        ? 62
                        : 96;

            }

        });

        state.schedule.rows = rows;

        state.schedule.cells =
            state.schedule.cells || {};

        state.data =
            state.schedule.cells;

    }


    /* ---------------------------------------------------------
       RECONSTRUIT LES LIGNES
       MAIS CONSERVE LES PAUSES PERSONNALISÉES
       --------------------------------------------------------- */

    const originalRebuildScheduleRows =
        typeof rebuildScheduleRows === 'function'
            ? rebuildScheduleRows
            : null;


    rebuildScheduleRows = function phase2RebuildScheduleRows() {

        ensureScheduleModel();

        const currentRows =
            Array.isArray(state.schedule.rows)
                ? state.schedule.rows
                : [];


        /*
         * On conserve toutes les pauses créées
         * manuellement.
         */
        const customBreaks =
            currentRows
                .filter(isBreakRow)
                .map(row => ({
                    ...row
                }));


        /*
         * On reconstruit les lignes normales
         * à partir des contrôles AM / PM / dîner.
         */
        const baseRows =
            createLegacyRows(state);


        /*
         * On insère les pauses après le dîner.
         * Si le dîner est désactivé, elles sont placées
         * après les périodes AM.
         */
        let insertIndex =
            baseRows.findIndex(
                row =>
                    row.type === 'course' &&
                    row.id.startsWith('pm')
            );


        if (insertIndex < 0) {
            insertIndex = baseRows.length;
        }


        /*
         * Si aucun dîner n'existe, les pauses sont placées
         * après les cours AM.
         */
        if (!state.lunch) {

            insertIndex =
                baseRows.filter(
                    row => row.type === 'course'
                ).length;

        }


        baseRows.splice(
            insertIndex,
            0,
            ...customBreaks
        );


        state.schedule.rows =
            baseRows;

        state.schedule.cells =
            state.schedule.cells || {};

        state.data =
            state.schedule.cells;


        normalizePhase2Rows();

    };


    /* ---------------------------------------------------------
       AJOUTER UNE PAUSE
       --------------------------------------------------------- */

    function addPhase2Break() {

        ensureScheduleModel();

        normalizePhase2Rows();

        const rows =
            state.schedule.rows;

        const existingBreaks =
            rows.filter(isBreakRow);


        const nextNumber =
            existingBreaks.length + 1;


        const breakId =
            `break_${Date.now().toString(36)}_${Math.random()
                .toString(36)
                .slice(2, 7)}`;


        /*
         * Heure proposée :
         * on prend l'heure de la ligne précédente
         * puis on ajoute 5 minutes lorsque possible.
         */
        const referenceRow =
            rows
                .slice()
                .reverse()
                .find(
                    row =>
                        row.type === 'course' ||
                        row.type === 'lunch'
                );


        const referenceTime =
            referenceRow?.defaultTime ||
            '12:10';


        const newBreak = {

            id: breakId,

            type: 'break',

            label:
                `Récréation ${nextNumber}`,

            defaultTime:
                referenceTime,

            height:
                62

        };


        /*
         * Placement après le dîner.
         */
        let insertIndex =
            rows.findIndex(
                row =>
                    row.type === 'course' &&
                    row.id.startsWith('pm')
            );


        if (insertIndex < 0) {

            insertIndex =
                rows.length;

        }


        rows.splice(
            insertIndex,
            0,
            newBreak
        );


        /*
         * Créer des cases vides pour chaque journée.
         */
        getScheduleCells();

        for (
            let day = 1;
            day <= state.days;
            day++
        ) {

            state.schedule.cells[
                `${breakId}-${day}`
            ] = normalizeCell({

                courseId: '',
                groupId: '',
                room: '',
                time: referenceTime,
                note: '',

                text: {
                    color: '',
                    align: 'center',
                    vertical: 'center',
                    wrap: true,
                    showGenericLabel: false
                },

                groupColorMode: 'dot',

                size: {
                    width: null,
                    height: 62
                }

            });

        }


        state.data =
            state.schedule.cells;


        persist();

        renderGrid();

    }


    /* ---------------------------------------------------------
       SUPPRIMER UNE PAUSE
       --------------------------------------------------------- */

    function deletePhase2Break(rowId) {

        ensureScheduleModel();

        const rows =
            state.schedule.rows || [];


        const row =
            rows.find(
                item =>
                    item.id === rowId &&
                    isBreakRow(item)
            );


        if (!row) return;


        /*
         * Supprimer les cases de la pause.
         */
        for (
            let day = 1;
            day <= state.days;
            day++
        ) {

            delete state.schedule.cells[
                `${row.id}-${day}`
            ];

        }


        /*
         * Supprimer la ligne.
         */
        state.schedule.rows =
            rows.filter(
                item =>
                    item.id !== row.id
            );


        state.data =
            state.schedule.cells;


        persist();

        renderGrid();

    }


    /* ---------------------------------------------------------
       SUPPRIMER LA DERNIÈRE PAUSE
       --------------------------------------------------------- */

    function deleteLastPhase2Break() {

        const rows =
            getScheduleRows();


        const breaks =
            rows.filter(isBreakRow);


        if (!breaks.length) {

            return;

        }


        const lastBreak =
            breaks[breaks.length - 1];


        deletePhase2Break(
            lastBreak.id
        );

    }


    /* ---------------------------------------------------------
       MODIFIER L'HEURE D'UNE LIGNE
       --------------------------------------------------------- */

    function updatePhase2RowTime(
        rowId,
        newTime
    ) {

        if (!newTime) return;


        const rows =
            getScheduleRows();


        const row =
            rows.find(
                item =>
                    item.id === rowId
            );


        if (!row) return;


        /*
         * L'heure de la ligne devient la nouvelle
         * valeur par défaut.
         */
        row.defaultTime =
            newTime;


        /*
         * On applique volontairement l'heure à
         * TOUTES les journées de cette ligne.
         */
        const cells =
            getScheduleCells();


        for (
            let day = 1;
            day <= state.days;
            day++
        ) {

            const cellKey =
                `${rowId}-${day}`;


            cells[cellKey] =
                normalizeCell(
                    cells[cellKey] || {}
                );


            cells[cellKey].time =
                newTime;

        }


        state.data =
            state.schedule.cells;


        persist();

    }


    /* ---------------------------------------------------------
       RÉINITIALISER LES HEURES
       --------------------------------------------------------- */

    function resetPhase2Times() {

        const rows =
            getScheduleRows();


        const cells =
            getScheduleCells();


        rows.forEach(
            (row, index) => {

                const defaultTime =
                    hourFor(index);


                row.defaultTime =
                    defaultTime;


                for (
                    let day = 1;
                    day <= state.days;
                    day++
                ) {

                    const cellKey =
                        `${row.id}-${day}`;


                    cells[cellKey] =
                        normalizeCell(
                            cells[cellKey] || {}
                        );


                    cells[cellKey].time =
                        defaultTime;

                }

            }
        );


        state.data =
            state.schedule.cells;


        persist();

        renderGrid();

    }


    /* ---------------------------------------------------------
       RENDU DE LA GRILLE
       --------------------------------------------------------- */

    renderGrid = function phase2RenderGrid() {

        const grid =
            $('#scheduleGrid');


        if (!grid) return;


        ensureScheduleModel();

        normalizePhase2Rows();


        grid.style.setProperty(
            '--days',
            state.days
        );


        /*
         * EN-TÊTE
         */
        let html =

            `<div class="schedule-corner">
                HEURE
             </div>`;


        for (
            let day = 1;
            day <= state.days;
            day++
        ) {

            html +=
                `<div class="day-title">
                    Jour ${day}
                 </div>`;

        }


        const rows =
            getScheduleRows();


        const cells =
            getScheduleCells();


        rows.forEach(
            (row, rowIndex) => {

                const rowHeight =
                    isBreakRow(row) ||
                        row.type === 'lunch'
                        ? 62
                        : 96;


                row.height =
                    rowHeight;


                /*
                 * ------------------------------------------------
                 * COLONNE HEURE
                 * ------------------------------------------------
                 */

                html +=
                    `<div
                        class="p2-time-cell"
                        style="--row-height:${rowHeight}px"
                    >

                        <input
                            class="p2-time-input"
                            type="time"
                            value="${escapeHtml(
                        row.defaultTime ||
                        hourFor(rowIndex)
                    )}"
                            data-row-time="${escapeHtml(row.id)}"
                            aria-label="Heure de ${escapeHtml(row.label)}"
                        >

                        <span class="p2-row-label">
                            ${escapeHtml(row.label)}
                        </span>

                        ${isBreakRow(row)
                        ? `
                                    <button
                                        type="button"
                                        class="p2-delete-row"
                                        data-delete-break="${escapeHtml(row.id)}"
                                        title="Supprimer cette pause"
                                        aria-label="Supprimer ${escapeHtml(row.label)}"
                                    >
                                        ×
                                    </button>
                                  `
                        : ''
                    }

                    </div>`;


                /*
                 * ------------------------------------------------
                 * CASES DES JOURS
                 * ------------------------------------------------
                 */

                for (
                    let day = 1;
                    day <= state.days;
                    day++
                ) {

                    const cellKey =
                        `${row.id}-${day}`;


                    const item =
                        normalizeCell(
                            cells[cellKey] || {}
                        );


                    cells[cellKey] =
                        item;


                    const course =
                        getCourse(
                            item.courseId
                        );


                    const group =
                        getGroup(
                            item.groupId
                        );


                    /*
                     * PAUSE
                     */
                    if (
                        isBreakRow(row)
                    ) {

                        html +=
                            `<div
                                class="cell p2-break-cell"
                                style="--row-height:${rowHeight}px"
                                aria-label="${escapeHtml(row.label)}"
                            >

                                <div class="p2-break-content">

                                    <span class="p2-break-label">
                                        ☕
                                        ${escapeHtml(row.label)}
                                    </span>

                                </div>

                            </div>`;

                        continue;

                    }


                    /*
                     * DÎNER
                     */
                    if (
                        row.type === 'lunch'
                    ) {

                        const lunchIcons = [
                            '🍎',
                            '🍉',
                            '🥪',
                            '🍓',
                            '🥗',
                            '🍊',
                            '🍒',
                            '🥝',
                            '🍐'
                        ];


                        html +=
                            `<div
                                class="cell lunch-cell"
                                style="--row-height:${rowHeight}px"
                                aria-label="${escapeHtml(row.label || 'Dîner')}"
                            >

                                <div class="cell-content">

                                    <span class="group-text">
                                        ${escapeHtml(
                                row.label || 'Dîner'
                            )}
                                    </span>

                                </div>

                                <span class="lunch-icon">
                                    ${lunchIcons[(day - 1) % lunchIcons.length]}
                                </span>

                            </div>`;

                        continue;

                    }


                    /*
                     * ------------------------------------------------
                     * CASE NORMALE
                     * ------------------------------------------------
                     */

                    let cellClasses =
                        'cell';


                    /*
                     * Couleur du groupe
                     */
                    if (
                        group &&
                        item.groupColorMode === 'border'
                    ) {

                        cellClasses +=
                            ' p2-group-border';

                    }


                    if (
                        group &&
                        item.groupColorMode === 'background'
                    ) {

                        cellClasses +=
                            ' p2-group-background';

                    }


                    const groupStyle =
                        group
                            ? `--group-color:${escapeHtml(group.color || '#70c85d')};`
                            : '';


                    const courseStyle =
                        course
                            ? `--course-color:${escapeHtml(course.color || '#70c85d')};`
                            : '';


                    const textColor =
                        item.text?.color
                            ? `color:${escapeHtml(item.text.color)};`
                            : '';


                    const courseHtml =
                        course
                            ? `
                                <span
                                    class="course-pill"
                                    style="${courseStyle}"
                                >
                                    ${escapeHtml(course.name)}
                                </span>
                              `
                            : '';


                    const groupHtml =
                        group
                            ? `
                                <span
                                    class="group-text"
                                    style="${textColor}"
                                >
                                    ${escapeHtml(group.name)}
                                </span>
                              `
                            : '';


                    const roomHtml =
                        item.room
                            ? `
                                <span class="room-text">
                                    ${escapeHtml(item.room)}
                                </span>
                              `
                            : '';


                    const noteHtml =
                        item.note
                            ? `
                                <span class="note-text">
                                    ${escapeHtml(item.note)}
                                </span>
                              `
                            : '';


                    html +=
                        `<button
                            type="button"
                            class="${cellClasses}"
                            data-cell="${escapeHtml(cellKey)}"
                            style="
                                --row-height:${rowHeight}px;
                                ${groupStyle}
                            "
                        >

                            <div
                                class="cell-content"
                                style="
                                    ${textColor}
                                    text-align:${escapeHtml(
                            item.text?.align || 'left'
                        )};
                                "
                            >

                                ${courseHtml}

                                ${groupHtml}

                                ${roomHtml}

                                ${noteHtml}

                            </div>

                        </button>`;

                }

            }
        );


        grid.innerHTML =
            html;


        /*
         * --------------------------------------------------------
         * HEURES DE LIGNES
         * --------------------------------------------------------
         */

        grid
            .querySelectorAll('[data-row-time]')
            .forEach(
                input => {

                    input.addEventListener(
                        'change',
                        event => {

                            updatePhase2RowTime(
                                event.target.dataset.rowTime,
                                event.target.value
                            );

                            renderGrid();

                        }
                    );

                }
            );


        /*
         * --------------------------------------------------------
         * SUPPRESSION DES PAUSES
         * --------------------------------------------------------
         */

        grid
            .querySelectorAll('[data-delete-break]')
            .forEach(
                button => {

                    button.addEventListener(
                        'click',
                        event => {

                            event.preventDefault();

                            event.stopPropagation();

                            deletePhase2Break(
                                button.dataset.deleteBreak
                            );

                        }
                    );

                }
            );


        /*
         * --------------------------------------------------------
         * OUVERTURE DES CASES
         * --------------------------------------------------------
         */

        grid
            .querySelectorAll('[data-cell]')
            .forEach(
                cell => {

                    cell.addEventListener(
                        'click',
                        () => {

                            openCellDialog(
                                cell.dataset.cell,
                                false
                            );

                        }
                    );

                }
            );

    };


    /* ---------------------------------------------------------
       BIND DES BOUTONS
       --------------------------------------------------------- */

    function bindPhase2Controls() {

        const addBreak =
            $('#addBreak');


        const removeBreak =
            $('#removeBreak');


        const resetTimes =
            $('#resetRowTimes');


        if (addBreak &&
            !addBreak.dataset.phase2Bound) {

            addBreak.dataset.phase2Bound =
                'true';


            addBreak.addEventListener(
                'click',
                addPhase2Break
            );

        }


        if (removeBreak &&
            !removeBreak.dataset.phase2Bound) {

            removeBreak.dataset.phase2Bound =
                'true';


            removeBreak.addEventListener(
                'click',
                deleteLastPhase2Break
            );

        }


        if (resetTimes &&
            !resetTimes.dataset.phase2Bound) {

            resetTimes.dataset.phase2Bound =
                'true';


            resetTimes.addEventListener(
                'click',
                resetPhase2Times
            );

        }

    }


    /* ---------------------------------------------------------
       INITIALISATION
       --------------------------------------------------------- */

    function bootPhase2() {

        const grid =
            $('#scheduleGrid');


        if (!grid) return;


        ensureScheduleModel();

        normalizePhase2Rows();

        bindPhase2Controls();

        /*
         * Premier rendu.
         */
        renderGrid();

    }


    /*
     * Le chargement Supabase est asynchrone.
     * On attend donc que le state soit disponible.
     */
    let attempts = 0;


    const phase2Timer =
        setInterval(
            () => {

                attempts++;


                if (
                    $('#scheduleGrid') &&
                    typeof state !== 'undefined' &&
                    state.schedule &&
                    Array.isArray(
                        state.schedule.rows
                    )
                ) {

                    clearInterval(
                        phase2Timer
                    );

                    bootPhase2();

                }


                /*
                 * Sécurité : ne jamais laisser le timer
                 * tourner indéfiniment.
                 */
                if (
                    attempts > 200
                ) {

                    clearInterval(
                        phase2Timer
                    );

                }

            },
            50
        );


})();