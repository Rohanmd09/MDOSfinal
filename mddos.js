// ==========================================
// LIFEOS — mddos.js — Supabase Edition
// ==========================================

const SUPABASE_URL = 'https://iwxyifvpcocgsldufxtl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eHlpZnZwY29jZ3NsZHVmeHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTQyMjEsImV4cCI6MjA5NDk3MDIyMX0.vvbRLZ9Zlth4stqIhyqF2x8jzPuR1G7CvIRhPmjW93c';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// STATE
// ==========================================
let currentUser = null;
let state = {
  tasks: [], topics: [], projects: [], habits: [],
  habitLogs: [], focusSessions: [], activities: [], routineBlocks: [],
  currentView: 'overview', taskFilter: 'All', taskSearch: '', analyticsPeriod: 'week'
};

const DEFAULT_ROUTINE = [
  { label: 'Morning Routine', start_time: '06:00', end_time: '07:00' },
  { label: 'Study Block 1',   start_time: '07:00', end_time: '09:00' },
  { label: 'Breakfast',       start_time: '09:00', end_time: '09:30' },
  { label: 'Study Block 2',   start_time: '09:30', end_time: '12:00' },
  { label: 'Lunch + Break',   start_time: '12:00', end_time: '13:00' },
  { label: 'Study Block 3',   start_time: '13:00', end_time: '15:30' },
  { label: 'Sport / Gym',     start_time: '15:30', end_time: '17:00' },
  { label: 'Study Block 4',   start_time: '17:00', end_time: '19:00' },
  { label: 'Dinner',          start_time: '19:00', end_time: '20:00' },
  { label: 'Wind Down / Read',start_time: '20:00', end_time: '22:00' },
  { label: 'Sleep',           start_time: '22:00', end_time: '06:00' },
];

// ==========================================
// AUTH
// ==========================================
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { currentUser = session.user; onSignedIn(); }
  else { showAuthScreen(); }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      hideAuthScreen();
      onSignedIn();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuthScreen();
    }
  });
}

function showAuthScreen() {
  document.getElementById('auth-screen')?.classList.remove('hidden');
  document.getElementById('startup-loader')?.classList.add('hidden');
}
function hideAuthScreen() {
  document.getElementById('auth-screen')?.classList.add('hidden');
}

async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error;
}

// ==========================================
// DATA LAYER
// ==========================================
async function loadAllData() {
  const uid = currentUser.id;
  const [tasks, topics, projects, habits, habitLogs, focusSessions, activities, routineBlocks] = await Promise.all([
    sb.from('tasks').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sb.from('topics').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sb.from('projects').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sb.from('habits').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
    sb.from('habit_logs').select('*').eq('user_id', uid),
    sb.from('focus_sessions').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sb.from('activities').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sb.from('routine_blocks').select('*').eq('user_id', uid).order('start_time', { ascending: true }),
  ]);
  state.tasks         = tasks.data         || [];
  state.topics        = topics.data        || [];
  state.projects      = projects.data      || [];
  state.habits        = habits.data        || [];
  state.habitLogs     = habitLogs.data     || [];
  state.focusSessions = focusSessions.data || [];
  state.activities    = activities.data    || [];
  state.routineBlocks = routineBlocks.data || [];
  if (state.routineBlocks.length === 0) await seedDefaultRoutine();
}

async function seedDefaultRoutine() {
  const rows = DEFAULT_ROUTINE.map(b => ({ ...b, user_id: currentUser.id }));
  const { data } = await sb.from('routine_blocks').insert(rows).select();
  if (data) state.routineBlocks = data;
}

// Tasks
async function addTask(taskData) {
  const { data, error } = await sb.from('tasks').insert({ ...taskData, user_id: currentUser.id }).select().single();
  if (!error && data) { state.tasks.unshift(data); renderTasks(); renderOverviewStats(); }
}
async function updateTask(id, updates) {
  const { error } = await sb.from('tasks').update(updates).eq('id', id);
  if (!error) { const i = state.tasks.findIndex(t => t.id === id); if (i >= 0) state.tasks[i] = { ...state.tasks[i], ...updates }; renderTasks(); renderOverviewStats(); }
}
async function deleteTask(id) {
  await sb.from('tasks').delete().eq('id', id);
  state.tasks = state.tasks.filter(t => t.id !== id);
  renderTasks(); renderOverviewStats();
}

// Topics
async function addTopic(data) {
  const { data: d, error } = await sb.from('topics').insert({ ...data, user_id: currentUser.id }).select().single();
  if (!error && d) { state.topics.unshift(d); renderAcademics(); }
}
async function toggleTopic(id) {
  const t = state.topics.find(t => t.id === id);
  if (!t) return;
  const { error } = await sb.from('topics').update({ completed: !t.completed }).eq('id', id);
  if (!error) { const i = state.topics.findIndex(t => t.id === id); if (i >= 0) state.topics[i].completed = !t.completed; renderAcademics(); }
}
async function deleteTopic(id) {
  await sb.from('topics').delete().eq('id', id);
  state.topics = state.topics.filter(t => t.id !== id);
  renderAcademics();
}

// Projects
async function addProject(data) {
  const { data: d, error } = await sb.from('projects').insert({ ...data, user_id: currentUser.id }).select().single();
  if (!error && d) { state.projects.unshift(d); renderProjects(); }
}
async function updateProject(id, updates) {
  const { error } = await sb.from('projects').update(updates).eq('id', id);
  if (!error) { const i = state.projects.findIndex(p => p.id === id); if (i >= 0) state.projects[i] = { ...state.projects[i], ...updates }; renderProjects(); }
}
async function deleteProject(id) {
  await sb.from('projects').delete().eq('id', id);
  state.projects = state.projects.filter(p => p.id !== id);
  renderProjects();
}

// Habits
async function addHabit(name) {
  const { data, error } = await sb.from('habits').insert({ name, user_id: currentUser.id }).select().single();
  if (!error && data) { state.habits.push(data); renderHabits(); }
}
async function toggleHabitLog(habitId) {
  const today = new Date().toISOString().split('T')[0];
  const existing = state.habitLogs.find(l => l.habit_id === habitId && l.log_date === today);
  if (existing) {
    await sb.from('habit_logs').delete().eq('id', existing.id);
    state.habitLogs = state.habitLogs.filter(l => l.id !== existing.id);
  } else {
    const { data } = await sb.from('habit_logs').insert({ habit_id: habitId, user_id: currentUser.id, log_date: today }).select().single();
    if (data) state.habitLogs.push(data);
  }
  renderHabits();
}
async function deleteHabit(id) {
  await sb.from('habits').delete().eq('id', id);
  state.habits = state.habits.filter(h => h.id !== id);
  state.habitLogs = state.habitLogs.filter(l => l.habit_id !== id);
  renderHabits();
}

// Focus sessions
async function saveFocusSession(durationMinutes) {
  const { data } = await sb.from('focus_sessions').insert({ duration_minutes: durationMinutes, user_id: currentUser.id }).select().single();
  if (data) { state.focusSessions.unshift(data); renderOverviewStats(); }
}

// Activities
async function addActivity(actData) {
  const { data } = await sb.from('activities').insert({ ...actData, user_id: currentUser.id }).select().single();
  if (data) { state.activities.unshift(data); renderOverviewStats(); }
}

// Routine blocks
async function toggleRoutineBlock(id) {
  const block = state.routineBlocks.find(b => b.id === id);
  if (!block) return;
  const today = new Date().toISOString().split('T')[0];
  const newCompleted = !block.completed;
  await sb.from('routine_blocks').update({ completed: newCompleted, completion_date: today }).eq('id', id);
  const i = state.routineBlocks.findIndex(b => b.id === id);
  if (i >= 0) { state.routineBlocks[i].completed = newCompleted; state.routineBlocks[i].completion_date = today; }
  renderRoutine();
}

// ==========================================
// REAL-TIME SYNC
// ==========================================
function setupRealtime() {
  const uid = currentUser.id;
  sb.channel('lifeos-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks',    filter: `user_id=eq.${uid}` }, p => handleRTChange('tasks', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'topics',   filter: `user_id=eq.${uid}` }, p => handleRTChange('topics', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${uid}` }, p => handleRTChange('projects', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'habits',   filter: `user_id=eq.${uid}` }, p => handleRTChange('habits', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs', filter: `user_id=eq.${uid}` }, p => handleRTChange('habitLogs', p))
    .subscribe();
}

function handleRTChange(collection, payload) {
  const { eventType, new: nr, old: or } = payload;
  if (eventType === 'INSERT' && !state[collection].find(r => r.id === nr.id)) state[collection].unshift(nr);
  else if (eventType === 'UPDATE') { const i = state[collection].findIndex(r => r.id === nr.id); if (i >= 0) state[collection][i] = nr; }
  else if (eventType === 'DELETE') state[collection] = state[collection].filter(r => r.id !== or.id);
  const reRender = { tasks: [renderTasks, renderOverviewStats], topics: [renderAcademics], projects: [renderProjects], habits: [renderHabits], habitLogs: [renderHabits] };
  (reRender[collection] || []).forEach(fn => fn());
}

// ==========================================
// CLOCK
// ==========================================
function startClock() {
  const update = () => {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM'; const hh = h % 12 || 12;
    const el = document.getElementById('live-clock');
    if (el) el.textContent = `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`;
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const de = document.getElementById('live-date');
    if (de) de.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
    // Dynamic greeting
    const greet = document.querySelector('#overview-view h2');
    if (greet) {
      const g = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
      greet.textContent = `${g}, Rohan.`;
    }
  };
  update(); setInterval(update, 30000);
}

// ==========================================
// OVERVIEW STATS
// ==========================================
function renderOverviewStats() {
  const today = new Date().toISOString().split('T')[0];
  const done = state.tasks.filter(t => t.status === 'done').length;
  const total = state.tasks.length;
  const el1 = document.getElementById('stat-tasks-done');
  if (el1) el1.innerHTML = `${done}<span class="text-sm text-dark-muted font-normal ml-1">/ ${total}</span>`;

  const todaySessions = state.focusSessions.filter(s => s.created_at?.startsWith(today));
  const totalMins = todaySessions.reduce((sum, s) => sum + s.duration_minutes, 0);
  const el2 = document.getElementById('stat-focus-time');
  if (el2) el2.textContent = `${Math.floor(totalMins/60)}h ${String(totalMins%60).padStart(2,'0')}m`;

  let maxStreak = 0;
  state.habits.forEach(h => {
    const logs = state.habitLogs.filter(l => l.habit_id === h.id).map(l => l.log_date).sort().reverse();
    let streak = 0, check = new Date();
    for (const d of logs) {
      const a = new Date(check); a.setHours(0,0,0,0);
      const b2 = new Date(d); b2.setHours(0,0,0,0);
      if (Math.abs(a-b2) <= 86400000) { streak++; check.setDate(check.getDate()-1); } else break;
    }
    if (streak > maxStreak) maxStreak = streak;
  });
  const el3 = document.getElementById('stat-current-streak');
  if (el3) el3.innerHTML = `${maxStreak} <span class="text-sm text-dark-muted font-normal ml-1">days</span>`;

  renderOverviewTasks();
  renderMiniCalendar();
}

function renderOverviewTasks() {
  const container = document.getElementById('overview-tasks');
  if (!container) return;
  const priority = state.tasks.filter(t => t.priority === 'High' && t.status !== 'done').slice(0, 5);
  if (!priority.length) { container.innerHTML = '<div class="text-sm text-dark-muted italic">No high-priority tasks. You\'re clear. 🎯</div>'; return; }
  container.innerHTML = priority.map(t => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-dark-bg/60 border border-dark-border group">
      <button onclick="updateTask('${t.id}',{status:'done'})" class="w-5 h-5 rounded-full border-2 border-dark-border group-hover:border-brand-500 transition-colors flex items-center justify-center flex-shrink-0"></button>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${t.title}</p>
        <p class="text-xs text-dark-muted">${t.subject} · ${t.due_date || 'No date'}</p>
      </div>
      <span class="text-[10px] px-2 py-0.5 rounded-full font-mono bg-red-500/20 text-red-300 flex-shrink-0">HIGH</span>
    </div>`).join('');
}

// ==========================================
// MINI CALENDAR
// ==========================================
function renderMiniCalendar() {
  const cal = document.getElementById('mini-calendar');
  if (!cal) return;
  const now = new Date(); const yr = now.getFullYear(), mo = now.getMonth();
  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo+1, 0).getDate();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const taskDates = new Set(
    state.tasks.filter(t => t.due_date?.startsWith(`${yr}-${String(mo+1).padStart(2,'0')}`))
      .map(t => parseInt(t.due_date.split('-')[2]))
  );
  let html = `<div class="flex items-center justify-between mb-3"><span class="text-xs font-mono text-dark-muted uppercase tracking-wider">${months[mo]} ${yr}</span></div>
  <div class="grid grid-cols-7 gap-1 text-center">`;
  ['S','M','T','W','T','F','S'].forEach(d => { html += `<div class="text-[10px] text-dark-muted py-1">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) html += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate();
    html += `<div class="relative text-xs py-1 rounded-lg ${isToday ? 'bg-brand-500 text-white font-bold' : 'text-dark-muted'}">
      ${d}${taskDates.has(d) && !isToday ? '<div class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-400"></div>' : ''}
    </div>`;
  }
  cal.innerHTML = html + `</div>`;
}

// ==========================================
// ROUTINE ENGINE
// ==========================================
function timeToMins(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }

function renderRoutine() {
  const container = document.getElementById('timeblock-list');
  if (!container) return;
  const today = new Date().toISOString().split('T')[0];
  state.routineBlocks.forEach(b => { if (b.completion_date && b.completion_date < today) b.completed = false; });

  const done = state.routineBlocks.filter(b => b.completed).length;
  const total = state.routineBlocks.length;
  const pct = total ? Math.round((done/total)*100) : 0;
  const bar = document.getElementById('routine-compliance-bar');
  const txt = document.getElementById('routine-compliance-text');
  if (bar) bar.style.width = `${pct}%`;
  if (txt) txt.textContent = `${pct}%`;

  const now = new Date();
  const curMins = now.getHours()*60 + now.getMinutes();

  container.innerHTML = state.routineBlocks.map(b => {
    const start = timeToMins(b.start_time);
    const end = timeToMins(b.end_time);
    const isActive = end > start ? (curMins >= start && curMins < end) : (curMins >= start || curMins < end);
    return `<div class="flex items-center gap-3 p-3 rounded-xl border transition-all ${isActive ? 'bg-brand-500/10 border-brand-500/30' : 'bg-dark-bg/40 border-dark-border/50'}">
      <button onclick="toggleRoutineBlock('${b.id}')" class="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${b.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-dark-border hover:border-emerald-500'}">
        ${b.completed ? '<i class="ph-bold ph-check text-[10px]"></i>' : ''}
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm ${b.completed ? 'line-through text-dark-muted' : isActive ? 'text-white font-medium' : 'text-white'}">${b.label}</p>
        <p class="text-xs text-dark-muted font-mono">${b.start_time} – ${b.end_time}</p>
      </div>
      ${isActive ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono uppercase flex-shrink-0">NOW</span>' : ''}
    </div>`;
  }).join('');
}

function startRoutineCountdown() {
  setInterval(() => {
    const el = document.getElementById('next-timeblock-countdown');
    const lbl = document.getElementById('next-timeblock-label');
    if (!el) return;
    const now = new Date();
    const curMins = now.getHours()*60 + now.getMinutes() + now.getSeconds()/60;
    let next = null, minDiff = Infinity;
    state.routineBlocks.forEach(b => {
      const diff = timeToMins(b.start_time) - curMins;
      if (diff > 0 && diff < minDiff) { minDiff = diff; next = b; }
    });
    if (lbl) lbl.textContent = next ? `Next: ${next.label}` : 'All Blocks Done';
    if (!next) { el.textContent = '--:--:--'; return; }
    const totalSecs = Math.round(minDiff*60);
    const h = Math.floor(totalSecs/3600), m = Math.floor((totalSecs%3600)/60), s = totalSecs%60;
    el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);
}

// ==========================================
// TASKS (KANBAN)
// ==========================================
function renderTasks() {
  const search = state.taskSearch.toLowerCase();
  const filter = state.taskFilter;
  const filtered = state.tasks.filter(t =>
    (filter === 'All' || t.subject === filter) &&
    (!search || t.title.toLowerCase().includes(search))
  );
  ['todo','progress','done'].forEach(status => {
    const container = document.getElementById(`kanban-${status}`);
    if (!container) return;
    const items = filtered.filter(t => t.status === status);
    if (!items.length) {
      container.innerHTML = `<div class="text-xs text-dark-muted text-center py-8 border-2 border-dashed border-dark-border/50 rounded-xl">Drop tasks here</div>`;
      return;
    }
    container.innerHTML = items.map(taskCard).join('');
  });
  initKanbanSortable();
}

function taskCard(t) {
  const pc = { High:'text-red-300 bg-red-500/20', Medium:'text-yellow-300 bg-yellow-500/20', Low:'text-green-300 bg-green-500/20' }[t.priority] || 'text-yellow-300 bg-yellow-500/20';
  return `<div class="task-card glass-panel p-4 rounded-xl cursor-grab active:cursor-grabbing border border-dark-border hover:border-brand-500/30 transition-all group" data-id="${t.id}" data-status="${t.status}">
    <div class="flex items-start justify-between gap-2 mb-2">
      <p class="text-sm font-medium text-white leading-snug flex-1 ${t.status==='done'?'line-through opacity-50':''}">${t.title}</p>
      <button onclick="deleteTask('${t.id}')" class="opacity-0 group-hover:opacity-100 transition-opacity text-dark-muted hover:text-red-400 flex-shrink-0"><i class="ph-bold ph-x text-xs"></i></button>
    </div>
    ${t.description ? `<p class="text-xs text-dark-muted mb-2 line-clamp-2">${t.description}</p>` : ''}
    <div class="flex items-center justify-between gap-2 mt-2">
      <span class="text-[10px] font-mono text-dark-muted">${t.subject}</span>
      <span class="text-[10px] px-2 py-0.5 rounded-full font-medium ${pc}">${t.priority}</span>
    </div>
    ${t.due_date ? `<div class="mt-2 text-[10px] text-dark-muted font-mono flex items-center gap-1"><i class="ph ph-calendar-blank"></i> ${t.due_date}</div>` : ''}
    <div class="flex items-center gap-1 mt-3">
      ${['todo','progress','done'].map(s => `
        <button onclick="updateTask('${t.id}',{status:'${s}'})"
          class="flex-1 py-1 rounded text-[10px] font-mono transition-colors ${t.status===s ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-bg/60 text-dark-muted hover:text-white'}">
          ${s==='todo'?'Todo':s==='progress'?'Doing':'Done'}
        </button>`).join('')}
    </div>
  </div>`;
}

function initKanbanSortable() {
  ['todo','progress','done'].forEach(status => {
    const el = document.getElementById(`kanban-${status}`);
    if (el && window.Sortable && !el._sortable) {
      el._sortable = Sortable.create(el, {
        group: 'kanban', animation: 150, ghostClass: 'opacity-30',
        onEnd(evt) {
          const id = evt.item.dataset.id;
          const newStatus = evt.to.id.replace('kanban-','');
          if (id && newStatus) updateTask(id, { status: newStatus });
        }
      });
    }
  });
}

// ==========================================
// ACADEMICS
// ==========================================
const SUBJECTS = ['Physics','Maths','Further Maths','Economics','Accounts','English'];

const SUBJ_CONFIG = {
  Physics:       { icon:'ph-atom',           color:'blue',    sitting:'Oct–Nov 2026' },
  Maths:         { icon:'ph-function',        color:'purple',  sitting:'Oct–Nov 2026  ·  Feb–Mar 2027' },
  'Further Maths':{ icon:'ph-infinity',       color:'violet',  sitting:'Oct–Nov 2026  ·  Feb–Mar 2027' },
  Economics:     { icon:'ph-trend-up',        color:'emerald', sitting:'Oct–Nov 2026' },
  Accounts:      { icon:'ph-calculator',      color:'amber',   sitting:'Oct–Nov 2026  ·  AS Level' },
  English:       { icon:'ph-book-open-text',  color:'rose',    sitting:'Oct–Nov 2026  ·  AS Level' },
};

const COMPONENT_LABELS = {
  'AS':'AS Level', 'A2':'A2 Level',
  'AS Micro':'AS · Microeconomics', 'AS Macro':'AS · Macroeconomics',
  'A2 Micro':'A2 · Microeconomics', 'A2 Macro':'A2 · Macroeconomics',
  'P1':'Pure Mathematics 1', 'S1':'Probability & Statistics 1',
  'P2':'Pure Mathematics 2', 'M1':'Mechanics',
  'FP1':'Further Pure 1', 'FS':'Further Statistics',
  'FP2':'Further Pure 2', 'FM':'Further Mechanics',
};

const PALETTE = {
  blue:    { bg:'bg-blue-500/8',    border:'border-blue-500/20',    text:'text-blue-300',    badge:'bg-blue-500/15 text-blue-300 border border-blue-500/25',    bar:'from-blue-500 to-blue-400',    check:'border-blue-400/50' },
  purple:  { bg:'bg-purple-500/8',  border:'border-purple-500/20',  text:'text-purple-300',  badge:'bg-purple-500/15 text-purple-300 border border-purple-500/25',  bar:'from-purple-500 to-purple-400',  check:'border-purple-400/50' },
  violet:  { bg:'bg-violet-500/8',  border:'border-violet-500/20',  text:'text-violet-300',  badge:'bg-violet-500/15 text-violet-300 border border-violet-500/25',  bar:'from-violet-500 to-violet-400',  check:'border-violet-400/50' },
  emerald: { bg:'bg-emerald-500/8', border:'border-emerald-500/20', text:'text-emerald-300', badge:'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25', bar:'from-emerald-500 to-emerald-400', check:'border-emerald-400/50' },
  amber:   { bg:'bg-amber-500/8',   border:'border-amber-500/20',   text:'text-amber-300',   badge:'bg-amber-500/15 text-amber-300 border border-amber-500/25',   bar:'from-amber-500 to-amber-400',   check:'border-amber-400/50' },
  rose:    { bg:'bg-rose-500/8',    border:'border-rose-500/20',    text:'text-rose-300',    badge:'bg-rose-500/15 text-rose-300 border border-rose-500/25',    bar:'from-rose-500 to-rose-400',    check:'border-rose-400/50' },
};

function parseTopicTag(title) {
  const m = title.match(/^\[([^\]]+)\]\s*/);
  return m ? { tag: m[1], clean: title.slice(m[0].length) } : { tag: '', clean: title };
}

function renderAcademics() {
  const grid = document.getElementById('academics-grid');
  if (!grid) return;

  grid.innerHTML = SUBJECTS.map(subject => {
    const cfg = SUBJ_CONFIG[subject] || { icon:'ph-book', color:'blue', sitting:'' };
    const pal = PALETTE[cfg.color];
    const topics = state.topics.filter(t => t.subject === subject);
    const done = topics.filter(t => t.completed).length;
    const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;

    // Group by component tag, preserving insertion order
    const groups = {};
    topics.forEach(tp => {
      const { tag, clean } = parseTopicTag(tp.title);
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push({ ...tp, cleanTitle: clean });
    });

    const groupsHtml = Object.entries(groups).map(([tag, grpTopics]) => {
      const grpDone = grpTopics.filter(t => t.completed).length;
      const label = COMPONENT_LABELS[tag] || tag || 'Topics';
      return `
        <div class="mb-5 last:mb-0">
          <div class="flex items-center gap-2 mb-2.5">
            <span class="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] px-2.5 py-1 rounded-full ${pal.badge}">${label}</span>
            <span class="text-[10px] font-mono text-dark-muted">${grpDone}/${grpTopics.length}</span>
            <div class="flex-1 h-px bg-dark-border/50 ml-1"></div>
          </div>
          <div class="space-y-px">
            ${grpTopics.map(tp => `
              <div class="flex items-center gap-3 px-2 py-1.5 rounded-lg group hover:bg-white/[0.03] transition-colors cursor-default">
                <button onclick="toggleTopic('${tp.id}')"
                  class="flex-shrink-0 w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all
                  ${tp.completed ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : `border-dark-border group-hover:${pal.check}`}">
                  ${tp.completed ? '<i class="ph-bold ph-check" style="font-size:9px"></i>' : ''}
                </button>
                <span class="text-[13px] flex-1 leading-snug ${tp.completed ? 'line-through text-dark-muted/50' : 'text-dark-text/85'}">${tp.cleanTitle}</span>
                <button onclick="deleteTopic('${tp.id}')"
                  class="opacity-0 group-hover:opacity-100 transition-opacity text-dark-muted/40 hover:text-red-400 flex-shrink-0">
                  <i class="ph-bold ph-x" style="font-size:10px"></i>
                </button>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="glass-panel rounded-2xl border ${pal.border} overflow-hidden flex flex-col">

        <!-- ── Subject Header ── -->
        <div class="px-6 pt-5 pb-4 border-b ${pal.border}" style="background:linear-gradient(135deg,rgba(0,0,0,0.2) 0%,transparent 100%)">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl ${pal.bg} border ${pal.border} flex items-center justify-center flex-shrink-0">
                <i class="ph-bold ${cfg.icon} ${pal.text} text-xl"></i>
              </div>
              <div>
                <h3 class="font-bold text-white text-base tracking-tight">${subject}</h3>
                <p class="text-[10px] font-mono text-dark-muted mt-0.5 tracking-wide">${cfg.sitting}</p>
              </div>
            </div>
            <div class="text-right flex-shrink-0 pt-0.5">
              <div class="text-2xl font-bold ${pal.text} leading-none">${pct}<span class="text-sm font-normal text-dark-muted">%</span></div>
              <div class="text-[10px] font-mono text-dark-muted mt-0.5">${done} of ${topics.length}</div>
            </div>
          </div>
          <!-- Progress bar -->
          <div class="h-1 rounded-full bg-dark-border/50 overflow-hidden">
            <div class="h-full rounded-full bg-gradient-to-r ${pal.bar} transition-all duration-700" style="width:${pct}%"></div>
          </div>
        </div>

        <!-- ── Topics body ── -->
        <div class="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 max-h-96">
          ${!topics.length
            ? `<div class="text-center py-10"><i class="ph ph-books ${pal.text} text-3xl block mb-2 opacity-40"></i><p class="text-xs text-dark-muted italic">No topics yet.</p></div>`
            : groupsHtml}
        </div>
      </div>`;
  }).join('');
}

// ==========================================
// PROJECTS
// ==========================================
function renderProjects() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  if (!state.projects.length) {
    grid.innerHTML = `<div class="col-span-3 text-center py-16 text-dark-muted"><i class="ph ph-rocket-launch text-4xl mb-3 block"></i><p class="text-sm">No projects yet. Add your first one.</p></div>`;
    return;
  }
  const sc = { Planning:'text-blue-300 bg-blue-500/20', 'In Progress':'text-orange-300 bg-orange-500/20', Active:'text-emerald-300 bg-emerald-500/20', Completed:'text-gray-300 bg-gray-500/20' };
  grid.innerHTML = state.projects.map(p => `
    <div class="glass-panel p-6 rounded-2xl flex flex-col gap-4 group">
      <div class="flex items-start justify-between gap-2">
        <div><h3 class="font-semibold text-white mb-1">${p.name}</h3><p class="text-sm text-dark-muted">${p.description||''}</p></div>
        <button onclick="deleteProject('${p.id}')" class="opacity-0 group-hover:opacity-100 text-dark-muted hover:text-red-400 transition-all flex-shrink-0"><i class="ph-bold ph-x text-sm"></i></button>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs px-2 py-1 rounded-full font-medium ${sc[p.status]||sc.Planning}">${p.status}</span>
        ${p.link ? `<a href="${p.link}" target="_blank" class="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"><i class="ph ph-arrow-up-right"></i> Visit</a>` : ''}
      </div>
      <select onchange="updateProject('${p.id}',{status:this.value})" class="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-brand-500 cursor-pointer">
        ${['Planning','In Progress','Active','Completed'].map(s => `<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>`).join('');
}

// ==========================================
// HABITS
// ==========================================
function renderHabits() {
  const list = document.getElementById('habits-list');
  const heatmap = document.getElementById('habit-heatmap');
  const today = new Date().toISOString().split('T')[0];
  if (list) {
    if (!state.habits.length) {
      list.innerHTML = `<div class="text-center py-8 text-dark-muted text-sm">No habits yet. Add your first one.</div>`;
    } else {
      list.innerHTML = state.habits.map(h => {
        const doneToday = state.habitLogs.some(l => l.habit_id===h.id && l.log_date===today);
        const logs = state.habitLogs.filter(l => l.habit_id===h.id).map(l => l.log_date).sort().reverse();
        let streak = 0, check = new Date();
        for (const d of logs) {
          const a = new Date(check); a.setHours(0,0,0,0);
          const b2 = new Date(d); b2.setHours(0,0,0,0);
          if (Math.abs(a-b2)<=86400000) { streak++; check.setDate(check.getDate()-1); } else break;
        }
        return `<div class="flex items-center justify-between p-4 rounded-xl bg-dark-bg/40 border border-dark-border group">
          <div class="flex items-center gap-3">
            <button onclick="toggleHabitLog('${h.id}')" class="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${doneToday ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-dark-border hover:border-emerald-500'}">
              ${doneToday ? '<i class="ph-bold ph-check text-sm"></i>' : ''}
            </button>
            <div>
              <p class="text-sm font-medium text-white">${h.name}</p>
              <p class="text-xs text-dark-muted">${streak} day streak${streak===1?'':'s'}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${streak >= 7 ? '<i class="ph-fill ph-fire text-orange-400 text-lg"></i>' : ''}
            <button onclick="deleteHabit('${h.id}')" class="opacity-0 group-hover:opacity-100 text-dark-muted hover:text-red-400 transition-all"><i class="ph-bold ph-x"></i></button>
          </div>
        </div>`;
      }).join('');
    }
  }
  if (heatmap) {
    const days = Array.from({length:30},(_,i) => { const d=new Date(); d.setDate(d.getDate()-(29-i)); return d.toISOString().split('T')[0]; });
    heatmap.innerHTML = days.map(day => {
      const count = state.habitLogs.filter(l => l.log_date===day).length;
      const ratio = state.habits.length ? count/state.habits.length : 0;
      const opacity = ratio===0 ? '0.1' : ratio<0.4 ? '0.3' : ratio<0.7 ? '0.6' : '1';
      return `<div title="${day}: ${count}/${state.habits.length}" class="w-6 h-6 rounded flex-shrink-0 ${day===today?'ring-2 ring-white/30':''}" style="background:rgba(139,92,246,${opacity})"></div>`;
    }).join('');
  }
}

// ==========================================
// ANALYTICS
// ==========================================
let charts = {};

function renderAnalytics() {
  renderFocusChart(); renderTasksChart(); renderDomainChart();
  renderWeeklyHeatmap(); renderVarianceAlerts();
}

function getDateRange(period) {
  const days = period==='week' ? 7 : period==='month' ? 30 : 365;
  return Array.from({length:days},(_,i) => { const d=new Date(); d.setDate(d.getDate()-(days-1-i)); return d.toISOString().split('T')[0]; });
}

const chartDefaults = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#2A2A35' }, ticks: { color: '#94A3B8', font: { size: 10 } } },
    y: { grid: { color: '#2A2A35' }, ticks: { color: '#94A3B8', font: { size: 10 } }, beginAtZero: true }
  }
};

function renderFocusChart() {
  const ctx = document.getElementById('focusChart'); if (!ctx) return;
  const dates = getDateRange(state.analyticsPeriod);
  const labels = dates.map(d => { const p=d.split('-'); return `${p[2]}/${p[1]}`; });
  const data = dates.map(date => +(state.focusSessions.filter(s=>s.created_at?.startsWith(date)).reduce((sum,s)=>sum+s.duration_minutes,0)/60).toFixed(1));
  if (charts.focus) charts.focus.destroy();
  charts.focus = new Chart(ctx, { type:'line', data:{ labels, datasets:[{ data, borderColor:'#8b5cf6', backgroundColor:'rgba(139,92,246,0.1)', fill:true, tension:0.4, pointBackgroundColor:'#8b5cf6', pointRadius:4 }] }, options: chartDefaults });
}

function renderTasksChart() {
  const ctx = document.getElementById('tasksChart'); if (!ctx) return;
  const counts = SUBJECTS.map(s => state.tasks.filter(t=>t.subject===s&&t.status==='done').length);
  const nonZero = SUBJECTS.filter((_,i) => counts[i]>0);
  if (charts.tasks) charts.tasks.destroy();
  charts.tasks = new Chart(ctx, { type:'doughnut', data:{ labels: nonZero.length?nonZero:['No data'], datasets:[{ data:nonZero.length?nonZero.map(s=>state.tasks.filter(t=>t.subject===s&&t.status==='done').length):[1], backgroundColor:['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899'], borderWidth:0 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ color:'#94A3B8', font:{size:11}, padding:12, boxWidth:12 } } } } });
}

function renderDomainChart() {
  const ctx = document.getElementById('domainChart'); if (!ctx) return;
  const domains = ['Study','Gym','Sport','Meal','Sleep','Project Work','Other'];
  const days = state.analyticsPeriod==='week' ? 7 : state.analyticsPeriod==='month' ? 30 : 365;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days);
  const data = domains.map(d => state.activities.filter(a=>a.type===d&&new Date(a.created_at)>=cutoff).reduce((sum,a)=>sum+(a.duration_minutes||0),0));
  if (charts.domain) charts.domain.destroy();
  charts.domain = new Chart(ctx, { type:'bar', data:{ labels:domains, datasets:[{ data, backgroundColor:'rgba(139,92,246,0.6)', borderColor:'#8b5cf6', borderWidth:1, borderRadius:6 }] }, options: chartDefaults });
}

function renderWeeklyHeatmap() {
  const el = document.getElementById('weekly-domain-heatmap'); if (!el) return;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const now = new Date();
  el.innerHTML = days.map((day, i) => {
    const count = state.activities.filter(a => { const d=new Date(a.created_at); return (now-d)<=7*86400000 && d.getDay()===(i+1)%7; }).length;
    const width = count===0 ? '5%' : `${Math.min(100, count*20)}%`;
    return `<div class="flex items-center gap-3">
      <span class="text-xs font-mono text-dark-muted w-8">${day}</span>
      <div class="flex-1 h-4 rounded-full bg-dark-border overflow-hidden">
        <div class="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all" style="width:${width}"></div>
      </div>
      <span class="text-xs text-dark-muted w-4 text-right">${count}</span>
    </div>`;
  }).join('');
}

function renderVarianceAlerts() {
  const el = document.getElementById('variance-alerts');
  const burnout = document.getElementById('burnout-indicator');
  if (!el) return;
  const alerts = [];
  const today = new Date().toISOString().split('T')[0];
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate()-3);
  if (!state.focusSessions.filter(s=>new Date(s.created_at)>=threeDaysAgo).length && state.focusSessions.length>0)
    alerts.push({ type:'warn', msg:'No focus sessions logged in the last 3 days.' });
  const overdue = state.tasks.filter(t=>t.due_date&&t.due_date<today&&t.status!=='done').length;
  if (overdue) alerts.push({ type:'warn', msg:`${overdue} overdue task${overdue>1?'s':''} need your attention.` });
  const compliance = state.habits.length ? state.habitLogs.filter(l=>l.log_date===today).length/state.habits.length : 1;
  if (compliance<0.5 && state.habits.length) alerts.push({ type:'info', msg:`Habit compliance today is ${Math.round(compliance*100)}%. Time to catch up.` });
  el.innerHTML = !alerts.length
    ? '<p class="text-xs text-emerald-400 flex items-center gap-2"><i class="ph-fill ph-check-circle"></i> All systems green.</p>'
    : alerts.map(a => `<div class="flex items-start gap-2 p-2 rounded-lg ${a.type==='warn'?'bg-yellow-500/10 border border-yellow-500/20':'bg-blue-500/10 border border-blue-500/20'}">
        <i class="ph-fill ${a.type==='warn'?'ph-warning text-yellow-400':'ph-info text-blue-400'} text-sm flex-shrink-0 mt-0.5"></i>
        <p class="text-xs ${a.type==='warn'?'text-yellow-200':'text-blue-200'}">${a.msg}</p>
      </div>`).join('');
  if (burnout) {
    const weekMins = state.focusSessions.filter(s=>(new Date()-new Date(s.created_at))<=7*86400000).reduce((sum,s)=>sum+s.duration_minutes,0);
    const risk = weekMins>30*60 ? ['High','text-red-400'] : weekMins>20*60 ? ['Moderate','text-yellow-400'] : ['Low','text-emerald-400'];
    burnout.innerHTML = `Burnout risk: <span class="${risk[1]} font-semibold">${risk[0]}</span> (${Math.round(weekMins/60)}h focus this week)`;
  }
}

// ==========================================
// FOCUS TIMER
// ==========================================
let timerInterval=null, timerSeconds=25*60, timerRunning=false, timerTotal=25*60;

function updateTimerDisplay() {
  const m=Math.floor(timerSeconds/60), s=timerSeconds%60;
  const el = document.getElementById('timer-display');
  if (el) el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const prog = document.getElementById('timer-progress');
  if (prog) {
    const c = 2*Math.PI*120;
    prog.style.strokeDashoffset = c - (c*(1-timerSeconds/timerTotal));
  }
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  document.getElementById('timer-toggle').innerHTML = '<i class="ph-fill ph-pause text-2xl"></i>';
  document.getElementById('timer-status').textContent = 'Deep Work';
  timerInterval = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval); timerRunning = false;
      saveFocusSession(Math.round(timerTotal/60));
      document.getElementById('timer-status').textContent = 'Complete ✓';
      document.getElementById('timer-toggle').innerHTML = '<i class="ph-fill ph-play text-2xl"></i>';
      try {
        const ac = new (window.AudioContext||window.webkitAudioContext)();
        const osc = ac.createOscillator(); const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.frequency.value = 528; gain.gain.setValueAtTime(0.3, ac.currentTime);
        osc.start(); gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+1.5);
        setTimeout(()=>osc.stop(), 1500);
      } catch(e) {}
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval); timerRunning=false;
  document.getElementById('timer-toggle').innerHTML = '<i class="ph-fill ph-play text-2xl"></i>';
  document.getElementById('timer-status').textContent = 'Paused';
}

function resetTimer() {
  clearInterval(timerInterval); timerRunning=false; timerSeconds=timerTotal;
  updateTimerDisplay();
  document.getElementById('timer-toggle').innerHTML = '<i class="ph-fill ph-play text-2xl"></i>';
  document.getElementById('timer-status').textContent = 'Ready';
}

// ==========================================
// COMMAND PALETTE
// ==========================================
function openCommandPalette() {
  const p=document.getElementById('cmd-palette'); if (!p) return;
  p.classList.remove('hidden'); setTimeout(()=>p.classList.remove('opacity-0'),10);
  document.getElementById('cmd-input')?.focus();
  renderCmdResults('');
}
function closeCommandPalette() {
  const p=document.getElementById('cmd-palette'); if (!p) return;
  p.classList.add('opacity-0'); setTimeout(()=>p.classList.add('hidden'),200);
}
function renderCmdResults(q) {
  const el=document.getElementById('cmd-results'); if (!el) return;
  const ql=q.toLowerCase();
  const pages=[
    {label:'Overview',icon:'ph-squares-four',view:'overview'},
    {label:'Tasks',icon:'ph-check-square-offset',view:'tasks'},
    {label:'Focus Timer',icon:'ph-target',view:'focus'},
    {label:'Academics',icon:'ph-books',view:'academics'},
    {label:'Extracurriculars',icon:'ph-rocket-launch',view:'extracurriculars'},
    {label:'Habits',icon:'ph-plant',view:'habits'},
    {label:'Analytics',icon:'ph-chart-line-up',view:'analytics'},
  ].filter(p=>!ql||p.label.toLowerCase().includes(ql));
  const tasks=state.tasks.filter(t=>ql&&t.title.toLowerCase().includes(ql)).slice(0,3);
  el.innerHTML=`<div class="p-2">
    ${pages.length?`<p class="text-[10px] font-mono text-dark-muted uppercase tracking-wider px-2 mb-1">Pages</p>
    ${pages.map(p=>`<button onclick="switchView('${p.view}');closeCommandPalette()" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-panel text-left transition-colors">
      <i class="ph ${p.icon} text-dark-muted text-lg"></i><span class="text-sm text-white">${p.label}</span>
    </button>`).join('')}`:''}
    ${tasks.length?`<p class="text-[10px] font-mono text-dark-muted uppercase tracking-wider px-2 mt-3 mb-1">Tasks</p>
    ${tasks.map(t=>`<button onclick="switchView('tasks');closeCommandPalette()" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-panel text-left transition-colors">
      <i class="ph ph-check-circle text-brand-400 text-lg"></i>
      <div><p class="text-sm text-white">${t.title}</p><p class="text-xs text-dark-muted">${t.subject} · ${t.status}</p></div>
    </button>`).join('')}`:''}
  </div>`;
}

// ==========================================
// NAVIGATION
// ==========================================
function switchView(v) {
  state.currentView=v;
  // Toggle both Tailwind hidden AND the active class that mddos.css uses for display control
  document.querySelectorAll('.view-section').forEach(s=>{ s.classList.add('hidden'); s.classList.remove('active'); });
  const target = document.getElementById(`${v}-view`);
  if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll(`.nav-btn[data-view="${v}"]`).forEach(b=>b.classList.add('active'));
  if (v==='analytics') renderAnalytics();
}

// ==========================================
// MOBILE
// ==========================================
function setupMobileNav() {
  const mobile = window.innerWidth < 768;
  const sidebar=document.querySelector('aside');
  const nav=document.getElementById('mobile-bottom-nav');
  const brand=document.querySelector('.mobile-brand');
  const cmdBtn=document.getElementById('mobile-command-btn');
  const vc=document.getElementById('view-container');
  if (mobile) {
    sidebar?.classList.add('hidden'); nav?.classList.remove('hidden');
    brand?.classList.remove('hidden'); brand?.classList.add('flex');
    cmdBtn?.classList.remove('hidden'); cmdBtn?.classList.add('flex');
    if (vc) vc.style.paddingBottom='80px';
  } else {
    sidebar?.classList.remove('hidden'); nav?.classList.add('hidden');
  }
}

// ==========================================
// CSV EXPORT
// ==========================================
function exportCSV() {
  const rows=[['Date','Type','Duration (mins)','Context','Notes','Energy']];
  state.activities.forEach(a=>rows.push([a.created_at?.split('T')[0],a.type,a.duration_minutes,a.context,a.notes,a.energy]));
  const csv=rows.map(r=>r.map(c=>`"${c||''}"`).join(',')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='lifeos-export.csv'; a.click();
}

// ==========================================
// MODALS
// ==========================================
function openModal(id) {
  const m=document.getElementById(id); if (!m) return;
  m.classList.remove('hidden');
  setTimeout(()=>{ m.classList.remove('opacity-0'); m.querySelector('[id$="-content"]')?.classList.remove('scale-95'); },10);
}
function closeModal(id) {
  const m=document.getElementById(id); if (!m) return;
  m.classList.add('opacity-0'); m.querySelector('[id$="-content"]')?.classList.add('scale-95');
  setTimeout(()=>m.classList.add('hidden'),200);
}

// ==========================================
// STARTUP
// ==========================================
async function onSignedIn() {
  // Hide loader immediately — no loading screen on sign-in
  const loader = document.getElementById('startup-loader');
  if (loader) loader.classList.add('hidden');

  await loadAllData();
  setupRealtime();
  renderOverviewStats();
  renderTasks();
  renderAcademics();
  renderProjects();
  renderHabits();
  renderRoutine();
}

// ==========================================
// BIND EVENTS
// ==========================================
function bindEvents() {
  // Nav
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn=>btn.addEventListener('click',e=>{ e.preventDefault(); switchView(btn.dataset.view); }));

  // Tasks
  document.getElementById('add-task-btn')?.addEventListener('click',()=>{ document.getElementById('task-date').value=new Date().toISOString().split('T')[0]; openModal('task-modal'); });
  document.getElementById('close-task-modal')?.addEventListener('click',()=>closeModal('task-modal'));
  document.getElementById('task-form')?.addEventListener('submit',async e=>{ e.preventDefault(); await addTask({ title:document.getElementById('task-title').value, description:document.getElementById('task-desc').value, subject:document.getElementById('task-subject').value, priority:document.getElementById('task-priority').value, due_date:document.getElementById('task-date').value, status:'todo' }); e.target.reset(); closeModal('task-modal'); });

  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active','bg-dark-panel','text-white')); btn.classList.add('active','bg-dark-panel','text-white'); state.taskFilter=btn.dataset.subject; renderTasks(); }));
  document.getElementById('task-search')?.addEventListener('input',e=>{ state.taskSearch=e.target.value; renderTasks(); });

  document.getElementById('clear-completed-btn')?.addEventListener('click',async()=>{ const done=state.tasks.filter(t=>t.status==='done'); await Promise.all(done.map(t=>sb.from('tasks').delete().eq('id',t.id))); state.tasks=state.tasks.filter(t=>t.status!=='done'); renderTasks(); });
  document.getElementById('fresh-start-btn')?.addEventListener('click',async()=>{ if(!confirm('Reset all task statuses to "todo"?')) return; await Promise.all(state.tasks.map(t=>sb.from('tasks').update({status:'todo'}).eq('id',t.id))); state.tasks=state.tasks.map(t=>({...t,status:'todo'})); renderTasks(); });

  // Topics
  document.getElementById('add-topic-btn')?.addEventListener('click',()=>openModal('topic-modal'));
  document.getElementById('close-topic-modal')?.addEventListener('click',()=>closeModal('topic-modal'));
  document.getElementById('topic-form')?.addEventListener('submit',async e=>{ e.preventDefault(); await addTopic({title:document.getElementById('topic-title').value,subject:document.getElementById('topic-subject').value,completed:false}); e.target.reset(); closeModal('topic-modal'); });

  // Projects
  document.getElementById('add-project-btn')?.addEventListener('click',()=>openModal('project-modal'));
  document.getElementById('close-project-modal')?.addEventListener('click',()=>closeModal('project-modal'));
  document.getElementById('project-form')?.addEventListener('submit',async e=>{ e.preventDefault(); await addProject({name:document.getElementById('project-name').value,description:document.getElementById('project-desc').value,status:document.getElementById('project-status').value,link:document.getElementById('project-link').value||null}); e.target.reset(); closeModal('project-modal'); });

  // Habits
  document.getElementById('add-habit-btn')?.addEventListener('click',()=>openModal('habit-modal'));
  document.getElementById('close-habit-modal')?.addEventListener('click',()=>closeModal('habit-modal'));
  document.getElementById('habit-form')?.addEventListener('submit',async e=>{ e.preventDefault(); await addHabit(document.getElementById('habit-name').value); e.target.reset(); closeModal('habit-modal'); });

  // Timer
  document.getElementById('timer-toggle')?.addEventListener('click',()=>timerRunning?pauseTimer():startTimer());
  document.getElementById('timer-reset')?.addEventListener('click',resetTimer);
  document.querySelectorAll('.timer-mode-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.timer-mode-btn').forEach(b=>{ b.classList.remove('active','border-brand-500/50','bg-brand-500/10','text-brand-300'); b.classList.add('border-dark-border','text-dark-muted'); });
    btn.classList.add('active','border-brand-500/50','bg-brand-500/10','text-brand-300'); btn.classList.remove('border-dark-border','text-dark-muted');
    timerTotal=parseInt(btn.dataset.time)*60; timerSeconds=timerTotal;
    clearInterval(timerInterval); timerRunning=false; updateTimerDisplay();
    document.getElementById('timer-status').textContent='Ready';
    document.getElementById('timer-toggle').innerHTML='<i class="ph-fill ph-play text-2xl"></i>';
  }));

  // Quick add
  document.getElementById('quick-add-form')?.addEventListener('submit',async e=>{ e.preventDefault(); await addActivity({type:document.getElementById('quick-activity-type').value,duration_minutes:parseInt(document.getElementById('quick-duration').value),context:document.getElementById('quick-context').value,notes:document.getElementById('quick-notes').value,energy:parseInt(document.getElementById('quick-energy').value)}); document.getElementById('quick-add-feedback').textContent=`✓ Logged: ${document.getElementById('quick-activity-type').value}`; e.target.reset(); document.getElementById('quick-duration').value=45; document.getElementById('quick-energy').value=3; });

  // Command palette
  document.getElementById('cmd-k-btn')?.addEventListener('click',openCommandPalette);
  document.getElementById('mobile-command-btn')?.addEventListener('click',openCommandPalette);
  document.getElementById('cmd-input')?.addEventListener('input',e=>renderCmdResults(e.target.value));
  document.getElementById('cmd-palette')?.addEventListener('click',e=>{ if(e.target===document.getElementById('cmd-palette')) closeCommandPalette(); });
  document.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openCommandPalette();} if(e.key==='Escape') closeCommandPalette(); });

  // Analytics period
  document.querySelectorAll('.analytics-period-btn').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.analytics-period-btn').forEach(b=>{ b.classList.remove('active','bg-dark-panel','text-white'); b.classList.add('text-dark-muted'); }); btn.classList.add('active','bg-dark-panel','text-white'); btn.classList.remove('text-dark-muted'); state.analyticsPeriod=btn.dataset.period; renderAnalytics(); }));
  document.getElementById('export-csv-btn')?.addEventListener('click',exportCSV);

  // Auth
  document.getElementById('auth-form')?.addEventListener('submit',async e=>{ e.preventDefault(); const email=document.getElementById('auth-email').value; const password=document.getElementById('auth-password').value; const btn=document.getElementById('auth-submit-btn'); const msg=document.getElementById('auth-message'); btn.textContent='Signing in...'; btn.disabled=true; const error=await signIn(email,password); if(error){ msg.textContent='Incorrect email or password.'; msg.className='text-sm text-red-400 mt-3 text-center'; btn.textContent='Sign In'; btn.disabled=false; } });
  document.getElementById('auth-signout-btn')?.addEventListener('click',()=>sb.auth.signOut());

  window.addEventListener('resize',setupMobileNav);
}

// ==========================================
// INIT
// ==========================================
async function init() {
  startClock();
  setupMobileNav();
  bindEvents();
  updateTimerDisplay();
  startRoutineCountdown();
  await initAuth();
}

document.addEventListener('DOMContentLoaded', init);
