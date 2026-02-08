const STORAGE_KEY = 'neomemoria-state-v1';
const MAX_WORDS_PER_FILE = 3000;
const DAY = 24 * 60 * 60 * 1000;

const state = normalizeState(loadState());
let currentQueue = [];
let currentIndex = 0;
let showingBack = false;
let historyStack = [];
let sessionStart = Date.now();
let sessionSeconds = 0;
let sessionInterval;
let activeDeckId = null;

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
  modeInfo: document.getElementById('modeInfo'),
  fileInput: document.getElementById('fileInput'),
  importBtn: document.getElementById('importBtn'),
  importStatus: document.getElementById('importStatus'),
  importDeckSelect: document.getElementById('importDeckSelect'),
  deckNameInput: document.getElementById('deckNameInput'),
  newDeckNameWrap: document.getElementById('newDeckNameWrap'),
  columnsList: document.getElementById('columnsList'),
  deckManagerList: document.getElementById('deckManagerList'),
  deckEditorTitle: document.getElementById('deckEditorTitle'),
  deckSearchInput: document.getElementById('deckSearchInput'),
  addNoInput: document.getElementById('addNoInput'),
  addWordInput: document.getElementById('addWordInput'),
  addMeaningInput: document.getElementById('addMeaningInput'),
  addExampleInput: document.getElementById('addExampleInput'),
  addExampleJaInput: document.getElementById('addExampleJaInput'),
  addEmojiInput: document.getElementById('addEmojiInput'),
  addWordBtn: document.getElementById('addWordBtn'),
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
  actionDock: document.querySelector('.action-dock'),
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
    decks: [],
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

function normalizeState(raw) {
  const s = {
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    decks: Array.isArray(raw.decks) ? raw.decks : [],
    files: Array.isArray(raw.files) ? raw.files : [],
    mode: raw.mode || 'random',
    theme: raw.theme || 'dark',
    oniMode: !!raw.oniMode,
    simpleMode: !!raw.simpleMode,
    stats: raw.stats || {
      totalAnswers: 0,
      correctLike: 0,
      daily: {},
      lastStudyDate: null,
      streak: 0,
      totalSeconds: 0
    }
  };

  if (!Array.isArray(s.stats.daily)) s.stats.daily = s.stats.daily || {};

  if (!s.decks.length) {
    const sourceMap = new Map();
    for (const file of s.files) {
      const id = crypto.randomUUID();
      sourceMap.set(file.name, id);
      s.decks.push({ id, name: file.name, createdAt: file.importedAt || Date.now(), updatedAt: Date.now() });
    }
    if (!s.decks.length && s.cards.length) {
      const id = crypto.randomUUID();
      s.decks.push({ id, name: 'メイン単語帳', createdAt: Date.now(), updatedAt: Date.now() });
      sourceMap.set('default', id);
    }
    s.cards.forEach(card => {
      if (!card.deckId) card.deckId = sourceMap.get(card.source) || sourceMap.get('default') || s.decks[0]?.id || null;
    });
  }

  s.cards = s.cards.map((card, i) => ({
    id: card.id || crypto.randomUUID(),
    no: card.no || String(i + 1),
    word: card.word || '',
    meaning: card.meaning || '',
    example: card.example || '',
    exampleJa: card.exampleJa || '',
    emoji: card.emoji || '',
    source: card.source || '-',
    deckId: card.deckId || s.decks[0]?.id || null,
    initialReviewed: !!card.initialReviewed,
    status: card.status || 'new',
    dueAt: Number.isFinite(card.dueAt) ? card.dueAt : Date.now(),
    mastered: !!card.mastered,
    forgotRequeue: card.forgotRequeue || null,
    history: Array.isArray(card.history) ? card.history : []
  })).filter(c => c.word && c.meaning && c.deckId);

  s.decks = s.decks.map(d => ({
    id: d.id || crypto.randomUUID(),
    name: d.name || '名称未設定',
    createdAt: d.createdAt || Date.now(),
    updatedAt: d.updatedAt || Date.now()
  }));

  return s;
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function getPracticeMode() {
  if (state.simpleMode) return 'simple';
  if (state.oniMode) return 'oni';
  return 'normal';
}

function setPracticeMode(mode) {
  state.simpleMode = mode === 'simple';
  state.oniMode = mode === 'oni';
  saveState();
  syncModeToggles();
  switchView('flashcards');
  resetQueue();
  renderAll();
}

function getDeckById(id) {
  return state.decks.find(d => d.id === id) || null;
}

function getCardsByDeckId(deckId) {
  return state.cards.filter(c => c.deckId === deckId);
}

function refreshDeckSelect() {
  const prev = els.importDeckSelect.value;
  const opts = [`<option value="__new__">新規単語帳を作成してインポート</option>`]
    .concat(state.decks.map(d => `<option value="${d.id}">${escapeHtml(d.name)}（${getCardsByDeckId(d.id).length}語）</option>`));
  els.importDeckSelect.innerHTML = opts.join('');

  if (prev && [...els.importDeckSelect.options].some(o => o.value === prev)) {
    els.importDeckSelect.value = prev;
  } else if (state.decks.length) {
    els.importDeckSelect.value = state.decks[0].id;
  } else {
    els.importDeckSelect.value = '__new__';
  }

  els.newDeckNameWrap.classList.toggle('hidden', els.importDeckSelect.value !== '__new__');
}

function touchDeck(deckId) {
  const deck = getDeckById(deckId);
  if (deck) deck.updatedAt = Date.now();
}

function wire() {
  els.menuBtn.onclick = toggleMenu;
  els.menuBackdrop.onclick = closeMenu;
  els.sideMenu.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.action === 'simple-mode') {
        setPracticeMode('simple');
        closeMenu();
        return;
      }
      if (btn.dataset.action === 'normal-mode') {
        setPracticeMode('normal');
        closeMenu();
        return;
      }
      if (btn.dataset.action === 'oni-mode') {
        setPracticeMode('oni');
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

  els.importDeckSelect.onchange = () => {
    els.newDeckNameWrap.classList.toggle('hidden', els.importDeckSelect.value !== '__new__');
  };

  els.importBtn.onclick = async () => {
    const files = [...els.fileInput.files];
    if (!files.length) {
      els.importStatus.textContent = 'ファイルを選択してください。';
      return;
    }

    let deckId = els.importDeckSelect.value;
    if (deckId === '__new__') {
      const deckName = els.deckNameInput.value.trim();
      if (!deckName) {
        els.importStatus.textContent = '新規単語帳名を入力してください。';
        return;
      }
      const duplicated = state.decks.some(d => d.name === deckName);
      if (duplicated) {
        els.importStatus.textContent = '同名の単語帳があります。別名を入力してください。';
        return;
      }
      deckId = crypto.randomUUID();
      state.decks.push({ id: deckId, name: deckName, createdAt: Date.now(), updatedAt: Date.now() });
    }

    const deck = getDeckById(deckId);
    if (!deck) {
      els.importStatus.textContent = '取り込み先単語帳が見つかりません。';
      return;
    }

    let imported = 0;
    let skipped = 0;

    for (const file of files) {
      const text = await file.text();
      const rows = parseCSVorText(text);
      if (!rows.length) continue;
      const header = rows[0].map(x => x.trim());
      const body = rows.slice(1);

      if (body.length > MAX_WORDS_PER_FILE) {
        skipped += 1;
        continue;
      }

      const mapped = mapRows(body, header, file.name, deckId);
      imported += mapped.length;
      state.cards.push(...mapped);
    }

    touchDeck(deckId);
    saveState();
    resetQueue();
    renderAll();

    els.importStatus.textContent = `インポート完了: ${imported}語（スキップ: ${skipped}件） / 単語帳: ${deck.name}`;
    els.fileInput.value = '';
    els.deckNameInput.value = '';
    refreshDeckSelect();
  };

  els.addWordBtn.onclick = addWordToActiveDeck;
  els.deckSearchInput.oninput = renderDeckEditor;

  els.themeSelect.onchange = () => {
    state.theme = els.themeSelect.value;
    saveState();
    applyTheme();
  };

  els.oniToggle.onchange = () => {
    if (els.oniToggle.checked) setPracticeMode('oni');
    else if (els.simpleModeToggle.checked) setPracticeMode('simple');
    else setPracticeMode('normal');
  };

  els.simpleModeToggle.onchange = () => {
    if (els.simpleModeToggle.checked) setPracticeMode('simple');
    else if (els.oniToggle.checked) setPracticeMode('oni');
    else setPracticeMode('normal');
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

function addWordToActiveDeck() {
  if (!activeDeckId || !getDeckById(activeDeckId)) {
    alert('先に単語帳を選択してください。');
    return;
  }

  const word = els.addWordInput.value.trim();
  const meaning = els.addMeaningInput.value.trim();
  if (!word || !meaning) {
    alert('単語と意味は必須です。');
    return;
  }

  const card = {
    id: crypto.randomUUID(),
    no: els.addNoInput.value.trim() || String(getCardsByDeckId(activeDeckId).length + 1),
    word,
    meaning,
    example: els.addExampleInput.value.trim(),
    exampleJa: els.addExampleJaInput.value.trim(),
    emoji: els.addEmojiInput.value.trim(),
    source: getDeckById(activeDeckId)?.name || '-',
    deckId: activeDeckId,
    initialReviewed: false,
    status: 'new',
    dueAt: Date.now(),
    mastered: false,
    forgotRequeue: null,
    history: []
  };

  state.cards.push(card);
  touchDeck(activeDeckId);
  saveState();
  resetQueue();
  renderAll();

  els.addNoInput.value = '';
  els.addWordInput.value = '';
  els.addMeaningInput.value = '';
  els.addExampleInput.value = '';
  els.addExampleJaInput.value = '';
  els.addEmojiInput.value = '';
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
  let cur = '';
  let inQ = false;
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

function mapRows(rows, header, source, deckId) {
  const idx = key => header.findIndex(h => h.trim().toLowerCase() === key);
  const iNo = idx('no');
  const iWord = idx('単語');
  const iMeaning = idx('意味');
  const iEx = idx('例文');
  const iExJa = idx('例文の和訳');
  const iEm = idx('絵文字');

  return rows.map((r, i) => ({
    id: crypto.randomUUID(),
    no: r[iNo] || String(getCardsByDeckId(deckId).length + i + 1),
    word: r[iWord] || r[1] || '',
    meaning: r[iMeaning] || r[2] || '',
    example: r[iEx] || r[3] || '',
    exampleJa: r[iExJa] || r[4] || '',
    emoji: r[iEm] || r[5] || '',
    source,
    deckId,
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
    const due = state.cards.filter(c => !c.mastered && c.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
    currentQueue = state.mode === 'random' ? shuffle(due) : due;
  }
  currentIndex = 0;
  showingBack = false;
}

function getCurrentModeLabel() {
  const mode = getPracticeMode();
  if (mode === 'simple') return 'シンプルフラッシュカード';
  if (mode === 'oni') return '鬼モード';
  return 'ノーマルフラッシュカード';
}

function syncActionDock() {
  const simple = !!state.simpleMode;
  els.actionDock.classList.toggle('simple-only', simple);
  els.controlsRow.classList.toggle('hidden', simple);
  els.ratingRow.classList.toggle('hidden', simple);
  els.simpleRatingRow.classList.toggle('hidden', !simple);
  els.controlsRow.style.display = simple ? 'none' : '';
  els.ratingRow.style.display = simple ? 'none' : '';
  els.simpleRatingRow.style.display = simple ? 'grid' : 'none';
}

function renderAll() {
  renderCard();
  renderDeck();
  renderStats();
  refreshDeckSelect();
  els.modeBtn.textContent = hasPendingInitialReview() ? '出題: 初回ランダム' : `出題: ${state.mode === 'random' ? 'ランダム' : '番号順'}`;
  els.themeSelect.value = state.theme;
  syncModeToggles();
  syncActionDock();
  els.modeInfo.textContent = `モード: ${getCurrentModeLabel()}`;
  els.columnsList.innerHTML = state.decks.map(d => `<p>${escapeHtml(d.name)}: ${getCardsByDeckId(d.id).length}語</p>`).join('') || '<p>未インポート</p>';
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
    els.modeInfo.textContent = `モード: ${getCurrentModeLabel()}`;
    els.oniBox.classList.add('hidden');
    return;
  }

  const mode = getPracticeMode();
  if (mode === 'simple') {
    els.front.textContent = `${c.word} ${c.emoji || ''}`;
    els.back.innerHTML = showingBack
      ? `<div class="meaning"><span class="label">意味</span>${escapeHtml(c.meaning || '-')}</div>`
      : '<div class="detail">...</div>';
  } else if (mode === 'oni') {
    els.front.textContent = `${c.meaning} ${c.emoji || ''}`;
    els.back.innerHTML = showingBack
      ? `<div class="meaning"><span class="label">英単語</span>${escapeHtml(c.word || '-')}</div>`
      : '<div class="detail">...</div>';
  } else {
    els.front.textContent = `No.${escapeHtml(c.no)}  ${c.word}`;
    els.back.innerHTML = showingBack
      ? `
        <div class="detail"><span class="label">例文</span>${escapeHtml(c.example || '-')}</div>
        <div class="detail"><span class="label">例文の和訳</span>${escapeHtml(c.exampleJa || '-')}</div>
        <div class="emoji-showcase" aria-label="絵文字">${escapeHtml(c.emoji || '-')}</div>
      `
      : '<div class="detail">...</div>';
  }

  els.sessionInfo.textContent = `No.${c.no} / ${getDeckById(c.deckId)?.name || c.source}`;
  els.queueInfo.textContent = `キュー残: ${Math.max(0, currentQueue.length - currentIndex)}`;
  els.modeInfo.textContent = `モード: ${getCurrentModeLabel()}`;
  els.oniBox.classList.toggle('hidden', getPracticeMode() !== 'oni' || !showingBack);
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
  currentQueue.splice(insertAt, 0, card);
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
  if (!state.decks.length) {
    activeDeckId = null;
    els.deckManagerList.innerHTML = '<p>単語帳がありません。インポートで作成してください。</p>';
    els.deckEditorTitle.textContent = '単語帳編集（単語帳を選択してください）';
    els.deckTableWrap.innerHTML = '<p>編集対象の単語帳がありません。</p>';
    return;
  }

  if (!activeDeckId || !getDeckById(activeDeckId)) activeDeckId = state.decks[0].id;

  const cards = state.decks.map(deck => {
    const count = getCardsByDeckId(deck.id).length;
    return `
      <article class="deck-card ${deck.id === activeDeckId ? 'active' : ''}">
        <h4>${escapeHtml(deck.name)}</h4>
        <p>${count}語</p>
        <div class="deck-card-actions">
          <button data-open-deck="${deck.id}">編集</button>
          <button data-rename-deck="${deck.id}">名前変更</button>
          <button data-delete-deck="${deck.id}" class="danger">削除</button>
        </div>
      </article>
    `;
  }).join('');

  els.deckManagerList.innerHTML = cards;

  els.deckManagerList.querySelectorAll('[data-open-deck]').forEach(btn => {
    btn.onclick = () => {
      activeDeckId = btn.dataset.openDeck;
      renderDeck();
    };
  });

  els.deckManagerList.querySelectorAll('[data-rename-deck]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.renameDeck;
      const deck = getDeckById(id);
      if (!deck) return;
      const next = prompt('単語帳名を入力してください', deck.name);
      if (!next) return;
      const trimmed = next.trim();
      if (!trimmed) return;
      deck.name = trimmed;
      touchDeck(id);
      saveState();
      renderAll();
    };
  });

  els.deckManagerList.querySelectorAll('[data-delete-deck]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.deleteDeck;
      const deck = getDeckById(id);
      if (!deck) return;
      if (!confirm(`「${deck.name}」を削除します。カードもすべて削除されます。`)) return;
      state.cards = state.cards.filter(c => c.deckId !== id);
      state.decks = state.decks.filter(d => d.id !== id);
      if (activeDeckId === id) activeDeckId = state.decks[0]?.id || null;
      saveState();
      resetQueue();
      renderAll();
    };
  });

  renderDeckEditor();
}

function renderDeckEditor() {
  const deck = getDeckById(activeDeckId);
  if (!deck) {
    els.deckEditorTitle.textContent = '単語帳編集（単語帳を選択してください）';
    els.deckTableWrap.innerHTML = '<p>編集対象の単語帳がありません。</p>';
    return;
  }

  const q = normalize(els.deckSearchInput.value || '');
  const cards = getCardsByDeckId(deck.id)
    .filter(c => !q || [c.word, c.meaning, c.example, c.exampleJa, c.emoji].some(v => normalize(v || '').includes(q)));

  els.deckEditorTitle.textContent = `単語帳編集: ${deck.name}（選択中）`;

  const rows = cards.map(c => `
    <tr>
      <td>${escapeHtml(c.no)}</td>
      <td>${escapeHtml(c.word)}</td>
      <td>${escapeHtml(c.meaning)}</td>
      <td>${escapeHtml(c.example || '-')}</td>
      <td>${escapeHtml(c.exampleJa || '-')}</td>
      <td>${escapeHtml(c.emoji || '-')}</td>
      <td><button data-delete-word="${c.id}" class="danger">削除</button></td>
    </tr>
  `).join('');

  els.deckTableWrap.innerHTML = `<table>
    <thead><tr><th>No</th><th>単語</th><th>意味</th><th>例文</th><th>例文の和訳</th><th>絵文字</th><th>操作</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">データなし</td></tr>'}</tbody>
  </table>`;

  els.deckTableWrap.querySelectorAll('[data-delete-word]').forEach(btn => {
    btn.onclick = () => {
      const cardId = btn.dataset.deleteWord;
      state.cards = state.cards.filter(c => c.id !== cardId);
      touchDeck(activeDeckId);
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

function normalize(v) { return String(v || '').trim().toLowerCase(); }
function escapeHtml(v) { return String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
