/* app.js — навигация, партия с ботом, обучение, задачи, профиль и анализ партий. */
const $ = s => document.querySelector(s);
const main = $('#main');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const last = a => a[a.length - 1];
const setup = { level: 2, color: 'w', time: 0, otime: 5 };
const timeRow = (act, list, cur) => list.map(t => `<button class="chip ${cur === t ? 'on' : ''}" data-act="${act}" data-arg="${t}">${t ? '⏱ ' + t + ' мин' : 'Без часов'}</button>`).join('');
let profile, board, game = null, review = null, taskHint = '';

/* ---------- общие части интерфейса ---------- */
const avatar = () => (profile.photo ? `<img src="${esc(profile.photo)}" alt="">` : esc(profile.name[0].toUpperCase()));
const say = t => { const el = $('#say'); if (el) el.textContent = t; };
const renderHeader = () => { $('#elo').textContent = `${profile.name} · ${profile.elo} Elo`; };
const player = (icon, name, elo, clk = '') => `<div class="player"><span class="av">${icon}</span><div><b>${esc(name)}</b><br><small>${elo} Elo</small></div>${clk ? `<span class="clock" id="${clk}"></span>` : ''}</div>`;

function boardLayout(side, hints = profile.hints) {
  main.innerHTML = `<div class="layout"><div class="boardwrap"><div id="board" class="board"></div></div><aside class="card">${side}</aside></div>`;
  board = new Board($('#board'), { hints });
  fit();
}

/** Подгоняет доску под доступное место: игровой экран помещается без прокрутки страницы. */
function fit() {
  const wrap = $('.boardwrap');
  if (!wrap) return;
  const w = main.clientWidth, h = main.clientHeight, portrait = w < h;
  const size = Math.max(180, Math.floor(portrait ? Math.min(w - 16, h - 200) : Math.min(h - 16, w - 340)));
  wrap.style.width = wrap.style.height = size + 'px';
  $('#board').style.setProperty('--u', size / 100 + 'px');     // единица размера для шрифтов доски
}
addEventListener('resize', fit);

/* ---------- бот в фоновом потоке (если Worker недоступен — считаем здесь) ---------- */
let worker = null, jobs = {}, jobId = 0;
try {
  worker = new Worker('js/worker.js');
  worker.onmessage = e => { const j = jobs[e.data.id]; delete jobs[e.data.id]; if (j) j.resolve(e.data.result); };
  worker.onerror = () => {
    const pending = Object.values(jobs); jobs = {}; worker = null;
    pending.forEach(j => j.resolve(AI.best(...j.args)));
  };
} catch (e) { worker = null; }
function think(state, depth, noise, rand) {
  if (!worker) return Promise.resolve(AI.best(state, depth, noise, rand));
  return new Promise(resolve => { const id = ++jobId; jobs[id] = { resolve, args: [state, depth, noise, rand] }; worker.postMessage({ id, state, depth, noise, rand }); });
}

function movesHTML(list, active = -1) {
  return list.map((x, i) => (i % 2 ? '' : `<span class="no">${i / 2 + 1}.</span>`)
    + `<span class="mv ${x.cls || ''} ${i + 1 === active ? 'on' : ''}" data-act="ply" data-arg="${i + 1}">${x.san}${x.icon || ''}</span>`).join('');
}

function go(name, arg) {
  if (game && game.online && !game.over) finish('left'); // выход из живой партии = поражение
  if (game) { game.over = true; clearTimeout(game.timer); clearInterval(game.tick); }
  Online.close();
  Platform.gameplay(false);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.go === name));
  review = null;
  screens[name](arg);
}

/* ---------- экраны ---------- */
const screens = {
  home() {
    main.innerHTML = `<div class="home">
      <div class="home-hero"><div class="home-knight">♞</div><h1>${esc(GAME_TITLE)}</h1><p>Шахматы против бота, обучение, задачи и онлайн-партии.</p></div>
      <div class="home-grid">
        <button class="home-btn primary" data-go="play"><b>♟ Играть</b><small>Партия против бота</small></button>
        <button class="home-btn" data-go="online"><b>🌐 Онлайн</b><small>Игра с другим игроком</small></button>
        <button class="home-btn" data-go="learn"><b>🎓 Обучение</b><small>Освойте правила по шагам</small></button>
        <button class="home-btn" data-go="train"><b>🧩 Задачи</b><small>Проверьте свои навыки</small></button>
      </div>
      <div class="home-row"><button data-go="profile">👤 Профиль</button><button data-go="rating">🏆 Рейтинг</button></div>
    </div>`;
  },
  welcome() {
    main.innerHTML = `<div class="card narrow"><h2>Добро пожаловать в шахматы! ♞</h2>
      <p>Если вы только начинаете, сыграйте обучающую партию: бот ходит почти наугад, а я подсказываю, как ходит каждая фигура. Ходы можно отменять, а подсказка выручит, если вы застряли.</p>
      <button class="cta" data-act="tutorial">🎓 Начать обучающую партию</button>
      <button data-go="learn">📚 Сначала пройти уроки</button><button data-go="play">Я умею играть</button><button data-go="profile">👤 Войти: прогресс на всех устройствах и рейтинг</button></div>`;
    profile.seen = true; Platform.save();
  },
  online() {
    main.innerHTML = `<div class="card narrow"><h2>🌐 Игра онлайн</h2>${Online.available() ? `
      <div class="row">${timeRow('otime', [3, 5, 10], setup.otime)}</div>
      <button class="cta" data-act="quick">⚡ Быстрая игра</button>
      <div class="row"><button data-act="create">Создать комнату</button><input id="code" maxlength="6" placeholder="Код комнаты"><button data-act="join">Войти</button></div>
      <p id="onmsg" class="say">Рейтинг Elo меняется по результату онлайн-партии. В партии можно один раз запросить паузу до 2 минут.</p>`
      : '<p>Онлайн-режим требует сервера. Укажите его адрес в <b>ONLINE_URL</b> (файл js/content.js), инструкция в README.</p>'}</div>`;
  },
  async rating() {
    main.innerHTML = '<div class="card narrow"><h2>🏆 Рейтинг игроков</h2><div id="lb">Загрузка…</div></div>';
    const rows = await Platform.leaderboard();
    $('#lb').innerHTML = rows ? rows.map(r => `<div class="hist"><span>${r.rank}. ${esc(r.name)}</span><b>${r.score}</b></div>`).join('') || 'Пока никого нет' : 'Таблица лидеров доступна внутри Яндекс Игр для авторизованных игроков.';
  },
  play() {
    main.innerHTML = `<div class="card narrow"><h2>Играть с ботом</h2><button data-act="tutorial">🎓 Обучающая партия для новичков</button>
      <div class="bots">${BOTS.map((b, i) => `<button class="bot ${i === setup.level ? 'on' : ''}" data-act="level" data-arg="${i}"><span>${b.emoji}</span><b>${b.name}</b><small>~${b.elo} Elo</small></button>`).join('')}</div>
      <div class="row">${[['w', '♔ Белые'], ['r', '🎲 Случайно'], ['b', '♚ Чёрные']].map(([c, t]) => `<button class="chip ${setup.color === c ? 'on' : ''}" data-act="color" data-arg="${c}">${t}</button>`).join('')}</div>
      <div class="row">${timeRow('time', [0, 5, 10], setup.time)}</div>
      <p><small>Партии с ботом меняют ваш рейтинг Elo. Рейтинг ботов ориентировочный.</small></p>
      <button class="cta" data-act="start">Начать партию</button></div>`;
  },
  learn() { listScreen('Обучение', 'Короткие интерактивные уроки: выполните задание прямо на доске.', LESSONS, 'lessons', 'lesson'); },
  train() { listScreen('Задачи', 'Найдите ход, который ставит мат.', PUZZLES, 'puzzles', 'puzzle'); },
  profile() {
    const p = profile;
    main.innerHTML = `<div class="card narrow"><h2>${p.seen ? 'Профиль' : 'Добро пожаловать!'}</h2>
      <div class="player"><span class="av big">${avatar()}</span><div><b>${esc(p.name)}</b><br><small>${p.elo} Elo · партий ${p.games} (${p.wins} П / ${p.draws} Н / ${p.losses} Пр)</small></div></div>
      <div class="row"><input id="nick" maxlength="14" placeholder="Ваш ник" value="${p.name === 'Игрок' ? '' : esc(p.name)}"><button data-act="nick">Сохранить ник</button></div>
      <small>Вход сохранит прогресс на всех устройствах и добавит вас в рейтинг игроков.</small>
      <div class="row"><button data-act="yandex">Войти через Яндекс</button><small id="loginMsg"></small></div>
      <h3>Настройки</h3>
      <label class="sw"><input type="checkbox" data-act="toggle" data-arg="sound" ${p.sound ? 'checked' : ''}> Звуки</label>
      <label class="sw"><input type="checkbox" data-act="toggle" data-arg="hints" ${p.hints ? 'checked' : ''}> Подсказки ходов</label>
      <h3>Последние партии</h3>${p.history.map((h, i) => `<div class="hist"><span>${h.score === 1 ? '✅' : h.score === 0 ? '❌' : '🤝'} ${esc(h.bot)} ${h.rated === false ? '(учебная)' : `(${h.delta >= 0 ? '+' : ''}${h.delta})`}</span><button data-act="analyse" data-arg="${i}">📊 Анализ</button></div>`).join('') || '<small>Пока нет партий</small>'}</div>`;
    p.seen = true; Platform.save();
  },
};

function listScreen(title, text, list, key, action) {
  const first = key === 'lessons' ? '<button class="item" data-act="tutorial">🎓 Обучающая партия с ботом: подсказки по каждой фигуре</button>' : '';
  main.innerHTML = `<div class="card narrow"><h2>${title} (${profile[key].length}/${list.length})</h2><p>${text}</p>${first}${list.map((t, i) => `<button class="item" data-act="${action}" data-arg="${i}">${profile[key].includes(t.id) ? '✅' : i + 1}  ${t.title}</button>`).join('')}</div>`;
}

/* ---------- партия с ботом ---------- */
const TIPS = {
  P: ['Пешка', 'ходит вперёд на 1 клетку (с начальной позиции можно на 2), а бьёт по диагонали вперёд.'],
  N: ['Конь', 'ходит буквой «Г» и перепрыгивает через другие фигуры.'],
  B: ['Слон', 'ходит по диагонали на любое число клеток.'],
  R: ['Ладья', 'ходит по прямой: вперёд, назад и в стороны.'],
  Q: ['Ферзь', 'самая сильная фигура: ходит как ладья и как слон.'],
  K: ['Король', 'ходит на 1 клетку в любую сторону. Главное — не подставить его под шах.'],
};
/** Подсказка-наставник в обучающей партии. */
function coach(sq, text) {
  const el = $('#coach');
  if (!el) return;
  const p = sq == null ? null : game.state.b[sq];
  el.textContent = text || (p ? `🎓 ${TIPS[p.toUpperCase()][0]} ${TIPS[p.toUpperCase()][1]}` : '🎓 Нажмите на свою фигуру — я покажу, как она ходит. Точки — доступные ходы.');
}

function startGame(tutorial = false, online = null) {
  const color = tutorial ? 'w' : online ? online.color : setup.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
  const bot = tutorial ? BOTS[0] : online ? { name: online.opponent.name, emoji: '🌐', elo: online.opponent.elo } : BOTS[setup.level], state = Chess.fromFEN(Chess.START);
  const time = tutorial ? 0 : online ? (online.time || 5) : setup.time;
  game = { bot, color, state, tutorial, online: !!online, matchId: online?.matchId || null, clock: time ? { w: time * 60000, b: time * 60000, last: Date.now() } : null, assisted: tutorial, states: [state], keys: [Chess.key(state)], moves: [], over: false, busy: false, pausedUntil: 0, pauseUsed: false, pausePending: false, finishing: false };
  const ad = !tutorial && !online && Platform.hasSdk() && Platform.CONFIG.rewardedAssist ? ' (видео)' : '';
  boardLayout(`${player(bot.emoji, bot.name, bot.elo, 'clkO')}<div id="say" class="say">Ваш ход</div>
    <div class="row">${online ? '<button data-act="pause">⏸ Запросить паузу</button>' : `<button data-act="undo">↶ Отмена хода${ad}</button><button data-act="tip">💡 Подсказка${ad}</button>`}<button data-act="flip">⇅</button><button class="danger" data-act="resign">Сдаться</button></div>
    ${tutorial ? '<div id="coach" class="coach"></div>' : ''}<div id="moves" class="moves"></div>
    <small>${online ? 'Онлайн-партия: рейтинг меняется по результату. Пауза — один запрос на игрока, максимум 2 минуты.' : `${ad ? 'Подсказка и отмена хода показываются после короткого видео. ' : ''}Они делают партию учебной: рейтинг не меняется.`}</small>
    ${player(avatar(), profile.name, profile.elo, 'clkM')}`, tutorial || profile.hints);
  board.setPosition(state, { orientation: color });
  board.onMove = playMove;
  if (online) {
    const g = game;
    Online.on({
      message: m => {
        if (game !== g || g.over) return;
        if (m.type === 'move' && m.move && g.state.turn !== g.color && g.pausedUntil <= Date.now()) {
          const mv = Chess.legal(g.state).find(x => x.from === m.move.from && x.to === m.move.to && (x.promo || null) === (m.move.promo || null));
          if (mv) playMove(mv);
        } else if (m.type === 'resign') finish('oppresign');
        else if (m.type === 'left') finish('left');
        else if (m.type === 'timeout') finish('oppTime');
        else if (m.type === 'pause_request') showPauseRequest(m.seconds, m.from?.name || 'Соперник');
        else if (m.type === 'pause_declined') { g.pausePending = false; say('Соперник отклонил паузу.'); }
        else if (m.type === 'pause_error') { g.pausePending = false; say(m.text || 'Пауза сейчас недоступна.'); }
        else if (m.type === 'pause_state') setPause(m.until, m.seconds);
      },
      close: () => { if (game === g && !g.over) finish('left'); },
    });
  }
  board.onSelect = sq => tutorial && coach(sq);
  Platform.gameplay(true);
  if (tutorial) coach(null);
  nextTurn();
}

/* ---------- шахматные часы ---------- */
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function paintClocks() {
  if (!game || !game.clock || !$('#clkM')) return;
  const opp = game.color === 'w' ? 'b' : 'w';
  for (const [id, side] of [['#clkM', game.color], ['#clkO', opp]]) {
    $(id).textContent = fmt(game.clock[side]);
    $(id).classList.toggle('low', game.clock[side] < 20000);
    $(id).classList.toggle('run', game.state.turn === side && !game.over);
  }
}
/** Списывает время с игрока, чей сейчас ход. */
function settle() {
  if (!game.clock || game.pausedUntil > Date.now()) return;
  const now = Date.now();
  game.clock[game.state.turn] -= now - game.clock.last; game.clock.last = now;
}
function startClock() {
  const g = game;
  clearInterval(g.tick);
  if (!g.clock) return;
  g.clock.last = Date.now(); paintClocks();
  g.tick = setInterval(() => {
    if (g !== game || g.over) return clearInterval(g.tick);
    if (g.pausedUntil > Date.now()) { paintClocks(); return; }
    settle(); paintClocks();
    const side = g.state.turn;
    if (g.clock[side] > 0) return;
    g.clock[side] = 0; paintClocks();
    if (side === g.color) { if (g.online) Online.send({ type: 'timeout' }); finish('timeout'); }   // свой флажок объявляем сами
    else if (!g.online) finish('oppTime');                      // у бота время вышло
  }, 250);
}

function playMove(m) {
  if (game.online && game.pausedUntil > Date.now()) return say('Партия на паузе.');
  if (game.online && game.state.turn === game.color) Online.send({ type: 'move', matchId: game.matchId, move: { from: m.from, to: m.to, promo: m.promo || null } });
  settle();
  game.state = Chess.make(game.state, m);
  game.moves.push({ m, san: Chess.san(last(game.states), m) });
  game.states.push(game.state);
  const k = Chess.key(game.state);
  game.keys.push(k);
  board.applyMove(game.state, m);
  Sound.play(Chess.inCheck(game.state) ? 'check' : m.castle ? 'castle' : m.cap ? 'capture' : 'move');
  $('#moves').innerHTML = movesHTML(game.moves);
  const end = game.keys.filter(x => x === k).length >= 3 ? 'repetition' : Chess.status(game.state);
  end ? finish(end) : nextTurn();
}

function nextTurn() {
  startClock();
  if (game.state.turn === game.color) {
    game.busy = false; board.setInteractive(game.color);
    say(Chess.inCheck(game.state) ? 'Вам шах! Защитите короля' : 'Ваш ход');
    if (game.tutorial && game.moves.length) coach(null, `🎓 Бот сходил ${last(game.moves).san}. Ваш ход!`);
    return;
  }
  if (game.online) { game.busy = true; board.setInteractive(null); say('Ход соперника…'); return; }
  game.busy = true; board.setInteractive(null); say('Бот думает…');
  const g = game, st = game.state;
  game.timer = setTimeout(async () => {                // пауза, чтобы интерфейс успел отрисоваться
    if (g.over) return;
    const { move } = await think(st, g.bot.depth, g.bot.noise, g.bot.rand);
    if (g === game && !g.over && g.state === st) playMove(move);
  }, 450);
}

/** Отмена: возвращаем позицию к вашему последнему ходу (откатываем ход бота и свой). */
async function undo() {
  if (!game || game.over) return;
  if (game.busy) return say('Подождите ход бота');
  if (game.moves.length < (game.color === 'w' ? 2 : 3)) return say('Пока нечего отменять');
  if (!game.tutorial && !(await Platform.rewarded())) return say('Для отмены хода нужно досмотреть видео');
  if (game.over || game.busy) return;
  for (const list of [game.moves, game.states, game.keys]) list.splice(-2);
  game.state = last(game.states); game.assisted = true;
  board.setPosition(game.state, { orientation: game.color, last: game.moves.length ? last(game.moves).m : null });
  $('#moves').innerHTML = movesHTML(game.moves);
  say('Ход отменён. Партия стала учебной');
}

/** Подсказка: бот ищет лучший ход за вас и подсвечивает его синим. */
async function tip() {
  if (!game || game.over || game.busy) return;
  if (!game.tutorial && !(await Platform.rewarded())) return say('Для подсказки нужно досмотреть видео');
  if (game.over || game.busy) return;
  const { move } = AI.best(game.state, 2);
  game.assisted = true; board.showSuggestion(move);
  say(`Подсказка: ${Chess.san(game.state, move)} (синие клетки). Партия стала учебной`);
}

function finish(reason) {
  if (!game || game.over || game.finishing) return;
  game.finishing = true;
  game.over = true;
  board.setInteractive(null); clearTimeout(game.timer); clearInterval(game.tick); Platform.gameplay(false);
  if (game.online && ['resign', 'timeout'].includes(reason)) Online.send({ type: reason, matchId: game.matchId });
  const opp = game.color === 'w' ? 'b' : 'w';
  const loser = reason === 'resign' || reason === 'timeout' ? game.color : ['oppresign', 'left', 'oppTime'].includes(reason) ? opp : reason === 'checkmate' ? game.state.turn : null;
  const score = loser ? (loser === game.color ? 0 : 1) : 0.5;
  const rated = game.online ? true : !game.assisted;
  const delta = rated ? Platform.applyElo(game.bot.elo, score) : 0;
  Platform.addGame({
    moves: game.moves.map(x => ({ from: x.m.from, to: x.m.to, promo: x.m.promo || null })),
    color: game.color, bot: game.bot.name, opponent: game.bot.name, online: !!game.online, score, delta, rated, date: Date.now(),
  });
  renderHeader(); Sound.play(score === 1 ? 'win' : score === 0 ? 'lose' : 'move');
  const names = { checkmate: 'Мат', stalemate: 'Пат', fifty: 'Правило 50 ходов', insufficient: 'Недостаточно материала', repetition: 'Троекратное повторение', resign: 'Сдача', oppresign: 'Соперник сдался', timeout: 'Время вышло', oppTime: 'У соперника вышло время', left: 'Соперник вышел из игры' };
  const title = score === 1 ? 'Победа! 🎉' : score === 0 ? 'Поражение' : 'Ничья';
  const rating = rated ? `Рейтинг: ${profile.elo} (${delta >= 0 ? '+' : ''}${delta})` : 'Учебная партия: рейтинг не изменён.';
  main.insertAdjacentHTML('beforeend', `<div class="modal"><div class="card"><h2>${title}</h2><p>${names[reason] || 'Партия завершена'}. ${rating}</p>
    <div class="row"><button class="cta" data-act="analyse" data-arg="0">📊 Разбор партии</button><button data-act="again">Новая партия</button><button data-go="home">⌂ Главное меню</button></div></div></div>`);
}

/* ---------- обучение и задачи ---------- */
function openTask(list, i, key, action) {
  const t = list[i];
  Platform.gameplay(true);
  boardLayout(`<h2>${t.title}</h2><p>${t.text || 'Найдите ход, который ставит мат.'}</p><div id="say" class="say"></div>
    <div class="row"><button data-act="hint">💡 Подсказка</button><button id="next" class="cta" data-act="${action}" data-arg="${i + 1}" hidden>Дальше ▶</button><button data-go="home">⌂ Главное меню</button></div>`, true);
  taskHint = t.ok ? `Сходите ${t.ok[0].slice(0, 2)}–${t.ok[0].slice(2)}` : 'Ищите шах, после которого королю некуда идти.';
  const st = Chess.fromFEN(t.fen);
  const reset = () => { board.setPosition(st, { orientation: st.turn }); board.setInteractive(st.turn); };
  reset();
  board.onMove = m => {
    board.setInteractive(null);
    const next = Chess.make(st, m);
    const ok = t.mate ? Chess.status(next) === 'checkmate' : t.ok.includes(Chess.sqName(m.from) + Chess.sqName(m.to));
    board.applyMove(next, m);
    if (ok) {
      Sound.play('correct'); say('Верно! ✓');
      if (!profile[key].includes(t.id)) profile[key].push(t.id);
      Platform.save();
      $('#next').hidden = i + 1 >= list.length;
      if (i + 1 >= list.length) {
        $('#say').insertAdjacentHTML('afterend', '<div class="success-actions"><b>🎉 Раздел завершён!</b><button data-go="home" class="cta">⌂ Вернуться в главное меню</button><button data-go="' + (key === 'lessons' ? 'learn' : 'train') + '">К списку</button></div>');
      }
    } else { Sound.play('wrong'); say('Не то. Попробуйте ещё раз'); setTimeout(reset, 800); }
  };
}

/* ---------- онлайн: подбор соперника ---------- */
async function lobby(request) {
  const note = html => { $('#onmsg').innerHTML = html; };
  note('Подключаюсь к серверу…');
  try { await Online.open(); } catch (e) { return note('Не удалось подключиться к серверу. Попробуйте позже.'); }
  Online.on({
    message: m => {
      if (m.type === 'waiting') note(`Ищу соперника…${m.code ? ` Код комнаты: <b>${m.code}</b>, отправьте его другу.` : ''} <button data-act="cancel">Отмена</button>`);
      else if (m.type === 'start') startGame(false, m);
      else if (m.type === 'error') note(esc(m.text));
    },
    close: () => note('Связь с сервером потеряна.'),
  });
  Online.send({ ...request, name: profile.name, elo: profile.elo });
}

/* ---------- разбор партии ---------- */
async function analyse(idx) {
  const rec = profile.history[idx];
  if (!rec) return;
  const states = [Chess.fromFEN(Chess.START)], moves = [];
  for (const r of rec.moves) {
    const m = Chess.legal(last(states)).find(x => x.from === r.from && x.to === r.to && (x.promo || null) === r.promo);
    moves.push(m); states.push(Chess.make(last(states), m));
  }
  boardLayout(`<h2>Разбор партии</h2><div id="say" class="say">Анализирую… 0%</div><div id="verdict" class="verdict"></div>
    <div class="row"><button data-act="ply" data-arg="prev">◀</button><button data-act="ply" data-arg="next">▶</button><button data-act="nexterr">К следующей ошибке</button><button data-go="home">⌂ Главное меню</button></div>
    <div id="moves" class="moves"></div>`);
  review = { states, moves, rec, rows: [], ply: 0, showBest: false };
  board.setPosition(states[0], { orientation: rec.color });
  for (let i = 0; i < moves.length; i++) {
    if (!review || review.states !== states) return;     // пользователь ушёл с экрана
    const before = AI.best(states[i], 2), played = -AI.score(states[i + 1], 1), mover = states[i].turn;
    review.rows.push({
      san: Chess.san(states[i], moves[i]), ...AI.classify(Math.max(0, before.score - played)),
      best: Chess.san(states[i], before.move), bestMove: before.move, mine: mover === rec.color,
    });
    say(`Анализирую… ${Math.round(100 * (i + 1) / moves.length)}%`);
    await new Promise(r => setTimeout(r));
  }
  const mine = review.rows.filter(r => r.mine), count = c => mine.filter(r => r.cls === c).length;
  say(`Ваши ходы: грубых ошибок ${count('blun')}, ошибок ${count('mist')}, неточностей ${count('inacc')}. Нажимайте на ходы, чтобы увидеть разбор.`);
  actions.nexterr();
}

function setPause(until, seconds) {
  if (!game || !game.online) return;
  settle();
  game.pausedUntil = until;
  if (game.pausePending) game.pauseUsed = true;
  game.pausePending = false;
  board.setInteractive(null);
  const ms = Math.max(0, until - Date.now());
  say(`⏸ Пауза: ${Math.ceil(ms / 1000)} сек.`);
  clearTimeout(game.pauseTimer);
  game.pauseTimer = setInterval(() => {
    if (!game || game.over) return clearInterval(game.pauseTimer);
    const left = Math.max(0, game.pausedUntil - Date.now());
    say(left ? `⏸ Пауза: ${Math.ceil(left / 1000)} сек.` : (game.state.turn === game.color ? 'Пауза закончилась. Ваш ход' : 'Пауза закончилась. Ход соперника…'));
    if (!left) { clearInterval(game.pauseTimer); game.pausedUntil = 0; game.clock.last = Date.now(); document.getElementById('pauseBanner')?.remove(); const pauseBtn = document.querySelector('[data-act="pause"]'); if (pauseBtn && game.pauseUsed) { pauseBtn.disabled = true; pauseBtn.textContent = '⏸ Пауза использована'; } nextTurn(); }
  }, 250);
  const oldBanner = document.getElementById('pauseBanner'); if (oldBanner) oldBanner.remove();
  $('#say')?.insertAdjacentHTML('afterend', `<div id="pauseBanner" class="pause-banner">⏸ Игра приостановлена на ${seconds} сек.</div>`);
  const pauseBtn = document.querySelector('[data-act="pause"]'); if (pauseBtn) pauseBtn.disabled = true;
}

function showPauseRequest(seconds, from) {
  if (!game || game.over) return;
  game.pausePending = true;
  const old = document.getElementById('pauseRequest'); if (old) old.remove();
  main.insertAdjacentHTML('beforeend', `<div class="modal" id="pauseRequest"><div class="card"><h2>⏸ Запрос паузы</h2><p>${esc(from)} просит поставить партию на паузу на <b>${seconds} секунд</b>.</p><div class="row"><button class="cta" data-act="pauseAccept" data-arg="${seconds}">Принять</button><button data-act="pauseDecline">Отклонить</button></div></div></div>`);
}

/** Показывает ход №n: оценка простым языком и, если ход неидеален, лучший вариант. */
function showPly(n, showBest = false) {
  if (!review) return;
  const { states, moves, rows, rec } = review;
  review.ply = Math.max(0, Math.min(rows.length, n)); review.showBest = showBest;
  const r = rows[review.ply - 1], ply = showBest && r ? review.ply - 1 : review.ply;
  board.setPosition(states[ply], { orientation: rec.color, last: ply && !showBest ? moves[ply - 1] : null });
  if (showBest && r) board.showSuggestion(r.bestMove);
  $('#moves').innerHTML = movesHTML(rows, review.ply);
  const bad = r && ['inacc', 'mist', 'blun'].includes(r.cls);
  $('#verdict').innerHTML = r ? `<div class="v ${r.cls}"><b>${r.mine ? 'Ваш ход' : 'Ход бота'}: ${r.san}</b><br>${r.icon} ${r.label}
    ${bad ? `<br>Лучше было: <b>${r.best}</b> <button data-act="showbest">${showBest ? 'Вернуть позицию' : 'Показать на доске'}</button>` : ''}</div>` : '';
}

/* ---------- обработчики кнопок ---------- */
const actions = {
  level: i => { setup.level = +i; screens.play(); },
  color: c => { setup.color = c; screens.play(); },
  time: t => { setup.time = +t; screens.play(); },
  otime: t => { setup.otime = +t; screens.online(); },
  quick: () => lobby({ type: 'quick', time: setup.otime }),
  create: () => lobby({ type: 'create', time: setup.otime }),
  join: () => { const c = $('#code').value.trim().toUpperCase(); if (c) lobby({ type: 'join', code: c }); },
  cancel: () => { Online.send({ type: 'cancel' }); Online.close(); screens.online(); },
  pause: () => {
    if (!game || !game.online || game.over || game.pauseUsed || game.pausePending || game.pausedUntil > Date.now()) return;
    main.insertAdjacentHTML('beforeend', `<div class="modal" id="pauseChooser"><div class="card"><h2>⏸ Запрос паузы</h2><p>Выберите длительность. Соперник должен подтвердить запрос.</p><div class="row"><button data-act="pauseChoose" data-arg="30">30 сек</button><button class="cta" data-act="pauseChoose" data-arg="60">60 сек</button><button data-act="pauseChoose" data-arg="120">120 сек</button><button data-act="pauseCancel">Отмена</button></div></div></div>`);
  },
  pauseChoose: seconds => {
    const modal = document.getElementById('pauseChooser'); if (modal) modal.remove();
    if (!game || !game.online || game.over || game.pauseUsed || game.pausePending) return;
    game.pausePending = true; say('Запрос паузы отправлен…');
    Online.send({ type: 'pause_request', matchId: game.matchId, seconds: Number(seconds) || 60 });
  },
  pauseCancel: () => { const modal = document.getElementById('pauseChooser'); if (modal) modal.remove(); },
  pauseAccept: seconds => {
    const modal = document.getElementById('pauseRequest'); if (modal) modal.remove();
    if (!game || !game.online || game.over) return;
    game.pausePending = false;
    Online.send({ type: 'pause_response', matchId: game.matchId, accept: true, seconds: Number(seconds) || 60 });
  },
  pauseDecline: () => {
    const modal = document.getElementById('pauseRequest'); if (modal) modal.remove();
    if (!game || !game.online || game.over) return;
    game.pausePending = false; Online.send({ type: 'pause_response', matchId: game.matchId, accept: false });
  },
  start: () => startGame(false), tutorial: () => startGame(true), undo, tip,
  showbest: () => review && showPly(review.ply, !review.showBest),
  nexterr: () => {
    if (!review) return;
    const i = review.rows.findIndex((r, k) => k >= review.ply && r.mine && ['inacc', 'mist', 'blun'].includes(r.cls));
    if (i < 0) { say('Больше ошибок нет 👍'); if (!review.ply) showPly(1); } else showPly(i + 1);
  },
  flip: () => board.flip(),
  resign: (_, el) => {
    if (!game || game.over) return;
    if (el.dataset.sure) { if (game.online) Online.send({ type: 'resign' }); return finish('resign'); }
    el.dataset.sure = 1; el.textContent = 'Точно сдаться?';
    setTimeout(() => { delete el.dataset.sure; el.textContent = 'Сдаться'; }, 3000);
  },
  analyse: i => analyse(+i),
  again: async () => { await Platform.showAd(); go('play'); },
  lesson: i => (+i < LESSONS.length ? openTask(LESSONS, +i, 'lessons', 'lesson') : go('learn')),
  puzzle: i => (+i < PUZZLES.length ? openTask(PUZZLES, +i, 'puzzles', 'puzzle') : go('train')),
  hint: () => say(taskHint),
  ply: a => review && showPly(a === 'prev' ? review.ply - 1 : a === 'next' ? review.ply + 1 : +a),
  nick: () => {
    const v = $('#nick').value.trim();
    if (v) { profile.name = v.slice(0, 14); Platform.save(); renderHeader(); screens.profile(); }
  },
  yandex: async () => {
    const ok = await Platform.loginYandex();
    if (ok) { profile = Platform.profile(); Sound.setEnabled(profile.sound); renderHeader(); screens.profile(); }
    else $('#loginMsg').textContent = Platform.hasSdk() ? 'Не удалось войти' : 'Вход доступен внутри Яндекс Игр';
  },
  toggle: (key, el) => {
    profile[key] = el.checked;
    if (key === 'sound') Sound.setEnabled(el.checked);
    Platform.save();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-go],[data-act]');
  if (!el) return;
  Sound.play('click');
  if (el.dataset.go) go(el.dataset.go); else actions[el.dataset.act](el.dataset.arg, el);
});

/* ---------- звук отключается при потере фокуса, меню по долгому нажатию запрещено ---------- */
const syncFocus = () => Sound.mute('focus', document.hidden || !document.hasFocus());
document.addEventListener('visibilitychange', syncFocus);
addEventListener('blur', syncFocus);
addEventListener('focus', syncFocus);
document.addEventListener('contextmenu', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });

/* ---------- запуск ---------- */
Platform.init().then(p => {
  document.documentElement.lang = Platform.lang();
  document.title = GAME_TITLE; $('#brand').textContent = '♞ ' + GAME_TITLE;
  profile = p; Sound.setEnabled(p.sound); renderHeader();
  go(p.seen ? 'home' : 'welcome');
  Platform.ready();
});
