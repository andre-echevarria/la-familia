/* La Familia phone client */
(() => {
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const music = $('#music');
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');

  // storage can be unavailable (private mode); fall back to memory
  const mem = {};
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return mem[k] || null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
  };

  let view = null;          // latest state from server
  let offset = 0;           // serverNow - Date.now()
  let session = store.get('lf-session'); // { code, token }
  const ui = { gender: store.get('lf-gender') || 'm', name: store.get('lf-name') || '', agree: false, lastKey: '' };

  const socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => { if (session) socket.emit('resume', session); else render(); });
  socket.on('joined', ({ code, token }) => { session = { code, token }; store.set('lf-session', session); history.replaceState(null, '', '/'); });
  socket.on('gone', () => { session = null; store.del('lf-session'); view = null; render(); });
  socket.on('state', (v) => { offset = v.serverNow - Date.now(); view = v; render(); });
  socket.on('err', (m) => toast(m));
  socket.on('disconnect', () => toast('Reconnecting...'));

  const send = (type, data) => socket.emit('act', { type, data });

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = (id) => view.players.find((p) => p.id === id) || { name: '?', gender: 'm' };
  const nm = (id) => esc(P(id).name);
  const avatar = (p) => `/img/${p.card ? p.card.img : p.gender === 'f' ? 'prima' : 'primo'}.png`;
  const isNarr = () => view && view.role === 'narrator';
  const me = () => view && view.me;

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
  }

  function person(p, { kick = false, showReady = false } = {}) {
    const role = p.card ? `<div class="rl team-${p.card.team}">${esc(p.card.name)}</div>` : '';
    return `<div class="person ${p.alive ? '' : 'out'}">
      ${kick ? `<button class="x" data-act="kick" data-pid="${p.id}" aria-label="Remove">×</button>` : ''}
      ${showReady && p.ready ? '<span class="tick">✓</span>' : ''}
      <img src="${avatar(p)}" alt=""><div class="nm">${esc(p.name)}</div>${role}</div>`;
  }
  const people = (list, opts) => `<div class="people">${list.map((p) => person(p, opts)).join('')}</div>`;

  function pickList(ids, { act, selected, disabled = false, badges = {} }) {
    return `<div class="picks">${ids.map((id) => {
      const p = P(id);
      const b = badges[id] ? `<span class="badge">${esc(badges[id])}</span>` : '';
      return `<button class="pick ${selected === id ? 'on' : ''}" data-act="${act}" data-target="${id}" ${disabled ? 'disabled' : ''}>
        <img src="${avatar(p)}" alt=""><span>${esc(p.name)}</span>${b}</button>`;
    }).join('')}</div>`;
  }

  const timer = () => view.deadline ? `<div class="timer" data-deadline="${view.deadline}">--:--</div>` : '';
  const script = (lines) => lines && lines.length ? `<div class="script"><div class="say">Read out loud</div>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : '';
  const head = () => `<div class="row" style="justify-content:space-between"><span class="pill" style="flex:0">Party ${esc(view.code)}</span>${view.round ? `<span class="pill" style="flex:0">Round ${view.round}</span>` : ''}</div>`;

  function roleCardHTML(card, team) {
    const mates = team && team.length ? `<p class="team team-chusma">Your fellow Chusma: ${team.map((t) => esc(t.name)).join(', ')}</p>` : '';
    return `<div class="rolecard"><img src="/img/${card.img}.png" alt=""><h2>${esc(card.name)}</h2>
      <p>${esc(card.blurb)}</p>${mates}<p class="team team-${card.team}">${card.team === 'family' ? 'Team Family' : 'Team Chusma'}</p></div>`;
  }

  function eventHTML(e) {
    switch (e.k) {
      case 'scenario': return `<div class="event scenario">...${esc(e.text.replace(/^Someone/, 'someone'))}</div>`;
      case 'blamed': return `<div class="event bad">${esc(e.text)}</div>`;
      case 'verdict': return `<div class="event bad">${esc(e.text)}</div>`;
      case 'saved': case 'sheepSaved': return `<div class="event saved">${esc(e.text)}</div>`;
      case 'out': return `<div class="event"><div>${esc(e.text)}</div><div class="reveal"><img src="/img/${e.card.img}.png" alt=""><div><b>${esc(e.card.name)}</b><div class="team-${e.card.team}">${e.card.team === 'family' ? 'Team Family' : 'Team Chusma'}</div></div></div></div>`;
      case 'tia': return `<div class="event ${e.yes ? 'bad' : 'saved'}">${esc(e.text)}<div class="result">${e.yes ? '👎' : '👍'}</div></div>`;
      default: return `<div class="event">${esc(e.text)}</div>`;
    }
  }

  function abilityHTML() {
    const a = view.ability;
    if (!a) return '';
    const alive = view.players.filter((p) => p.alive && p.id !== a.pid).map((p) => p.id);
    if (me() && me().id === a.pid) {
      const prompt = a.k === 'tia' ? 'Ask about one person. Everyone will see the answer.' : 'Pick someone to take down with you.';
      return `<div class="card"><h3>${prompt}</h3>${pickList(alive, { act: 'ability' })}</div>`;
    }
    return `<div class="card center"><p>${esc(a.text)}</p><p class="muted small">Waiting for ${nm(a.pid)} to choose...</p>
      ${isNarr() ? '<button class="ghost small" data-act="skipAbility">Skip (their phone is off)</button>' : ''}</div>`;
  }

  // ---------- screens ----------
  function homeScreen() {
    const code = params.get('room') || '';
    return `<img class="logo" src="/img/logo.png" alt="La Familia">
      <p class="tagline">Find the Chusma. Save the Family.</p>
      <div class="card"><h3>Join the party</h3>
        <label for="code">Party code</label><input id="code" class="code" type="text" maxlength="4" autocomplete="off" value="${esc(code)}" placeholder="ABCD">
        <label for="name">Your name</label><input id="name" type="text" maxlength="16" autocomplete="off" value="${esc(ui.name)}" placeholder="Your name">
        <label>I'm a...</label>
        <div class="seg"><button data-local="gender" data-g="m" class="${ui.gender === 'm' ? 'on' : ''}"><img src="/img/primo.png" alt="">Primo</button>
        <button data-local="gender" data-g="f" class="${ui.gender === 'f' ? 'on' : ''}"><img src="/img/prima.png" alt="">Prima</button></div>
        <div style="height:14px"></div><button data-local="join">Join</button></div>
      <div class="card center"><p class="muted">Running the game tonight?</p><button class="ghost" data-local="host">Be the narrator</button></div>`;
  }

  function narratorLobby() {
    const url = `${location.origin}/?room=${view.code}`;
    const n = view.players.length;
    const m = view.mix;
    const mix = n >= view.minPlayers ? `${m.chusma} Chusma, Abuela, Cool Tio, Tell-All Tia, Black Sheep, ${m.primo} Primo${m.primo === 1 ? '' : 's'}/Prima${m.primo === 1 ? '' : 's'}` : `Need ${view.minPlayers - n} more to start`;
    return `<img class="logo" src="/img/logo.png" alt="La Familia">
      <div class="card center"><p class="muted">Everyone scan or go to <b>${esc(location.host)}</b> and enter</p>
        <p class="code-big">${esc(view.code)}</p>${view.qr ? `<img class="qr" src="${view.qr}" alt="QR code to join">` : ''}
        <p class="small muted">${esc(url)}</p></div>
      <h3>At the party (${n})</h3>${n ? people(view.players, { kick: true }) : '<p class="muted">No one yet...</p>'}
      <div class="card"><b>Roles:</b> ${mix}</div>
      <div class="card"><div class="row">
        <div><label>Discussion</label><select data-set="discussSecs">${[120, 180, 240, 300].map((s) => `<option value="${s}" ${view.settings.discussSecs === s ? 'selected' : ''}>${s / 60} min</option>`).join('')}</select></div>
        <div><label>Night timer</label><select data-set="nightSecs">${[45, 60, 90, 120].map((s) => `<option value="${s}" ${view.settings.nightSecs === s ? 'selected' : ''}>${s} sec</option>`).join('')}</select></div>
      </div></div>
      ${TEST ? '<button class="ghost" data-act="addBots" data-n="1">Add a test bot</button><div style="height:10px"></div>' : ''}
      <button class="green" data-act="start" ${n < view.minPlayers ? 'disabled' : ''}>Deal the cards</button>`;
  }

  function narratorScreen() {
    const v = view;
    const alive = v.players.filter((p) => p.alive);
    const agreePicker = () => ui.agree ? `<div class="card"><h3>Who did the family agree on?</h3>${pickList(alive.map((p) => p.id), { act: 'agreed' })}
      <div style="height:8px"></div><button class="ghost small" data-local="agree">Cancel</button></div>` : `<button class="ghost" data-local="agree">The family agreed on someone</button>`;
    switch (v.phase) {
      case 'lobby': return narratorLobby();
      case 'reveal': {
        const ready = v.players.filter((p) => p.ready).length;
        return `${head()}<h2>The Story</h2>${script(v.script)}
          <div class="card center"><b>${ready} of ${v.players.length}</b> have peeked at their card</div>
          <button data-act="beginNight" data-music="play">Start Saturday night</button>`;
      }
      case 'night':
        return `${head()}<h2>Saturday Night</h2>${script(v.script)}
          ${v.nightReady ? '<button data-act="wake" data-music="stop">Wake up, it\'s Sunday!</button>'
            : `<div class="card center"><p>Night actions in progress...</p>${timer()}<p class="small muted">The button appears when everyone is done.</p></div>`}
          <button class="ghost" data-local="music">${music.paused ? 'Play music' : 'Pause music'}</button>`;
      case 'sunday':
        return `${head()}<h2>The Sunday Party</h2>${script(v.script)}${v.events.map(eventHTML).join('')}${abilityHTML()}
          ${!v.ability ? '<button data-act="toVote">Time to vote</button>' : ''}`;
      case 'discuss': case 'tiebreak':
        return `${head()}<h2>${v.phase === 'tiebreak' ? 'It\'s a tie!' : 'Find the Chusma'}</h2>${script(v.script)}${timer()}
          ${agreePicker()}<div style="height:10px"></div><button data-act="openVote">Vote on phones now</button>`;
      case 'voting':
        return `${head()}<h2>Voting</h2>${script(v.script)}
          <div class="card center"><b>${v.vote.votedCount} of ${v.vote.voterCount}</b> have voted</div>
          <button data-act="closeVote" ${v.vote.votedCount ? '' : 'disabled'}>Count the votes now</button><div style="height:10px"></div>${agreePicker()}`;
      case 'verdict':
        return `${head()}<h2>Uninvited</h2>${tallyHTML()}${v.events.map(eventHTML).join('')}${abilityHTML()}
          ${!v.ability ? '<button data-act="recap">Recap</button>' : ''}`;
      case 'recap':
        return `${head()}<h2>Recap</h2>${script(v.script)}${recapHTML()}<button data-act="beginNight" data-music="play">Next Saturday night</button>`;
      case 'over':
        return overHTML() + `<button class="green" data-act="playAgain">Play again, same family</button><div style="height:10px"></div>
          <button class="ghost" data-act="toLobby">Back to the lobby</button>`;
    }
    return '';
  }

  const recapHTML = () => `<div class="card"><ul class="recap">${Object.entries(view.recap || {}).map(([k, c]) => `<li>${c} ${esc(k)}</li>`).join('')}</ul></div>`;
  function tallyHTML() {
    const t = view.vote && view.vote.tally;
    if (!t) return '';
    return `<div class="card small"><b>Votes:</b> ${Object.entries(t).sort((a, b) => b[1] - a[1]).map(([id, c]) => `${nm(id)} ${c}`).join(' · ')}</div>`;
  }
  function overHTML() {
    const w = view.winner;
    return `<div class="banner ${w}"><h2>${w === 'family' ? 'Family wins!' : 'Chusma win!'}</h2></div>
      ${view.role === 'narrator' ? script(view.script) : `<p class="center">${w === 'family' ? 'All the Chusma have been uninvited.' : 'The Chusma took over the party.'}</p>`}
      <h3>Everyone's role</h3>${people(view.players)}<div style="height:16px"></div>`;
  }

  function playerScreen() {
    const v = view, m = me();
    const outBanner = !m.alive && v.phase !== 'lobby' && v.phase !== 'over' ? '<div class="out-banner">You\'re out. Watch silently, no hints!</div>' : '';
    const alivePeople = () => people(v.players);
    switch (v.phase) {
      case 'lobby':
        return `<img class="logo" src="/img/logo.png" alt="La Familia"><div class="card center"><p>You're in, <b>${esc(m.name)}</b>!</p><p class="muted">Waiting for the narrator to deal the cards...</p></div>
          <h3>At the party (${v.players.length})</h3>${people(v.players)}
          <div style="height:16px"></div><button class="ghost small" data-local="leave">Leave</button>`;
      case 'reveal':
        return `${head()}<h2 class="center">Your card</h2>
          <div class="cardback" data-peek><img src="/img/logo.png" alt=""><div class="hint">Press and hold to peek</div></div>
          <p class="center muted small">Keep it secret! Don't let anyone see your screen.</p>
          ${m.ready ? '<div class="card center">Got it! Listen to the narrator...</div>' : '<button data-act="ready">Got it</button>'}`;
      case 'night': {
        if (!m.alive) return `${outBanner}<h2>Saturday Night</h2><p class="muted">The family is dancing... Here's who everyone really is:</p>${alivePeople()}`;
        const n = m.night;
        if (n.ready) return `<h2 class="center">Stop dancing!</h2><div class="card center"><p>It's Sunday and time for the party. Look up at the narrator!</p></div>`;
        let body = '';
        if (n.kind === 'chusma') {
          const badges = {};
          for (const [id, t] of Object.entries(n.picks)) if (id !== m.id) badges[t] = (badges[t] ? badges[t] + ', ' : '') + P(id).name;
          body = n.locked ? `<div class="card center"><p>The Chusma agreed to blame <b>${nm(n.blame)}</b>.</p><p class="muted small">Keep dancing so no one suspects you!</p></div>`
            : pickList(n.options, { act: 'nightPick', selected: n.mine, badges });
        } else if (n.kind === 'abuela' && n.mine) {
          body = `<div class="card center"><p>Is <b>${nm(n.mine)}</b> Chusma?</p><div class="result">${n.result ? '👎' : '👍'}</div>
            <p><b class="${n.result ? 'team-chusma' : 'team-family'}">${n.result ? 'Yes! They don\'t belong.' : 'No, they\'re family.'}</b></p><p class="muted small">Keep dancing. Don't give yourself away!</p></div>`;
        } else if (n.mine) {
          body = `<div class="card center"><p>${n.kind === 'tio' ? 'You vouched for' : 'Your hunch:'} <b>${nm(n.mine)}</b></p><p class="muted small">Keep dancing!</p></div>`;
        } else {
          body = pickList(n.options, { act: 'nightPick', selected: n.mine }) + (n.note ? `<p class="small muted">${esc(n.note)}</p>` : '');
        }
        return `<h2>Saturday Night</h2><div class="card"><p><b>${esc(n.prompt)}</b></p>${body}</div>`;
      }
      case 'sunday':
        return `${outBanner}${head()}<h2>The Sunday Party</h2>${v.events.map(eventHTML).join('')}${abilityHTML()}
          ${!v.ability ? '<p class="center muted">Listen to the narrator...</p>' : ''}`;
      case 'discuss': case 'tiebreak': {
        const tied = v.phase === 'tiebreak' ? `<p class="center">Tied: <b>${v.vote.candidates.map(nm).join(' and ')}</b></p>` : '';
        return `${outBanner}${head()}<h2>${v.phase === 'tiebreak' ? 'It\'s a tie!' : 'Find the Chusma'}</h2>${timer()}${tied}
          <p class="center">${m.alive ? 'Talk it out! Who is the Chusma? Agree as a family, or vote when time runs out.' : 'Listen in, but no hints!'}</p>${alivePeople()}`;
      }
      case 'voting': {
        if (!m.alive) return `${outBanner}<h2>Voting</h2><p class="center muted">${v.vote.votedCount} of ${v.vote.voterCount} have voted</p>${alivePeople()}`;
        const opts = v.vote.candidates.filter((id) => id !== m.id);
        return `${head()}<h2>Vote</h2><p><b>Who should be uninvited?</b></p>${pickList(opts, { act: 'vote', selected: v.vote.myVote })}
          <p class="center muted">${v.vote.votedCount} of ${v.vote.voterCount} have voted${v.vote.myVote ? ' · you can change your vote until everyone is in' : ''}</p>`;
      }
      case 'verdict':
        return `${outBanner}${head()}<h2>Uninvited</h2>${tallyHTML()}${v.events.map(eventHTML).join('')}${abilityHTML()}`;
      case 'recap':
        return `${outBanner}${head()}<h2>Recap</h2><p>Still at the party:</p>${recapHTML()}${alivePeople()}`;
      case 'over':
        return overHTML();
    }
    return '';
  }

  // ---------- render ----------
  function render() {
    const dark = view && view.phase === 'night';
    document.body.classList.toggle('dark', !!dark);
    ui.agree = ui.agree && view && ['discuss', 'tiebreak', 'voting'].includes(view.phase);
    let html;
    if (!view) html = homeScreen();
    else if (isNarr()) html = narratorScreen();
    else html = playerScreen();
    const showCard = view && me() && view.phase !== 'lobby' && view.phase !== 'reveal';
    if (showCard) html += '<div class="spacer"></div>';
    $('#mycard').hidden = !showCard;
    // keep typed text when re-rendering the home screen
    const code = $('#code'), name = $('#name');
    const keep = !view && code ? { code: code.value, name: name.value } : null;
    app.innerHTML = html;
    if (keep) { $('#code').value = keep.code; $('#name').value = keep.name; }
    updateDance();
    tickTimers();
    const key = view ? view.phase + view.round : 'home';
    if (key !== ui.lastKey) { ui.lastKey = key; window.scrollTo(0, 0); }
  }

  // ---------- interactions ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act],[data-local]');
    if (!el || el.disabled) return;
    wakeLock();
    if (el.dataset.local) return local(el.dataset.local, el);
    const act = el.dataset.act;
    const data = {};
    if (el.dataset.target) data.target = el.dataset.target;
    if (el.dataset.pid) data.pid = el.dataset.pid;
    if (el.dataset.n) data.n = +el.dataset.n;
    if (el.dataset.music === 'play') { try { music.currentTime = 0; music.volume = 1; music.play().catch(() => {}); } catch {} }
    if (el.dataset.music === 'stop') fadeOut();
    if (act === 'agreed') ui.agree = false;
    if (act === 'kick' && !confirmKick(el)) return;
    send(act, data);
  });

  function confirmKick(el) {
    if (el.dataset.sure) return true;
    el.dataset.sure = '1'; el.textContent = 'remove?';
    setTimeout(() => { if (el.isConnected) { delete el.dataset.sure; el.textContent = '×'; } }, 2500);
    return false;
  }

  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-set]');
    if (el) send('settings', { [el.dataset.set]: +el.value });
  });

  function local(what, el) {
    if (what === 'gender') { ui.gender = el.dataset.g; store.set('lf-gender', ui.gender); render(); }
    if (what === 'join') {
      const code = $('#code').value.trim().toUpperCase(), name = $('#name').value.trim();
      if (code.length !== 4) return toast('Enter the 4-letter party code.');
      if (!name) return toast('Enter your name.');
      ui.name = name; store.set('lf-name', name);
      socket.emit('join', { code, name, gender: ui.gender });
    }
    if (what === 'host') socket.emit('create', { origin: location.origin });
    if (what === 'agree') { ui.agree = !ui.agree; render(); }
    if (what === 'music') { if (music.paused) music.play().catch(() => {}); else music.pause(); setTimeout(render, 50); }
    if (what === 'leave') { socket.emit('leave'); session = null; store.del('lf-session'); view = null; render(); }
  }

  function fadeOut() {
    const step = () => { if (music.volume > 0.08) { music.volume = Math.max(0, music.volume - 0.08); setTimeout(step, 80); } else { music.pause(); music.volume = 1; } };
    step();
  }

  // hold to peek at your card
  const peek = $('#peek');
  document.addEventListener('pointerdown', (ev) => {
    if (!ev.target.closest('[data-peek]') || !me() || !me().card) return;
    ev.preventDefault();
    peek.innerHTML = roleCardHTML(me().card, me().team);
    peek.hidden = false;
  });
  const hidePeek = () => { peek.hidden = true; peek.innerHTML = ''; };
  ['pointerup', 'pointercancel', 'blur'].forEach((e) => window.addEventListener(e, hidePeek));
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-peek]')) e.preventDefault(); });

  // timers
  function tickTimers() {
    document.querySelectorAll('.timer[data-deadline]').forEach((t) => {
      const ms = Math.max(0, +t.dataset.deadline - (Date.now() + offset));
      const s = Math.ceil(ms / 1000);
      t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      t.classList.toggle('low', s <= 15);
    });
  }
  setInterval(tickTimers, 250);

  // keep screens awake during a game
  let lock = null;
  async function wakeLock() {
    try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => (lock = null)); } } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && view) wakeLock(); });

  // ---------- dance floor (everyone taps at night, so no one's role shows) ----------
  const dance = $('#dance'), stage = $('#stage'), scoreEl = $('#score');
  let danceTimer = null, score = 0;
  const colors = ['#EE4B4B', '#F7B04A', '#6DBE4B', '#5CC6E6', '#F06EC0'];
  function spawn() {
    const d = document.createElement('div');
    const size = 56 + Math.random() * 40;
    d.className = 'dot';
    d.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * (stage.clientWidth - size)}px;top:${Math.random() * (stage.clientHeight - size)}px;background:${colors[Math.floor(Math.random() * colors.length)]}`;
    d.addEventListener('pointerdown', () => { if (d.classList.contains('hit')) return; d.classList.add('hit'); score++; scoreEl.textContent = score; if (navigator.vibrate) navigator.vibrate(15); });
    d.addEventListener('animationend', () => d.remove());
    stage.appendChild(d);
  }
  function updateDance() {
    const on = !!(view && me() && view.phase === 'night' && me().alive && me().night && !me().night.ready);
    dance.hidden = !on;
    if (on && !danceTimer) { score = 0; scoreEl.textContent = '0'; danceTimer = setInterval(spawn, 650); }
    if (!on && danceTimer) { clearInterval(danceTimer); danceTimer = null; stage.innerHTML = ''; }
  }

  render();
})();
