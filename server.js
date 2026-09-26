// La Familia server: serves the phone app and runs game rooms in memory.
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Game, GameError } = require('./game');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('/health', (_, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map(); // code -> { code, game, narratorToken, tokens: Map(token -> pid), touched }
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => {
  let c;
  do { c = Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join(''); } while (rooms.has(c));
  return c;
};
const newToken = () => crypto.randomBytes(12).toString('hex');

function broadcast(room) {
  room.touched = Date.now();
  for (const [, s] of io.of('/').sockets) {
    if (s.data.code !== room.code) continue;
    const view = room.game.view(s.data.who);
    view.code = room.code;
    view.role = s.data.who === 'narrator' ? 'narrator' : 'player';
    if (view.role === 'narrator') view.qr = room.qr;
    s.emit('state', view);
  }
}

io.on('connection', (socket) => {
  const err = (msg) => socket.emit('err', msg);
  const attach = (room, who, token) => {
    socket.data.code = room.code; socket.data.who = who;
    socket.join(room.code);
    socket.emit('joined', { code: room.code, token, who });
    broadcast(room);
  };

  socket.on('create', async ({ origin } = {}) => {
    const code = newCode();
    const game = new Game();
    if (process.env.FAST) Object.assign(game.settings, { minNightSecs: 2, extraNightSecs: 1, botDelayMs: 300 });
    const room = { code, game, narratorToken: newToken(), tokens: new Map(), touched: Date.now() };
    const base = typeof origin === 'string' && /^https?:\/\//.test(origin) ? origin : '';
    try { room.qr = await QRCode.toDataURL(`${base}/?room=${code}`, { margin: 1, width: 360 }); } catch { room.qr = null; }
    rooms.set(code, room);
    attach(room, 'narrator', room.narratorToken);
  });

  socket.on('join', ({ code, name, gender } = {}) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return err('We couldn\'t find that party. Check the code.');
    try {
      const pid = room.game.addPlayer(name, gender);
      const token = newToken();
      room.tokens.set(token, pid);
      attach(room, pid, token);
    } catch (e) { err(e instanceof GameError ? e.message : 'Something went wrong.'); }
  });

  socket.on('resume', ({ code, token } = {}) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return socket.emit('gone');
    if (token === room.narratorToken) return attach(room, 'narrator', token);
    const pid = room.tokens.get(token);
    if (!pid || !room.game.get(pid)) return socket.emit('gone');
    attach(room, pid, token);
  });

  socket.on('act', ({ type, data } = {}) => {
    const room = rooms.get(socket.data.code);
    if (!room) return err('You are not in a party.');
    try {
      room.game.act(socket.data.who, type, data || {});
      if (type === 'kick') for (const [t, pid] of room.tokens) if (pid === data.pid) room.tokens.delete(t);
      broadcast(room);
    } catch (e) {
      if (e instanceof GameError) err(e.message); else { console.error(e); err('Something went wrong.'); }
    }
  });

  socket.on('leave', () => { socket.leave(socket.data.code); socket.data.code = null; });
});

// Timers, bots, and cleanup of rooms idle for 8 hours.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.touched > 8 * 3600e3) { rooms.delete(room.code); continue; }
    try { if (room.game.tick()) broadcast(room); } catch (e) { console.error(e); }
  }
}, 500);

server.listen(PORT, () => console.log(`La Familia is running on http://localhost:${PORT}`));
