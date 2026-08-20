/* 卡一把 · 纯静态单机版(无后端,双击 index.html 即玩)
 * 判定规则与在线版一致:
 * - 阵营/定位/武器类型/性别/晶源体类型:与答案相同 = 绿
 * - 年龄:±3 岁 = 黄 + 上下箭头
 * - 生日:一年内相差 ≤15 天(环形) = 黄 + 更早/更晚箭头
 * - 8 次机会内猜中角色名即胜
 */
(function () {
  'use strict';

  var KAYIBA = {};

  // ---------- 纯逻辑(可被 node 测试) ----------
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MAX_GUESSES = 5;
  var AGE_CLOSE = 3;
  var BIRTHDAY_CLOSE_DAYS = 15;

  function dayOfYear(value) {
    if (!Number.isInteger(value) || value <= 0) return null;
    var month = Math.floor(value / 100);
    var day = value % 100;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var result = day;
    for (var i = 0; i < month - 1; i++) result += MONTH_DAYS[i];
    return result;
  }

  function birthdayLabel(value) {
    if (!Number.isInteger(value) || value <= 0) return '';
    var month = Math.floor(value / 100);
    var day = value % 100;
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return month + '月' + day + '日';
  }

  function exactAttr(guessValue, targetValue) {
    // 空值视为未知,无法对比,一律灰色
    if (!guessValue || !targetValue) return { value: guessValue, level: 'wrong' };
    return { value: guessValue, level: guessValue === targetValue ? 'correct' : 'wrong' };
  }

  function ageAttr(guessValue, targetValue) {
    if (guessValue === 0 || targetValue === 0) return { value: guessValue, level: 'wrong' };
    if (guessValue === targetValue) return { value: guessValue, level: 'correct' };
    var level = Math.abs(guessValue - targetValue) <= AGE_CLOSE ? 'close' : 'wrong';
    return { value: guessValue, level: level, hint: targetValue > guessValue ? 'higher' : 'lower' };
  }

  function birthdayAttr(guessValue, targetValue) {
    if (guessValue === 0 || targetValue === 0) return { value: guessValue, level: 'wrong' };
    if (guessValue === targetValue) return { value: guessValue, level: 'correct' };
    var g = dayOfYear(guessValue);
    var t = dayOfYear(targetValue);
    if (g === null || t === null) return { value: guessValue, level: 'wrong' };
    var raw = Math.abs(g - t);
    var diff = Math.min(raw, 366 - raw);
    var level = diff <= BIRTHDAY_CLOSE_DAYS ? 'close' : 'wrong';
    var hint = ((t - g + 366) % 366) <= 183 ? 'higher' : 'lower';
    return { value: guessValue, level: level, hint: hint };
  }

  /** 逐属性对比:返回 { nickname, correct, attrs } */
  function compare(guess, target) {
    return {
      nickname: guess.nickname,
      correct: guess.nickname === target.nickname,
      attrs: {
        team: exactAttr(guess.team, target.team),
        role: exactAttr(guess.role, target.role),
        weapon: exactAttr(guess.weapon, target.weapon),
        gender: exactAttr(guess.gender, target.gender),
        age: ageAttr(guess.age, target.age),
        birthday: birthdayAttr(guess.birthday, target.birthday),
        crystal: exactAttr(guess.crystal, target.crystal),
      },
    };
  }

  KAYIBA.MAX_GUESSES = MAX_GUESSES;
  KAYIBA.compare = compare;
  KAYIBA.dayOfYear = dayOfYear;
  KAYIBA.birthdayLabel = birthdayLabel;

  var CHARACTERS = (typeof window !== 'undefined' && window.KAYIBA_CHARACTERS) || [];
  KAYIBA.characters = CHARACTERS;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KAYIBA;
  }

  // ---------- 浏览器 UI ----------
  if (typeof document === 'undefined') return;

  var RECENT_KEY = 'kayi-ba:recent';
  var STATS_KEY = 'kayi-ba:stats';
  var RECENT_WINDOW_MS = 60 * 60 * 1000;

  var state = { target: null, guesses: [], status: 'ready' };
  var $ = function (id) { return document.getElementById(id); };

  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* 忽略 */ }
  }

  function loadRecent() {
    var list = storageGet(RECENT_KEY) || [];
    var cutoff = Date.now() - RECENT_WINDOW_MS;
    return list.filter(function (item) { return item && item.t >= cutoff; });
  }
  function rememberRecent(nickname) {
    var list = loadRecent().filter(function (item) { return item.n !== nickname; });
    list.push({ n: nickname, t: Date.now() });
    storageSet(RECENT_KEY, list.slice(-20));
  }
  function loadStats() {
    return storageGet(STATS_KEY) || { wins: 0, losses: 0, streak: 0, bestStreak: 0 };
  }
  function saveStats(stats) { storageSet(STATS_KEY, stats); }

  function pickTarget() {
    var pool = CHARACTERS;
    var recent = new Set(loadRecent().map(function (item) { return item.n; }));
    var candidates = pool.filter(function (c) { return !recent.has(c.nickname); });
    if (!candidates.length) candidates = pool;
    var target = candidates[Math.floor(Math.random() * candidates.length)];
    rememberRecent(target.nickname);
    return target;
  }

  function findCharacter(input) {
    var q = String(input || '').trim().toLowerCase();
    return CHARACTERS.find(function (c) {
      return c.nickname.toLowerCase() === q
        || (c.alias && c.alias.toLowerCase() === q);
    }) || null;
  }

  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  // ---------- 棋盘渲染 ----------
  var COLUMNS = [
    { key: 'nickname', label: '角色名', render: function (row) { return row.nickname; } },
    { key: 'age', label: '年龄' },
    { key: 'team', label: '阵营' },
    { key: 'role', label: '定位' },
    { key: 'weapon', label: '武器类型' },
    { key: 'gender', label: '性别' },
    { key: 'birthday', label: '生日', render: function (row) { return birthdayLabel(row.attrs.birthday.value) || '-'; } },
    { key: 'crystal', label: '晶源体类型' },
  ];

  function cellHtml(attr) {
    var arrow = attr.hint && attr.level !== 'correct'
      ? '<span class="dir">' + (attr.hint === 'higher' ? '&#9650;' : '&#9660;') + '</span>'
      : '';
    var raw = String(attr.value === undefined || attr.value === null ? '' : attr.value);
    var display = (raw === '' || raw === '0') ? '-' : raw;
    return '<td class="' + attr.level + '">' + escapeHtml(display) + arrow + '</td>';
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function renderBoard() {
    var tbody = $('board-body');
    tbody.innerHTML = '';
    state.guesses.forEach(function (row, index) {
      var tr = document.createElement('tr');
      if (index === state.guesses.length - 1) tr.className = 'row-latest';
      if (row.correct) tr.className = (tr.className ? tr.className + ' ' : '') + 'row-correct';
      tr.innerHTML = '<td class="name' + (row.correct ? ' correct' : '') + '">' + escapeHtml(row.nickname) + '</td>'
        + cellHtml(row.attrs.age)
        + cellHtml(row.attrs.team)
        + cellHtml(row.attrs.role)
        + cellHtml(row.attrs.weapon)
        + cellHtml(row.attrs.gender)
        + cellHtml(row.attrs.birthday)
        + cellHtml(row.attrs.crystal);
      tbody.appendChild(tr);
    });
    renderProgress();
  }

  function renderProgress() {
    var dots = '';
    for (var i = 0; i < MAX_GUESSES; i++) {
      dots += '<i' + (i < state.guesses.length ? ' class="used"' : '') + '></i>';
    }
    $('progress').innerHTML = dots;
  }

  // ---------- 对局流程 ----------
  function startGame() {
    state.target = pickTarget();
    state.guesses = [];
    state.status = 'playing';
    $('guess-input').value = '';
    closeSuggestions();
    renderBoard();
    $('status-text').textContent = '输入角色名开始猜测,共 ' + MAX_GUESSES + ' 次机会';
    $('guess-input').disabled = false;
    $('guess-submit').disabled = false;
    $('guess-input').focus();
  }

  function submitGuess(character) {
    if (!character || state.status !== 'playing') return;
    if (state.guesses.some(function (g) { return g.nickname === character.nickname; })) {
      toast('已经猜过这个角色了');
      return;
    }
    var row = compare(character, state.target);
    row.guessedAt = Date.now();
    state.guesses.push(row);
    renderBoard();

    if (row.correct) {
      finish('won');
    } else if (state.guesses.length >= MAX_GUESSES) {
      finish('lost');
    } else {
      $('guess-input').value = '';
      closeSuggestions();
      $('guess-input').focus();
    }
  }

  function finish(result) {
    state.status = 'finished';
    $('guess-input').disabled = true;
    $('guess-submit').disabled = true;
    var stats = loadStats();
    if (result === 'won') {
      stats.wins += 1;
      stats.streak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    } else {
      stats.losses += 1;
      stats.streak = 0;
    }
    saveStats(stats);
    showResult(result, stats);
  }

  function showResult(result, stats) {
    var t = state.target;
    $('result-title').textContent = result === 'won' ? '恭喜,猜对了!' : '很遗憾,未能猜中';
    $('result-tone').className = result === 'won' ? 'overlay-card win' : 'overlay-card lose';
    $('result-name').textContent = t.nickname;
    $('result-stats').textContent = '共 ' + state.guesses.length + ' 次 · 总场次 ' + (stats.wins + stats.losses)
      + ' · 胜 ' + stats.wins + ' · 负 ' + stats.losses
      + ' · 当前连胜 ' + stats.streak;
    $('result-info').innerHTML =
      '<tr><td class="label">阵营</td><td>' + escapeHtml(t.team || '-') + '</td></tr>'
      + '<tr><td class="label">武器类型</td><td>' + escapeHtml(t.weapon || '-') + '</td></tr>'
      + '<tr><td class="label">性别</td><td>' + escapeHtml(t.gender || '-') + '</td></tr>'
      + '<tr><td class="label">定位</td><td>' + escapeHtml(t.role || '-') + '</td></tr>'
      + '<tr><td class="label">生日</td><td>' + escapeHtml(birthdayLabel(t.birthday) || '-') + '</td></tr>'
      + '<tr><td class="label">类型</td><td>' + escapeHtml(t.crystal || '-') + '</td></tr>'
      + '<tr><td class="label">年龄</td><td>' + (t.age > 0 ? t.age + ' 岁' : '-') + '</td></tr>';
    $('result-overlay').classList.add('show');
  }

  function hideResult() { $('result-overlay').classList.remove('show'); }

  // ---------- 输入补全 ----------
  var suggestions = [];

  function closeSuggestions() { suggestions = []; $('suggestions').innerHTML = ''; $('suggestions').classList.remove('open'); }

  function updateSuggestions() {
    var q = $('guess-input').value.trim().toLowerCase();
    if (!q) { closeSuggestions(); return; }
    suggestions = CHARACTERS.filter(function (c) {
      return c.nickname.toLowerCase().indexOf(q) !== -1
        || (c.alias && c.alias.toLowerCase().indexOf(q) !== -1);
    }).slice(0, 8);
    var list = $('suggestions');
    list.innerHTML = '';
    if (!suggestions.length) { list.classList.remove('open'); return; }
    suggestions.forEach(function (c, index) {
      var li = document.createElement('li');
      li.textContent = c.nickname;
      li.className = index === 0 ? 'active' : '';
      li.onmousedown = function (event) {
        // 只把候选填入输入框,提交由玩家手动点击"提交猜测"
        event.preventDefault();
        $('guess-input').value = c.nickname;
        closeSuggestions();
      };
      list.appendChild(li);
    });
    list.classList.add('open');
  }

  // ---------- 规则弹窗 ----------
  function toggleRules(show) {
    $('rules-overlay').classList.toggle('show', show);
  }

  // ---------- 事件绑定 ----------
  function bind() {
    $('start-btn').addEventListener('click', function () {
      $('start-screen').classList.add('hidden');
      $('game-screen').classList.remove('hidden');
      startGame();
    });
    $('back-btn').addEventListener('click', function () {
      if (state.status === 'playing') {
        if (!confirm('返回首页将结束本局,确定吗?')) return;
      }
      $('game-screen').classList.add('hidden');
      $('start-screen').classList.remove('hidden');
    });
    $('restart-btn').addEventListener('click', function () {
      if (state.status === 'playing' && !confirm('重新开始将清除本局进度,确定吗?')) return;
      startGame();
    });
    $('again-btn').addEventListener('click', function () { hideResult(); startGame(); });
    $('view-btn').addEventListener('click', hideResult);
    $('giveup-btn').addEventListener('click', function () {
      if (state.status !== 'playing') return;
      if (!confirm('查看答案将按失败结束本局,确定吗?')) return;
      finish('lost');
    });
    $('rules-trigger').addEventListener('click', function () { toggleRules(true); });
    $('rules-close').addEventListener('click', function () { toggleRules(false); });
    $('rules-overlay').addEventListener('mousedown', function (event) {
      if (event.target === $('rules-overlay')) toggleRules(false);
    });
    $('result-overlay').addEventListener('mousedown', function (event) {
      if (event.target === $('result-overlay')) hideResult();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if ($('rules-overlay').classList.contains('show')) toggleRules(false);
        else if ($('result-overlay').classList.contains('show')) hideResult();
      }
    });

    var input = $('guess-input');
    // 手动提交:输入必须与某个角色名/别名完全一致
    function submitFromInput() {
      if (state.status !== 'playing') return;
      var q = input.value.trim();
      if (!q) { toast('请输入角色名'); return; }
      var character = findCharacter(q);
      if (!character) {
        toast('没有完全匹配的角色,请从候选项中选择后提交');
        return;
      }
      input.value = character.nickname;
      closeSuggestions();
      submitGuess(character);
    }
    $('guess-submit').addEventListener('click', submitFromInput);
    input.addEventListener('input', updateSuggestions);
    input.addEventListener('focus', updateSuggestions);
    input.addEventListener('blur', function () { setTimeout(closeSuggestions, 150); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitFromInput();
      } else if (event.key === 'ArrowDown' && suggestions.length) {
        event.preventDefault();
        moveActive(1);
      } else if (event.key === 'ArrowUp' && suggestions.length) {
        event.preventDefault();
        moveActive(-1);
      } else if (event.key === 'Tab' && suggestions.length) {
        event.preventDefault();
        $('guess-input').value = suggestions[0].nickname;
        updateSuggestions();
      }
    });
  }

  function moveActive(direction) {
    var items = $('suggestions').children;
    var current = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].classList.contains('active')) { current = i; break; }
    }
    var next = (current + direction + items.length) % items.length;
    for (var j = 0; j < items.length; j++) items[j].classList.toggle('active', j === next);
    $('guess-input').value = suggestions[next].nickname;
  }

  bind();

  // ---------- 手机端优化:输入框聚焦 = 键盘弹起 ----------
  var gameScreenEl = $('game-screen');
  var guessInputEl = $('guess-input');
  function syncKeyboardActive() {
    if (gameScreenEl) {
      gameScreenEl.classList.toggle('keyboard-active', document.activeElement === guessInputEl);
    }
  }
  if (guessInputEl) {
    guessInputEl.addEventListener('focus', syncKeyboardActive);
    guessInputEl.addEventListener('blur', syncKeyboardActive);
  }
  // 视觉视口高度(移动端键盘弹起时输入坞贴底)
  function syncViewportHeight() {
    var vh = window.visualViewport && window.visualViewport.height;
    if (vh) document.documentElement.style.setProperty('--visual-viewport-height', Math.round(vh) + 'px');
  }
  syncViewportHeight();
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewportHeight);
})();
