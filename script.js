const STORAGE_KEY = 'neomemoria-state-v1';
const MAX_WORDS_PER_FILE = 3000;
const DAY = 24 * 60 * 60 * 1000;

const state = loadState();
let currentQueue = [];
let currentIndex = 0;
let showingBack = false;
let historyStack = [];
let sessionStart = Date.now();
let sessionSeconds = 0;
let sessionInterval;

const els = {
  sideMenu: document.getElementById('sideMenu'),
  menuBackdrop: document.getElementById('menuBackdrop'),
  menuBtn: document.getElementById('menuBtn'),
  views: [...document.querySelectorAll('.view')],
  card: document.getElementById('card'),
  front: document.querySelector('.card-front'),
  back: document.querySelector('.card-back'),
  modeBtn: document.getElementById('modeBtn'),
  undoBtn: document.getElementById('undoBtn'),
  sessionInfo: document.getElementById('sessionInfo'),
  queueInfo: document.getElementById('queueInfo'),
  fileInput: document.getElementById('fileInput'),
  importBtn: document.getElementById('importBtn'),
  importStatus: document.getElementById('importStatus'),
  columnsList: document.getElementById('columnsList'),
  deckTableWrap: document.getElementById('deckTableWrap'),
  streakBadge: document.getElementById('streakBadge'),
  accuracyStat: document.getElementById('accuracyStat'),
  studyDaysStat: document.getElementById('studyDaysStat'),
  studyTimeStat: document.getElementById('studyTimeStat'),
  distributionStat: document.getElementById('distributionStat'),
  weeklyGraph: document.getElementById('weeklyGraph'),
  themeSelect: document.getElementById('themeSelect'),
  oniToggle: document.getElementById('oniModeToggle'),
  simpleModeToggle: document.getElementById('simpleModeToggle'),
  oniBox: document.getElementById('oniModeBox'),
  oniInput: document.getElementById('oniInput'),
  oniCheckBtn: document.getElementById('oniCheckBtn'),
  oniResult: document.getElementById('oniResult'),
  ratingRow: document.querySelector('.rating-row'),
  simpleRatingRow: document.getElementById('simpleRatingRow'),
  controlsRow: document.querySelector('.controls-row')
};

wire();
applyTheme();
resetQueue();
renderAll();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  return {
    cards: [],
    files: [],
    mode: 'random',
    theme: 'dark',
    oniMode: false,
    simpleMode: false,
    stats: {
      totalAnswers: 0,
      correctLike: 0,
      daily: {},
      lastStudyDate: null,
      streak: 0,
      totalSeconds: 0
    }
  };
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function wire() {
  els.menuBtn.onclick = toggleMenu;
  els.menuBackdrop.onclick = closeMenu;
  els.sideMenu.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.action === 'simple-mode') {
        state.simpleMode = true;
        state.oniMode = false;
        saveState();
        syncModeToggles();
        switchView('flashcards');
        resetQueue();
        renderAll();
        closeMenu();
        return;
      }
      switchView(btn.dataset.view);
      closeMenu();
    };
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  els.card.onclick = () => {
    showingBack = !showingBack;
    renderCard();
  };

  document.querySelectorAll('.rating-row button').forEach(btn => {
    btn.onclick = () => rateCard(btn.dataset.rating);
  });

  els.modeBtn.onclick = () => {
    if (hasPendingInitialReview()) {
      state.mode = 'random';
      alert('初回評価が完了するまでランダム固定です。');
    } else {
      state.mode = state.mode === 'random' ? 'sequential' : 'random';
    }
    saveState();
    resetQueue();
    renderAll();
  };

  els.undoBtn.onclick = undoLastRating;

  els.importBtn.onclick = async () => {
    const files = [...els.fileInput.files];
    if (!files.length) return;
    let imported = 0;
    const columnsByFile = [];
    for (const file of files) {
      const text = await file.text();
      const rows = parseCSVorText(text);
      if (!rows.length) continue;
      const header = rows[0].map(x => x.trim());
      const body = rows.slice(1);
      if (body.length > MAX_WORDS_PER_FILE) {
        els.importStatus.textContent = `${file.name}: 3000語を超えたためスキップ`;
        continue;
      }
      const mapped = mapRows(body, header, file.name);
      state.cards.push(...mapped);
      state.files.push({ name: file.name, columns: header, importedAt: Date.now(), count: mapped.length });
      columnsByFile.push(`${file.name}: ${header.join(' / ')}`);
      imported += mapped.length;
    }
    saveState();
    resetQueue();
    renderAll();
    els.importStatus.textContent = `インポート完了: ${imported}語`;
    els.columnsList.innerHTML = columnsByFile.map(c => `<p>${escapeHtml(c)}</p>`).join('') || '<p>新規なし</p>';
  };

  els.themeSelect.onchange = () => {
    state.theme = els.themeSelect.value;
    saveState();
    applyTheme();
  };

  els.oniToggle.onchange = () => {
    state.oniMode = els.oniToggle.checked;
    if (state.oniMode) state.simpleMode = false;
    saveState();
    syncModeToggles();
    renderCard();
  };

  els.simpleModeToggle.onchange = () => {
    state.simpleMode = els.simpleModeToggle.checked;
    if (state.simpleMode) state.oniMode = false;
    saveState();
    syncModeToggles();
    renderAll();
  };

  document.querySelectorAll('[data-simple-rating]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.simpleRating;
      rateCard(key === 'ok' ? 'normal' : 'forgot');
    };
  });

  els.oniCheckBtn.onclick = () => {
    const c = getCurrentCard();
    if (!c) return;
    const answer = normalize(c.word);
    const typed = normalize(els.oniInput.value);
    els.oniResult.textContent = answer === typed ? '✅ 正解' : `❌ 不正解 正答: ${c.word}`;
  };

  sessionInterval = setInterval(() => { sessionSeconds += 1; }, 1000);
}

function toggleMenu() {
  const willOpen = !els.sideMenu.classList.contains('open');
  els.sideMenu.classList.toggle('open', willOpen);
  els.sideMenu.setAttribute('aria-hidden', String(!willOpen));
  els.menuBackdrop.classList.toggle('open', willOpen);
  els.menuBackdrop.setAttribute('aria-hidden', String(!willOpen));
}

function closeMenu() {
  els.sideMenu.classList.remove('open');
  els.sideMenu.setAttribute('aria-hidden', 'true');
  els.menuBackdrop.classList.remove('open');
  els.menuBackdrop.setAttribute('aria-hidden', 'true');
}

function switchView(id) {
  els.views.forEach(v => v.classList.toggle('active', v.id === id));
  if (id === 'deck') renderDeck();
  if (id === 'stats') renderStats();
}

function parseCSVorText(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.map(parseCSVLine);
}
function parseCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
function mapRows(rows, header, source) {
  const idx = key => header.findIndex(h => h.trim().toLowerCase() === key);
  const iNo = idx('no'), iWord = idx('単語'), iMeaning = idx('意味'), iEx = idx('例文'), iExJa = idx('例文の和訳'), iEm = idx('絵文字');
  return rows.map((r, i) => ({
    id: crypto.randomUUID(),
    no: r[iNo] || String(state.cards.length + i + 1),
    word: r[iWord] || r[1] || '',
    meaning: r[iMeaning] || r[2] || '',
    example: r[iEx] || r[3] || '',
    exampleJa: r[iExJa] || r[4] || '',
    emoji: r[iEm] || r[5] || '',
    source,
    initialReviewed: false,
    status: 'new',
    dueAt: Date.now(),
    mastered: false,
    forgotRequeue: null,
    history: []
  })).filter(c => c.word && c.meaning);
}

function hasPendingInitialReview() {
  return state.cards.some(c => !c.initialReviewed && !c.mastered);
}

function resetQueue() {
  const now = Date.now();
  const pendingInitial = state.cards.filter(c => !c.mastered && !c.initialReviewed);
  if (pendingInitial.length) {
    currentQueue = shuffle([...pendingInitial]);
    state.mode = 'random';
  } else {
    let due = state.cards.filter(c => !c.mastered && c.dueAt <= now);
    due.sort((a, b) => a.dueAt - b.dueAt);
    currentQueue = state.mode === 'random' ? shuffle(due) : due;
  }
  currentIndex = 0;
  showingBack = false;
}

function renderAll() {
  renderCard();
  renderDeck();
  renderStats();
  els.modeBtn.textContent = hasPendingInitialReview() ? '出題: 初回ランダム' : `出題: ${state.mode === 'random' ? 'ランダム' : '番号順'}`;
  els.themeSelect.value = state.theme;
  syncModeToggles();
  els.controlsRow.classList.toggle('hidden', state.simpleMode);
  els.ratingRow.classList.toggle('hidden', state.simpleMode);
  els.simpleRatingRow.classList.toggle('hidden', !state.simpleMode);
  els.columnsList.innerHTML = state.files.map(f => `<p>${escapeHtml(f.name)}: ${escapeHtml(f.columns.join(' / '))}</p>`).join('') || '<p>未インポート</p>';
}

function syncModeToggles() {
  els.oniToggle.checked = !!state.oniMode;
  els.simpleModeToggle.checked = !!state.simpleMode;
}

function getCurrentCard() { return currentQueue[currentIndex] || null; }

function renderCard() {
  const c = getCurrentCard();
  if (!c) {
    els.front.textContent = '本日の出題はありません';
    els.back.innerHTML = '<div class="detail">新しい単語をインポートするか、期限到来を待ってください。</div>';
    els.sessionInfo.textContent = `総カード: ${state.cards.length}`;
    els.queueInfo.textContent = 'キュー: 0';
    els.oniBox.classList.add('hidden');
    return;
  }
  const isSimple = !!state.simpleMode;
  const prompt = state.oniMode ? `${c.meaning} ${c.emoji || ''}` : `${c.word} ${c.emoji || ''}`;
  const main = state.oniMode ? c.word : c.meaning;
  const mainLabel = state.oniMode ? '英単語' : '意味';

  els.front.textContent = prompt;
  if (isSimple) {
    els.back.innerHTML = showingBack
      ? `<div class="meaning"><span class="label">意味</span>${escapeHtml(c.meaning || '-')}</div>`
      : '<div class="detail">...</div>';
  } else {
    els.back.innerHTML = showingBack
      ? `
        <div class="meaning"><span class="label">${mainLabel}</span>${escapeHtml(main || '-')}</div>
        <div class="detail"><span class="label">例文</span>${escapeHtml(c.example || '-')}</div>
        <div class="detail"><span class="label">例文の和訳</span>${escapeHtml(c.exampleJa || '-')}</div>
      `
      : '<div class="detail">...</div>';
  }
  els.sessionInfo.textContent = `No.${c.no} / ${c.source}`;
  els.queueInfo.textContent = `キュー残: ${Math.max(0, currentQueue.length - currentIndex)}`;
  els.oniBox.classList.toggle('hidden', !state.oniMode || !showingBack || state.simpleMode);
  els.oniResult.textContent = '';
  els.oniInput.value = '';
}

function rateCard(rating) {
  const c = getCurrentCard();
  if (!c) return;
  const prev = structuredClone(c);
  const now = Date.now();

  c.initialReviewed = true;
  c.status = rating;
  c.history.push({ at: now, rating });
  if (rating === 'mastered') {
    c.mastered = true;
    c.dueAt = Number.MAX_SAFE_INTEGER;
  }
  if (rating === 'normal') { c.mastered = false; c.dueAt = now + 2 * DAY; }
  if (rating === 'unsure') { c.mastered = false; c.dueAt = now + DAY; }
  if (rating === 'forgot') {
    c.mastered = false;
    c.dueAt = now;
    c.forgotRequeue = { after: 20, from: now };
    scheduleForgotRequeue(c);
  }

  historyStack.push({ cardId: c.id, prev, idx: currentIndex });
  updateStats(rating);
  currentIndex += 1;
  showingBack = false;
  if (currentIndex >= currentQueue.length) resetQueue();
  saveState();
  renderAll();
}

function scheduleForgotRequeue(card) {
  const insertAt = Math.min(currentQueue.length, currentIndex + 21);
  const clone = card;
  currentQueue.splice(insertAt, 0, clone);
}

function undoLastRating() {
  const last = historyStack.pop();
  if (!last) return;
  const card = state.cards.find(c => c.id === last.cardId);
  if (!card) return;
  Object.assign(card, last.prev);
  currentIndex = Math.max(0, last.idx);
  resetQueue();
  saveState();
  renderAll();
}

function renderDeck() {
  const rows = state.cards.map(c => `<tr>
    <td>${escapeHtml(c.no)}</td><td>${escapeHtml(c.word)}</td><td>${escapeHtml(c.meaning)}</td>
    <td>${escapeHtml(c.status)}</td><td>${c.mastered ? '✅' : ''}</td><td>${formatDate(c.dueAt)}</td>
    <td><button data-restore="${c.id}">未習得に戻す</button></td>
  </tr>`).join('');
  els.deckTableWrap.innerHTML = `<table><thead><tr><th>No</th><th>単語</th><th>意味</th><th>状態</th><th>完全習得</th><th>次回</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`;
  els.deckTableWrap.querySelectorAll('button[data-restore]').forEach(btn => {
    btn.onclick = () => {
      const c = state.cards.find(x => x.id === btn.dataset.restore);
      if (!c) return;
      c.mastered = false;
      c.status = 'unsure';
      c.dueAt = Date.now();
      saveState();
      resetQueue();
      renderAll();
    };
  });
}

function updateStats(rating) {
  const s = state.stats;
  s.totalAnswers += 1;
  if (rating === 'mastered' || rating === 'normal') s.correctLike += 1;
  const today = new Date().toISOString().slice(0, 10);
  s.daily[today] = (s.daily[today] || 0) + 1;
  if (s.lastStudyDate !== today) {
    const y = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    s.streak = s.lastStudyDate === y ? s.streak + 1 : 1;
    s.lastStudyDate = today;
  }
  s.totalSeconds += Math.floor((Date.now() - sessionStart) / 1000) + sessionSeconds;
  sessionStart = Date.now();
  sessionSeconds = 0;
}

function renderStats() {
  const s = state.stats;
  const acc = s.totalAnswers ? Math.round((s.correctLike / s.totalAnswers) * 100) : 0;
  const studyDays = Object.keys(s.daily).length;
  const mastered = state.cards.filter(c => c.mastered).length;
  const unsure = state.cards.filter(c => c.status === 'unsure').length;
  const forgot = state.cards.filter(c => c.status === 'forgot').length;

  els.accuracyStat.textContent = `${acc}%`;
  els.studyDaysStat.textContent = `${studyDays}日`;
  els.studyTimeStat.textContent = `${Math.floor(s.totalSeconds / 60)}分`;
  els.distributionStat.textContent = `完全習得:${mastered} / 自信なし:${unsure} / 忘れた:${forgot}`;

  const streakLabel = streakEffect(s.streak);
  els.streakBadge.textContent = `連続学習: ${s.streak}日 ${streakLabel}`;
  els.streakBadge.classList.toggle('sparkle', s.streak >= 30);

  const days = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY).toISOString().slice(5, 10);
    const full = new Date(Date.now() - (6 - i) * DAY).toISOString().slice(0, 10);
    return { label: d, v: s.daily[full] || 0 };
  });
  const max = Math.max(1, ...days.map(d => d.v));
  els.weeklyGraph.innerHTML = days.map(d => `<div class="bar" style="height:${(d.v / max) * 100}%" title="${d.label}:${d.v}">${d.v}<br>${d.label}</div>`).join('');
}

function streakEffect(streak) {
  if (streak >= 30) return '🏆✨';
  if (streak >= 14) return '👑';
  if (streak >= 7) return '⚡';
  if (streak >= 3) return '🔥';
  return '';
}

function applyTheme() {
  document.documentElement.classList.toggle('light', state.theme === 'light');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalize(v) { return v.trim().toLowerCase(); }
function escapeHtml(v) { return String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function formatDate(ts) { return ts > 9e15 ? '表示なし(習得済み)' : new Date(ts).toLocaleString(); }
