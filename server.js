/**
 * ECO RIDER — Servidor Multiplayer
 * Node.js puro, sem dependências externas.
 * WebSocket implementado manualmente seguindo RFC 6455.
 *
 * Como rodar:
 *   node server.js
 *
 * Ambos os celulares devem estar na mesma rede Wi-Fi.
 * Acesse: http://IP_DO_COMPUTADOR:3000
 */

const http   = require('http');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const PORT = process.env.PORT || 3000;

// ─── Pegar IP local para exibir no console ────────────────────────────
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

// ─── MIME types ───────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

// ─── WebSocket RFC 6455 ───────────────────────────────────────────────
function wsHandshake(key) {
  return crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

function wsEncode(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function wsDecode(buf) {
  const messages = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 2 > buf.length) break;
    const b0 = buf[offset], b1 = buf[offset + 1];
    const opcode  = b0 & 0x0f;
    const masked  = !!(b1 & 0x80);
    let   plen    = b1 & 0x7f;
    let   hlen    = 2;
    if (plen === 126) { if (offset + 4 > buf.length) break; plen = buf.readUInt16BE(offset + 2); hlen = 4; }
    else if (plen === 127) { if (offset + 10 > buf.length) break; plen = Number(buf.readBigUInt64BE(offset + 2)); hlen = 10; }
    const mstart = offset + hlen;
    const dstart = mstart + (masked ? 4 : 0);
    const dend   = dstart + plen;
    if (dend > buf.length) break;
    if (opcode === 0x8) { messages.push({ type: 'close' }); break; }
    if (opcode === 0x9) { messages.push({ type: 'ping' }); offset = dend; continue; }
    if (opcode === 0x1 || opcode === 0x2) {
      let data = buf.slice(dstart, dend);
      if (masked) {
        const mask = buf.slice(mstart, mstart + 4);
        data = Buffer.from(data.map((b, i) => b ^ mask[i % 4]));
      }
      messages.push({ type: 'text', data: data.toString('utf8') });
    }
    offset = dend;
  }
  return messages;
}

// ─── Gerenciamento de salas ───────────────────────────────────────────
const rooms   = new Map(); // roomId → { boy, girl, level, scores }
const connMap = new Map(); // socket → { roomId, role }

function getRoom(id) {
  if (!rooms.has(id)) {
    rooms.set(id, {
      id, boy: null, girl: null,
      level: 1, scores: { boy: 0, girl: 0 },
      state: 'waiting'
    });
  }
  return rooms.get(id);
}

function sendTo(sock, obj) {
  if (!sock || sock.destroyed) return;
  try { sock.write(wsEncode(JSON.stringify(obj))); } catch (_) {}
}

function broadcast(room, obj) {
  if (room.boy)  sendTo(room.boy,  obj);
  if (room.girl) sendTo(room.girl, obj);
}

function roomInfo(room) {
  const count = (room.boy ? 1 : 0) + (room.girl ? 1 : 0);
  return { connected: count, roomId: room.id };
}

// ─── Lógica de mensagens ──────────────────────────────────────────────
function handleMessage(sock, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const meta = connMap.get(sock);

  // JOIN — antes de ter meta
  if (msg.type === 'join') {
    const roomId = (msg.roomId || 'ECO01').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'ECO01';
    let role = (msg.role || 'any').toLowerCase();
    const room = getRoom(roomId);

    if (role === 'any') role = !room.boy ? 'boy' : !room.girl ? 'girl' : null;
    if (!role) { sendTo(sock, { type: 'error', msg: 'Sala cheia' }); return; }
    if (role === 'boy'  && room.boy)  { sendTo(sock, { type: 'error', msg: 'BOY já ocupado' });  return; }
    if (role === 'girl' && room.girl) { sendTo(sock, { type: 'error', msg: 'GIRL já ocupado' }); return; }

    room[role] = sock;
    connMap.set(sock, { roomId, role });

    const info = roomInfo(room);
    sendTo(sock, { type: 'assigned', role, roomId, connected: info.connected });
    broadcast(room, { type: 'room_info', ...info });

    if (info.connected === 2) {
      room.state = 'playing';
      broadcast(room, { type: 'start_game', level: room.level, scores: room.scores });
    }
    return;
  }

  if (!meta) return;
  const room = rooms.get(meta.roomId);
  if (!room) return;

  switch (msg.type) {
    case 'state': {
      // Repassa estado para o parceiro
      const peer = meta.role === 'boy' ? room.girl : room.boy;
      sendTo(peer, { type: 'peer_state', role: meta.role, data: msg.data });
      break;
    }
    case 'collect': {
      if (meta.role === 'boy')  room.scores.boy  = Math.max(room.scores.boy,  msg.score);
      else                      room.scores.girl = Math.max(room.scores.girl, msg.score);
      broadcast(room, { type: 'collected', idx: msg.idx, role: meta.role, scores: room.scores });
      break;
    }
    case 'gameover': {
      room.state = 'gameover';
      broadcast(room, { type: 'gameover' });
      break;
    }
    case 'level_complete': {
      room.level  = msg.next;
      room.scores = msg.scores;
      broadcast(room, { type: 'level_complete', next: msg.next, scores: msg.scores });
      break;
    }
    case 'win': {
      room.scores = msg.scores;
      broadcast(room, { type: 'win', scores: msg.scores });
      break;
    }
    case 'restart': {
      room.level  = 1;
      room.scores = { boy: 0, girl: 0 };
      room.state  = 'waiting';
      broadcast(room, { type: 'restart' });
      break;
    }
    case 'ping':
      sendTo(sock, { type: 'pong' });
      break;
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '/game') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Servir imagens de uploads
  if (urlPath.startsWith('/img/')) {
    const name = urlPath.replace('/img/', '');
    const candidates = [
     path.join(__dirname, 'img', name),
      `/mnt/user-data/uploads/${name}`,
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
        fs.createReadStream(p).pipe(res);
        return;
      }
    }
  }

  res.writeHead(404); res.end('Not found');
});

// ─── WebSocket Upgrade ────────────────────────────────────────────────
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${wsHandshake(key)}`,
    '\r\n'
  ].join('\r\n'));

  let buffer = Buffer.alloc(0);

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    const frames = wsDecode(buffer);
    buffer = Buffer.alloc(0); // reset (simplificado)
    for (const f of frames) {
      if (f.type === 'close') { socket.destroy(); return; }
      if (f.type === 'text')  handleMessage(socket, f.data);
    }
  });

  socket.on('close', () => {
    const meta = connMap.get(socket);
    if (meta) {
      connMap.delete(socket);
      const room = rooms.get(meta.roomId);
      if (room) {
        room[meta.role] = null;
        broadcast(room, { type: 'player_left', role: meta.role });
        const info = roomInfo(room);
        if (info.connected === 0) rooms.delete(meta.roomId);
        else broadcast(room, { type: 'room_info', ...info });
      }
    }
  });

  socket.on('error', () => socket.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       🌊  ECO RIDER  — SERVIDOR ONLINE       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:   http://localhost:${PORT}              ║`);
  console.log(`║  Rede:    http://${ip}:${PORT}          ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Ambos celulares na mesma rede Wi-Fi         ║');
  console.log(`║  Abram:  http://${ip}:${PORT}           ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});
