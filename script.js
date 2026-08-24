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

function populateDialogOptions(){
  if($('#cellCourse')) $('#cellCourse').innerHTML = '<option value="">Aucun cours</option>' + state.courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if($('#cellGroup')) $('#cellGroup').innerHTML = '<option value="">Aucun groupe</option>' + state.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
}
function renderGrid() {

    const grid =
        $('#scheduleGrid');

    if (!grid) return;

    ensureScheduleModel();

    grid.style.setProperty(
        '--days',
        state.days
    );

    /*
     * En-tête des jours.
     */
    grid.innerHTML =
        `<div></div>` +
        Array
            .from(
                { length: state.days },
                (_, i) =>
                    `<div class="day-title">
             Jour ${i + 1}
           </div>`
            )
            .join('');

    const lunchIcons = [
        '🧁',
        '🍉',
        '🍰',
        '🍍',
        '🥗',
        '🍒',
        '🥬',
        '🍓',
        '🍩',
        '🍎'
    ];

    /*
     * Parcours des lignes v2.
     */
    rows().forEach(
        (row, rowIndex) => {

            /*
             * Les boutons + AM/PM continuent d'exister
             * pour l'interface actuelle.
             */
            const addTarget =
                row.type === 'course' &&
                    row.slot.startsWith('am')
                    ? 'am'
                    : row.type === 'course'
                        ? 'pm'
                        : '';

            grid.insertAdjacentHTML(
                'beforeend',

                addTarget
                    ? `
            <button
              class="row-add"
              data-add="${addTarget}"
              title="Ajouter un cours"
            >
              +
            </button>
          `
                    : '<div></div>'
            );


            /*
             * Cellules de chaque journée.
             */
            for (
                let day = 1;
                day <= state.days;
                day++
            ) {

                const cellKey =
                    key(
                        row.slot,
                        day
                    );

                /*
                 * On lit désormais le nouveau modèle.
                 */
                const item =
                    state.schedule.cells[cellKey] ||
                    {};

                const course =
                    getCourse(
                        item.courseId
                    );

                const group =
                    getGroup(
                        item.groupId
                    );


                /*
                 * Couleur du cours.
                 */
                const style =
                    course
                        ? `style="--course-color:${course.color}"`
                        : '';


                const classes = [
                    row.type === 'lunch'
                        ? 'lunch-cell'
                        : '',

                    course
                        ? 'course-filled'
                        : ''
                ]
                    .filter(Boolean)
                    .join(' ');


                /*
                 * Contenu d'un dîner.
                 */
                const content =
                    row.type === 'lunch'

                        ? `
              <div class="cell-content">

                <span class="group-text">
                  ${row.label || 'Dîner'}
                </span>

              </div>

              <span class="lunch-icon">
                ${lunchIcons[
                        (day - 1) %
                        lunchIcons.length
                        ]}
              </span>
            `

                        :

                        /*
                         * Contenu d'une case normale.
                         */
                        `
              <div class="cell-content">

                ${course
                            ? `
                      <span
                        class="course-pill"
                        style="
                          background:${course.color};
                          border-color:${course.color}
                        "
                      >
                        ${course.name}
                      </span>
                    `
                            : ''
                        }

                ${group
                            ? `
                      <span class="group-text">
                        ${group.name}
                      </span>
                    `
                            : ''
                        }

                ${item.room
                            ? `
                      <span class="room-text">
                        Local : ${item.room}
                      </span>
                    `
                            : ''
                        }

                ${item.note
                            ? `
                      <span class="note-text">
                        ${item.note}
                      </span>
                    `
                            : ''
                        }

              </div>
            `;


                /*
                 * Affichage de la cellule.
                 */
                grid.insertAdjacentHTML(
                    'beforeend',

                    `
          <button
            class="cell ${classes}"
            data-cell="${cellKey}"
            ${row.type === 'lunch'
                        ? 'data-lunch="true"'
                        : ''
                    }
            ${style}
          >

            <span class="placeholder">
              ${row.label}
            </span>

            ${content}

            ${state.hours
                        ? `
                  <span class="time-label">
                    ${item.time ||
                        row.defaultTime ||
                        hourFor(rowIndex)
                        }
                  </span>
                `
                        : ''
                    }

          </button>
          `
                );
            }
        }
    );


    /*
     * Boutons d'ajout AM/PM.
     */
    $$('.row-add').forEach(
        button => {

            button.addEventListener(
                'click',
                () => {

                    if (
                        button.dataset.add === 'am'
                    ) {

                        state.am =
                            Math.min(
                                5,
                                state.am + 1
                            );
                    }

                    if (
                        button.dataset.add === 'pm'
                    ) {

                        state.pm =
                            Math.min(
                                5,
                                state.pm + 1
                            );
                    }

                    rebuildScheduleRows();

                    persist();

                    syncControls();

                    renderGrid();
                }
            );
        }
    );


    /*
     * Ouverture d'une case.
     */
    $$('[data-cell]').forEach(
        cell => {

            cell.addEventListener(
                'click',
                () => {

                    openCellDialog(
                        cell.dataset.cell,
                        cell.dataset.lunch === 'true'
                    );

                }
            );

        }
    );
}
function syncControls(){
  if($('#amCount')) $('#amCount').value = state.am;
  if($('#pmCount')) $('#pmCount').value = state.pm;
  if($('#dayCount')) $('#dayCount').value = state.days;
  if($('#dayCountLabel')) $('#dayCountLabel').textContent = `${state.days} jours`;
  if($('#lunchToggle')) $('#lunchToggle').checked = state.lunch;
  if($('#hoursToggle')) $('#hoursToggle').checked = state.hours;
}
function openCellDialog(
    cellKey,
    isLunch
) {

    /*
     * Pour cette phase, le dîner
     * reste non éditable directement.
     *
     * La personnalisation du dîner
     * arrive en Phase 2.
     */
    if (
        isLunch ||
        !$('#cellDialog')
    ) {
        return;
    }

    populateDialogOptions();

    const item =
        state.schedule.cells[cellKey] ||
        {};

    $('#editingKey').value =
        cellKey;

    $('#cellCourse').value =
        item.courseId || '';

    $('#cellGroup').value =
        item.groupId || '';

    $('#cellRoom').value =
        item.room || '';

    $('#cellTime').value =
        item.time || '';

    $('#cellNote').value =
        item.note || '';

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

    $('#cellForm')?.addEventListener(
        'submit',
        e => {

            e.preventDefault();

            const cellKey =
                $('#editingKey').value;

            state.schedule.cells[cellKey] =
                normalizeCell({

                    courseId:
                        $('#cellCourse').value,

                    groupId:
                        $('#cellGroup').value,

                    room:
                        $('#cellRoom')
                            .value
                            .trim(),

                    time:
                        $('#cellTime').value,

                    note:
                        $('#cellNote')
                            .value
                            .trim()
                });


            /*
             * Maintien de l'ancien alias.
             */
            state.data =
                state.schedule.cells;

            persist();

            $('#cellDialog').close();

            renderGrid();
        }
    );


    /*
     * ==========================================================
     * SUPPRESSION D'UNE CASE
     * ==========================================================
     */

    $('#deleteCell')?.addEventListener(
        'click',
        () => {

            const cellKey =
                $('#editingKey').value;

            delete state.schedule.cells[
                cellKey
            ];

            state.data =
                state.schedule.cells;

            persist();

            $('#cellDialog').close();

            renderGrid();
        }
    );


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

