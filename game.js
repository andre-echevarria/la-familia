// La Familia game engine. Pure game logic: no networking.
// Time and randomness are injectable so the rules can be tested.

const { ROLE_INFO, SCENARIOS, SCRIPT } = require('./content');

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 20;

// Matches the "Assigning the roles" card:
// 5 = 1 Chusma, Tio, Tia, Abuela, 1 Primo. 6 = 1 Chusma, 2 Primos.
// 7 adds the Black Sheep. 8 = 2 Primos. 9 = 3 Chusma, 2 Primos.
// 10+: each even player count adds a Primo, each odd one adds a Chusma.
function roleMix(n) {
  const base = { 5: [1, 1, 0], 6: [1, 2, 0], 7: [2, 1, 1], 8: [2, 2, 1], 9: [3, 2, 1] };
  let chusma, primo, sheep;
  if (n <= 9) [chusma, primo, sheep] = base[Math.max(5, n)];
  else { chusma = 3 + Math.floor((n - 9) / 2); primo = 2 + Math.ceil((n - 9) / 2); sheep = 1; }
  return { chusma, abuela: 1, tio: 1, tia: 1, sheep, primo };
}

function mixText(m) {
  const parts = [`${m.chusma} Chusma`, 'Abuela', 'Cool Tio', 'Tell-All Tia'];
  if (m.sheep) parts.push('Black Sheep');
  parts.push(`${m.primo} Primo${m.primo === 1 ? '' : 's'}/Prima${m.primo === 1 ? '' : 's'}`);
  return parts.join(', ');
}

class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

class Game {
  constructor({ rng = Math.random, now = Date.now } = {}) {
    this.rng = rng;
    this.now = now;
    this.players = [];
    this.nextId = 1;
    this.settings = { nightSecs: 60, discussSecs: 180, tieSecs: 60, minNightSecs: 20, extraNightSecs: 10, botDelayMs: 1500 };
    this.reset();
  }

  reset() {
    this.phase = 'lobby';
    this.round = 0;
    this.deadline = null;
    this.phaseStart = this.now();
    this.night = null;
    this.tio = { selfUsed: false, last: null };
    this.protected = null;
    this.events = [];
    this.queue = [];
    this.vote = null;
    this.lastTally = null;
    this.usedScenarios = [];
    this.winner = null;
    this.history = [];
    this.version = (this.version || 0) + 1;
  }

  // ---------- helpers ----------
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  get(id) { return this.players.find(p => p.id === id); }
  alive() { return this.players.filter(p => p.alive); }
  aliveRole(role) { return this.players.find(p => p.alive && p.role === role); }
  name(id) { const p = this.get(id); return p ? p.name : '?'; }
  setPhase(phase, deadlineSecs = null) {
    this.phase = phase;
    this.phaseStart = this.now();
    this.deadline = deadlineSecs == null ? null : this.now() + deadlineSecs * 1000;
  }
  requireAliveTarget(target, { not = [] } = {}) {
    const t = this.get(target);
    if (!t || !t.alive) fail('Pick someone who is still in the game.');
    if (not.includes(target)) fail('You can\'t pick that person.');
    return t;
  }

  // ---------- lobby ----------
  addPlayer(name, gender = 'm', isBot = false) {
    if (this.phase !== 'lobby') fail('The game already started.');
    name = String(name || '').trim().slice(0, 16);
    if (!name) fail('Please enter a name.');
    if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) fail('Someone already has that name.');
    if (this.players.length >= MAX_PLAYERS) fail('The party is full.');
    const p = { id: 'p' + this.nextId++, name, gender: gender === 'f' ? 'f' : 'm', isBot, role: null, alive: true, ready: false };
    this.players.push(p);
    this.version++;
    return p.id;
  }

  deal() {
    const n = this.players.length;
    if (n < MIN_PLAYERS) fail(`You need at least ${MIN_PLAYERS} players (you have ${n}).`);
    const mix = roleMix(n);
    const roles = [];
    for (const [r, c] of Object.entries(mix)) for (let i = 0; i < c; i++) roles.push(r);
    const shuffled = this.shuffle(roles);
    this.players.forEach((p, i) => { p.role = shuffled[i]; p.alive = true; p.ready = p.isBot; p.cause = null; p.outRound = null; });
    this.reset();
    this.setPhase('reveal');
  }

  // ---------- night ----------
  startNight() {
    this.round++;
    this.events = [];
    this.queue = [];
    this.protected = null;
    const s = this.settings;
    this.night = {
      chusma: {}, blame: null, locked: false,
      abuela: null, abuelaResult: null, tio: null, hunch: {},
      ready: false,
      minEnd: this.now() + (s.minNightSecs + this.rng() * s.extraNightSecs) * 1000,
    };
    this.setPhase('night', s.nightSecs);
  }

  nightPick(pid, target) {
    if (this.phase !== 'night' || this.night.ready) fail('The night is over.');
    const p = this.get(pid);
    if (!p || !p.alive) fail('You are out of the game.');
    const n = this.night;
    if (p.role === 'chusma') {
      if (n.locked) fail('The Chusma already agreed.');
      const t = this.requireAliveTarget(target);
      if (t.role === 'chusma') fail('You can\'t blame another Chusma.');
      n.chusma[pid] = target;
      const picks = this.alive().filter(x => x.role === 'chusma').map(x => n.chusma[x.id]);
      if (picks.every(v => v && v === picks[0])) { n.locked = true; n.blame = picks[0]; }
    } else if (p.role === 'abuela') {
      if (n.abuela) fail('You already asked tonight.');
      const t = this.requireAliveTarget(target, { not: [pid] });
      n.abuela = target;
      n.abuelaResult = t.role === 'chusma';
    } else if (p.role === 'tio') {
      if (n.tio) fail('You already vouched for someone tonight.');
      this.requireAliveTarget(target);
      if (target === this.tio.last) fail('You can\'t vouch for the same person two rounds in a row.');
      if (target === pid && this.tio.selfUsed) fail('You already vouched for yourself once.');
      n.tio = target;
    } else {
      this.requireAliveTarget(target, { not: [pid] });
      n.hunch[pid] = target;
    }
    this.version++;
  }

  nightActionsDone() {
    const n = this.night;
    return n.locked && (!this.aliveRole('abuela') || n.abuela) && (!this.aliveRole('tio') || n.tio);
  }

  finishNight() {
    const n = this.night;
    if (!n.locked) {
      // Not unanimous: take the majority choice, break ties at random.
      const counts = {};
      for (const x of this.alive().filter(x => x.role === 'chusma')) {
        const t = n.chusma[x.id];
        if (t) counts[t] = (counts[t] || 0) + 1;
      }
      const max = Math.max(0, ...Object.values(counts));
      const top = Object.keys(counts).filter(k => counts[k] === max);
      n.blame = top.length ? this.pick(top) : this.pick(this.alive().filter(x => x.role !== 'chusma')).id;
      n.locked = true;
    }
    n.ready = true;
    this.deadline = null;
    this.version++;
  }

  wake() {
    if (this.phase !== 'night' || !this.night.ready) fail('The night isn\'t over yet.');
    const n = this.night;
    const tio = this.players.find(p => p.role === 'tio');
    this.protected = n.tio;
    this.tio.last = n.tio;
    if (tio && n.tio === tio.id) this.tio.selfUsed = true;

    let pool = SCENARIOS.map((_, i) => i).filter(i => !this.usedScenarios.includes(i));
    if (!pool.length) { this.usedScenarios = []; pool = SCENARIOS.map((_, i) => i); }
    const sc = this.pick(pool);
    this.usedScenarios.push(sc);

    this.setPhase('sunday');
    this.events = [{ k: 'scenario', text: SCENARIOS[sc] }, { k: 'blamed', pid: n.blame }];
    if (n.blame === this.protected) this.events.push({ k: 'saved', pid: n.blame });
    else this.eliminate(n.blame, 'blamed');
    this.history.push({ round: this.round, blame: n.blame, saved: n.blame === this.protected, abuela: n.abuela, tio: n.tio });
    this.checkWin();
  }

  // ---------- eliminations & abilities ----------
  eliminate(pid, cause) {
    const p = this.get(pid);
    if (!p || !p.alive) return;
    p.alive = false; p.cause = cause; p.outRound = this.round;
    this.events.push({ k: 'out', pid, role: p.role, cause });
    if (p.role === 'tia' || p.role === 'sheep') this.queue.push({ k: p.role, pid });
    this.version++;
  }

  abilityPick(pid, target) {
    const q = this.queue[0];
    if (!q || q.pid !== pid) fail('It\'s not your turn to use an ability.');
    this.requireAliveTarget(target, { not: [pid] });
    this.queue.shift();
    if (q.k === 'tia') {
      this.events.push({ k: 'tia', pid, target, yes: this.get(target).role === 'chusma' });
    } else if (target === this.protected) {
      this.events.push({ k: 'sheepSaved', pid, target });
    } else {
      this.events.push({ k: 'sheepHit', pid, target });
      this.eliminate(target, 'sheep');
    }
    this.version++;
    this.checkWin();
  }

  skipAbility() {
    const q = this.queue.shift();
    if (!q) fail('No ability to skip.');
    this.events.push({ k: 'skip', pid: q.pid });
    this.version++;
    this.checkWin();
  }

  checkWin() {
    if (this.queue.length || this.winner) return;
    const c = this.alive().filter(p => p.role === 'chusma').length;
    const f = this.alive().length - c;
    if (c === 0) this.winner = 'family';
    else if (c >= f) this.winner = 'chusma';
    if (this.winner) { this.setPhase('over'); this.version++; }
  }

  // ---------- Sunday vote ----------
  startDiscussion() {
    if (this.phase !== 'sunday' || this.queue.length) fail('Finish the Sunday party first.');
    this.vote = { candidates: null, votes: {}, ties: 0 };
    this.lastTally = null;
    this.setPhase('discuss', this.settings.discussSecs);
  }

  openVote() {
    if (!['discuss', 'tiebreak'].includes(this.phase)) fail('Voting can\'t open now.');
    const cands = this.phase === 'tiebreak' ? this.vote.candidates : this.alive().map(p => p.id);
    this.vote.candidates = cands;
    this.vote.votes = {};
    this.setPhase('voting');
  }

  eligibleVoters() {
    return this.alive().filter(p => this.vote.candidates.some(c => c !== p.id));
  }

  castVote(pid, target) {
    if (this.phase !== 'voting') fail('Voting is not open.');
    const p = this.get(pid);
    if (!p || !p.alive) fail('You are out of the game.');
    if (!this.vote.candidates.includes(target) || target === pid) fail('You can\'t vote for that person.');
    this.vote.votes[pid] = target;
    this.version++;
    if (this.eligibleVoters().every(v => this.vote.votes[v.id])) this.tally();
  }

  tally() {
    if (this.phase !== 'voting') fail('Voting is not open.');
    const counts = {};
    for (const t of Object.values(this.vote.votes)) counts[t] = (counts[t] || 0) + 1;
    if (!Object.keys(counts).length) fail('Nobody has voted yet.');
    this.lastTally = counts;
    const max = Math.max(...Object.values(counts));
    const top = Object.keys(counts).filter(k => counts[k] === max);
    if (top.length === 1) return this.uninvite(top[0]);
    this.vote.candidates = top;
    this.vote.ties++;
    this.setPhase('tiebreak', this.settings.tieSecs);
    this.version++;
  }

  uninvite(target) {
    if (!['discuss', 'tiebreak', 'voting'].includes(this.phase)) fail('You can\'t uninvite anyone right now.');
    this.requireAliveTarget(target);
    this.setPhase('verdict');
    this.events = [{ k: 'verdict', pid: target }];
    this.eliminate(target, 'vote');
    this.version++;
    this.checkWin();
  }

  toRecap() {
    if (this.phase !== 'verdict' || this.queue.length) fail('Finish the verdict first.');
    this.setPhase('recap');
    this.version++;
  }

  // ---------- routing ----------
  act(actor, type, data = {}) {
    const narr = actor === 'narrator';
    const needNarr = () => { if (!narr) fail('Only the narrator can do that.'); };
    switch (type) {
      // narrator
      case 'start': needNarr(); if (this.phase !== 'lobby') fail('Already started.'); this.deal(); break;
      case 'kick': needNarr(); if (this.phase !== 'lobby') fail('Only in the lobby.'); this.players = this.players.filter(p => p.id !== data.pid); break;
      case 'addBots': {
        needNarr();
        const names = ['Tito', 'Lulu', 'Pepe', 'Nena', 'Chuy', 'Beba', 'Nico', 'Mimi', 'Tato', 'Coco'];
        let added = 0;
        for (const nm of names) {
          if (added >= (data.n || 1) || this.players.length >= MAX_PLAYERS) break;
          if (this.players.some(p => p.name === nm + ' (bot)')) continue;
          this.addPlayer(nm + ' (bot)', this.rng() < 0.5 ? 'm' : 'f', true); added++;
        }
        break;
      }
      case 'settings': needNarr(); if (this.phase !== 'lobby') fail('Only in the lobby.');
        for (const k of ['nightSecs', 'discussSecs']) if (data[k]) this.settings[k] = Math.max(15, Math.min(600, +data[k]));
        break;
      case 'beginNight': needNarr(); if (!['reveal', 'recap'].includes(this.phase)) fail('Not now.'); this.startNight(); break;
      case 'wake': needNarr(); this.wake(); break;
      case 'toVote': needNarr(); if (this.winner) fail('The game is over.'); this.startDiscussion(); break;
      case 'openVote': needNarr(); this.openVote(); break;
      case 'closeVote': needNarr(); this.tally(); break;
      case 'agreed': needNarr(); this.uninvite(data.target); break;
      case 'recap': needNarr(); if (this.winner) fail('The game is over.'); this.toRecap(); break;
      case 'skipAbility': needNarr(); this.skipAbility(); break;
      case 'playAgain': needNarr(); if (this.phase !== 'over') fail('The game isn\'t over.'); this.deal(); break;
      case 'toLobby': needNarr(); this.reset(); this.players = this.players.filter(p => !p.isBot); this.players.forEach(p => { p.role = null; p.alive = true; }); break;
      // players
      case 'ready': { const p = this.get(actor); if (p && this.phase === 'reveal') p.ready = true; break; }
      case 'nightPick': this.nightPick(actor, data.target); break;
      case 'ability': this.abilityPick(actor, data.target); break;
      case 'vote': this.castVote(actor, data.target); break;
      default: fail('Unknown action.');
    }
    this.version++;
  }

  // Called a couple of times a second by the server (or by tests).
  tick() {
    const now = this.now();
    const before = this.version;
    if (this.phase === 'night' && !this.night.ready) {
      this.botsNight(now);
      if ((this.nightActionsDone() && now >= this.night.minEnd) || now >= this.deadline) this.finishNight();
    }
    if ((this.phase === 'discuss' || this.phase === 'tiebreak') && now >= this.deadline) this.openVote();
    if (this.phase === 'voting') this.botsVote(now);
    if ((this.phase === 'sunday' || this.phase === 'verdict') && this.queue.length) {
      const q = this.queue[0]; const p = this.get(q.pid);
      if (p.isBot && now - this.phaseStart > this.settings.botDelayMs) {
        this.abilityPick(p.id, this.pick(this.alive().filter(x => x.id !== p.id)).id);
      }
    }
    return this.version !== before;
  }

  botsNight(now) {
    if (now - this.phaseStart < this.settings.botDelayMs) return;
    const n = this.night;
    for (const b of this.alive().filter(p => p.isBot)) {
      try {
        if (b.role === 'chusma' && !n.locked && !n.chusma[b.id]) {
          const human = Object.entries(n.chusma).find(([id]) => !this.get(id).isBot);
          const t = human ? human[1] : this.pick(this.alive().filter(x => x.role !== 'chusma')).id;
          // Bots follow whatever another Chusma picked first so they agree.
          const first = Object.values(n.chusma)[0];
          this.nightPick(b.id, first || t);
        } else if (b.role === 'abuela' && !n.abuela) {
          this.nightPick(b.id, this.pick(this.alive().filter(x => x.id !== b.id)).id);
        } else if (b.role === 'tio' && !n.tio) {
          const opts = this.alive().filter(x => x.id !== this.tio.last && (x.id !== b.id || !this.tio.selfUsed));
          this.nightPick(b.id, this.pick(opts).id);
        }
      } catch (e) { /* bot picked something invalid; it'll retry next tick */ }
    }
  }

  botsVote(now) {
    if (now - this.phaseStart < this.settings.botDelayMs) return;
    for (const b of this.alive().filter(p => p.isBot && !this.vote.votes[p.id])) {
      const opts = this.vote.candidates.filter(c => c !== b.id);
      if (opts.length) { this.castVote(b.id, this.pick(opts)); if (this.phase !== 'voting') return; }
    }
  }

  // ---------- views ----------
  cardFor(p) {
    if (!p.role) return null;
    const key = p.role === 'primo' && p.gender === 'f' ? 'prima' : p.role;
    const img = p.role === 'chusma' ? (p.gender === 'f' ? 'chusma-f' : 'chusma-m') : key;
    return { role: p.role, name: ROLE_INFO[key].name, team: ROLE_INFO[key].team, blurb: ROLE_INFO[key].blurb, img };
  }

  describeEvent(e) {
    const n = (id) => this.name(id);
    switch (e.k) {
      case 'scenario': return { k: e.k, text: e.text };
      case 'blamed': return { k: e.k, pid: e.pid, text: SCRIPT.blamed(n(e.pid)) };
      case 'saved': return { k: e.k, pid: e.pid, text: SCRIPT.saved(n(e.pid)) };
      case 'verdict': return { k: e.k, pid: e.pid, text: SCRIPT.verdict(n(e.pid)) };
      case 'out': {
        const card = this.cardFor(this.get(e.pid));
        const text = e.cause === 'blamed' ? `${SCRIPT.outBlamed(n(e.pid))} ${n(e.pid)} was... ${articled(card.name)}!` : `${n(e.pid)} was... ${articled(card.name)}!`;
        return { k: e.k, pid: e.pid, card, text };
      }
      case 'tia': return { k: e.k, pid: e.pid, target: e.target, yes: e.yes, text: SCRIPT.tiaResult(n(e.target), e.yes) };
      case 'sheepHit': return { k: e.k, pid: e.pid, target: e.target, text: SCRIPT.sheepHit(n(e.target)) };
      case 'sheepSaved': return { k: e.k, pid: e.pid, target: e.target, text: SCRIPT.sheepSaved(n(e.target)) };
      case 'skip': return { k: e.k, pid: e.pid, text: `${n(e.pid)} didn't use their ability.` };
      default: return { k: e.k, text: '' };
    }
  }

  recapCounts() {
    const c = {};
    for (const p of this.alive()) { const nm = this.cardFor(p).name.replace(/^Prim[oa]$/, 'Primos/Primas'); c[nm] = (c[nm] || 0) + 1; }
    return c;
  }

  // viewer: 'narrator' or a player id
  view(viewer) {
    const me = viewer === 'narrator' ? null : this.get(viewer);
    const over = this.phase === 'over';
    // Eliminated players watch with every role visible, except while they still owe an ability pick
    const seeAll = over || (me && !me.alive && this.phase !== 'lobby' && !this.queue.some(q => q.pid === me.id));
    const v = {
      phase: this.phase, round: this.round, deadline: this.deadline, serverNow: this.now(),
      settings: { nightSecs: this.settings.nightSecs, discussSecs: this.settings.discussSecs },
      mix: roleMix(Math.max(this.players.length, MIN_PLAYERS)), mixText: mixText(roleMix(Math.max(this.players.length, MIN_PLAYERS))), minPlayers: MIN_PLAYERS,
      players: this.players.map(p => ({
        id: p.id, name: p.name, gender: p.gender, alive: p.alive, isBot: p.isBot, ready: p.ready,
        card: (!p.alive || seeAll) && p.role ? this.cardFor(p) : null,
      })),
      events: this.events.map(e => this.describeEvent(e)),
      ability: this.queue[0] ? { k: this.queue[0].k, pid: this.queue[0].pid, text: this.queue[0].k === 'tia' ? SCRIPT.tiaAsk(this.name(this.queue[0].pid)) : SCRIPT.sheepAsk(this.name(this.queue[0].pid)) } : null,
      winner: this.winner,
      recap: this.phase === 'recap' || over ? this.recapCounts() : null,
    };
    if (['discuss', 'tiebreak', 'voting', 'verdict'].includes(this.phase) && this.vote) {
      v.vote = {
        candidates: this.vote.candidates, ties: this.vote.ties,
        votedCount: Object.keys(this.vote.votes).length,
        voterCount: this.vote.candidates ? this.eligibleVoters().length : this.alive().length,
        tally: this.lastTally,
        myVote: me ? this.vote.votes[me.id] || null : null,
      };
    }
    if (this.phase === 'night') v.nightReady = this.night.ready;

    if (viewer === 'narrator') v.script = this.narratorScript();
    if (me) {
      v.me = { id: me.id, name: me.name, alive: me.alive, ready: me.ready, card: this.cardFor(me) };
      if (me.role === 'chusma' && this.phase !== 'lobby') {
        v.me.team = this.players.filter(p => p.role === 'chusma' && p.id !== me.id).map(p => ({ id: p.id, name: p.name, alive: p.alive }));
      }
      if (this.phase === 'night' && me.alive) v.me.night = this.nightViewFor(me);
      if (seeAll) v.allRoles = true;
    }
    return v;
  }

  nightViewFor(me) {
    const n = this.night;
    const others = this.alive().filter(p => p.id !== me.id);
    const base = { ready: n.ready };
    switch (me.role) {
      case 'chusma': {
        const opts = this.alive().filter(p => p.role !== 'chusma').map(p => p.id);
        const picks = {};
        for (const [id, t] of Object.entries(n.chusma)) picks[id] = t;
        return { ...base, kind: 'chusma', prompt: 'Pick who to blame tonight. All Chusma must agree.', options: opts, mine: n.chusma[me.id] || null, picks, locked: n.locked, blame: n.blame };
      }
      case 'abuela':
        return { ...base, kind: 'abuela', prompt: 'Ask about one person: are they Chusma?', options: others.map(p => p.id), mine: n.abuela, result: n.abuela ? n.abuelaResult : null };
      case 'tio': {
        const opts = this.alive().filter(p => p.id !== this.tio.last && (p.id !== me.id || !this.tio.selfUsed)).map(p => p.id);
        return { ...base, kind: 'tio', prompt: 'Vouch for one person tonight. If they get blamed, they\'re safe.', options: opts, mine: n.tio, note: this.tio.selfUsed ? 'You already used your one self-save.' : 'You can vouch for yourself once per game.' };
      }
      default:
        return { ...base, kind: 'hunch', prompt: 'Your secret hunch: who\'s acting shady tonight?', options: others.map(p => p.id), mine: n.hunch[me.id] || null };
    }
  }

  narratorScript() {
    const s = SCRIPT;
    switch (this.phase) {
      case 'lobby': return [];
      case 'reveal': {
        const inGame = new Set(this.players.map(p => p.role));
        return [...s.intro, 'Let me explain the roles.', ...Object.entries(s.roles).filter(([r]) => inGame.has(r)).map(([, line]) => line)];
      }
      case 'night': return this.night.ready ? [s.wake] : s.night;
      case 'sunday': return [s.sundayOpen];
      case 'discuss': return [s.voteOpen(this.settings.discussSecs)];
      case 'tiebreak': return [s.tieOpen(this.vote.candidates.map(id => this.name(id)).join(' and '), this.settings.tieSecs)];
      case 'voting': return ['Time is up! Everyone vote on your phone.'];
      case 'verdict': return [];
      case 'recap': return [s.recap];
      case 'over': return [this.winner === 'family' ? s.familyWins : s.chusmaWins];
      default: return [];
    }
  }
}

function articled(name) {
  return (/^(Primo|Prima|Chusma)$/.test(name) ? 'a ' : 'the ') + name;
}

module.exports = { Game, GameError, roleMix, MIN_PLAYERS };
