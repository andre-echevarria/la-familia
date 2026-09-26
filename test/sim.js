// Plays thousands of all-bot games with a fake clock and checks the rules hold.
const assert = require('assert');
const { Game, roleMix } = require('../game');

// role mix matches the original cards for 7, 8, 9
assert.deepStrictEqual(roleMix(7), { chusma: 2, abuela: 1, tio: 1, tia: 1, sheep: 1, primo: 1 });
assert.deepStrictEqual(roleMix(8), { chusma: 2, abuela: 1, tio: 1, tia: 1, sheep: 1, primo: 2 });
assert.deepStrictEqual(roleMix(9), { chusma: 3, abuela: 1, tio: 1, tia: 1, sheep: 1, primo: 2 });
assert.strictEqual(roleMix(13).chusma, 4);

let seed = 42;
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const stats = { family: 0, chusma: 0, saves: 0, sheepSaves: 0, ties: 0, tia: 0, rounds: 0 };
for (let g = 0; g < 3000; g++) {
  let t = 0;
  const game = new Game({ rng, now: () => t });
  const n = 7 + (g % 10);
  game.act('narrator', 'addBots', { n: 10 });
  while (game.players.length < n) game.addPlayer('Human' + game.players.length, 'f', true);
  game.players = game.players.slice(0, n);
  game.act('narrator', 'start');
  assert.strictEqual(game.phase, 'reveal');
  assert.strictEqual(game.players.filter(p => p.role === 'chusma').length, Math.ceil(n / 4));

  let lastTio = null, guard = 0;
  const step = () => { t += 1000; game.tick(); };
  game.act('narrator', 'beginNight');
  while (game.phase !== 'over') {
    assert(++guard < 5000, 'game did not finish');
    switch (game.phase) {
      case 'night':
        if (game.night.ready) {
          const nt = game.night.tio;
          if (nt) assert.notStrictEqual(nt, lastTio, 'Tio repeated a target');
          lastTio = nt;
          const aliveBefore = game.alive().length;
          game.act('narrator', 'wake');
          if (game.night.blame === game.night.tio) { stats.saves++; assert.strictEqual(game.alive().length, aliveBefore); }
          else assert(!game.get(game.night.blame).alive);
          assert.notStrictEqual(game.get(game.night.blame).role, 'chusma');
        } else step();
        break;
      case 'sunday': case 'verdict':
        if (game.queue.length) { step(); break; }
        for (const e of game.events) {
          if (e.k === 'tia') { stats.tia++; assert.strictEqual(e.yes, game.get(e.target).role === 'chusma'); }
          if (e.k === 'sheepSaved') { stats.sheepSaves++; assert.strictEqual(e.target, game.protected); assert(game.get(e.target).alive); }
        }
        game.act('narrator', game.phase === 'sunday' ? 'toVote' : 'recap');
        break;
      case 'discuss': step(); break; // let the timer run out
      case 'tiebreak': stats.ties++; step(); break;
      case 'voting': step(); break;
      case 'recap': stats.rounds++; game.act('narrator', 'beginNight'); break;
      default: throw new Error('unexpected phase ' + game.phase);
    }
  }
  const c = game.alive().filter(p => p.role === 'chusma').length;
  const f = game.alive().length - c;
  if (game.winner === 'family') assert.strictEqual(c, 0); else assert(c >= f && c > 0);
  stats[game.winner]++;
}

// Direct rule checks
{
  let t = 0;
  const game = new Game({ rng, now: () => t });
  for (let i = 0; i < 7; i++) game.addPlayer('P' + i, 'm');
  game.act('narrator', 'start');
  const by = r => game.players.filter(p => p.role === r);
  const [c1, c2] = by('chusma'); const tio = by('tio')[0]; const abuela = by('abuela')[0];
  const victim = by('primo')[0];
  game.act('narrator', 'beginNight');
  game.act(c1.id, 'nightPick', { target: victim.id });
  assert(!game.night.locked);
  game.act(c2.id, 'nightPick', { target: victim.id });
  assert(game.night.locked);
  assert.throws(() => game.act(c1.id, 'nightPick', { target: c2.id }));
  game.act(abuela.id, 'nightPick', { target: c1.id });
  assert.strictEqual(game.night.abuelaResult, true);
  game.act(tio.id, 'nightPick', { target: tio.id });
  t += 31000; game.tick();
  assert(game.night.ready);
  game.act('narrator', 'wake');
  assert(victim.alive === false);
  game.act('narrator', 'toVote');
  // Tio self-save used: next night he can't pick himself or repeat
  game.act('narrator', 'agreed', { target: by('tia')[0].id });
  assert.strictEqual(game.queue[0].k, 'tia');
  game.act(by('tia')[0].id, 'ability', { target: c1.id });
  assert(game.events.find(e => e.k === 'tia').yes);
  game.act('narrator', 'recap');
  game.act('narrator', 'beginNight');
  assert.throws(() => game.act(tio.id, 'nightPick', { target: tio.id }), /same person|yourself/);
  // Chusma disagree -> majority/random at the deadline
  game.act(c1.id, 'nightPick', { target: abuela.id });
  game.act(c2.id, 'nightPick', { target: by('sheep')[0].id });
  t += 61000; game.tick();
  assert(game.night.ready && [abuela.id, by('sheep')[0].id].includes(game.night.blame));
}

// Tie -> tiebreak -> revote among tied only
{
  let t = 0;
  const game = new Game({ rng, now: () => t });
  for (let i = 0; i < 8; i++) game.addPlayer('P' + i, 'm');
  game.act('narrator', 'start');
  const tio = game.players.find(p => p.role === 'tio');
  const target = game.players.find(p => p.role === 'primo');
  game.act('narrator', 'beginNight');
  game.night.locked = true; game.night.blame = target.id; game.night.tio = target.id; game.night.ready = true;
  game.act('narrator', 'wake');
  assert(target.alive, 'Tio save should protect');
  game.act('narrator', 'toVote');
  game.act('narrator', 'openVote');
  const alive = game.alive();
  const [a, b] = alive;
  alive.forEach((p, i) => game.act(p.id, 'vote', { target: p.id === a.id ? b.id : p.id === b.id ? a.id : (i % 2 ? a.id : b.id) }));
  assert.strictEqual(game.phase, 'tiebreak');
  assert.deepStrictEqual(game.vote.candidates.sort(), [a.id, b.id].sort());
  t += 61000; game.tick();
  assert.strictEqual(game.phase, 'voting');
  assert.throws(() => game.act(a.id, 'vote', { target: alive[3].id }));
}

console.log('All rule checks passed.', stats);

// An eliminated Tia must not see everyone's roles while she chooses
{
  let t = 0;
  const game = new Game({ rng, now: () => t });
  for (let i = 0; i < 7; i++) game.addPlayer('P' + i, 'm');
  game.act('narrator', 'start');
  const tia = game.players.find(p => p.role === 'tia');
  game.act('narrator', 'beginNight');
  Object.assign(game.night, { locked: true, blame: tia.id, ready: true });
  game.act('narrator', 'wake');
  let v = game.view(tia.id);
  assert(!v.allRoles && v.players.filter(p => p.card).length === 1, 'Tia saw roles before asking');
  game.act(tia.id, 'ability', { target: game.players.find(p => p.id !== tia.id).id });
  v = game.view(tia.id);
  assert(v.allRoles, 'Tia should see roles after asking');
  console.log('Role-leak check passed.');
}
