// server/index.js
// Servidor HTTP (Express) + WebSockets (Socket.IO) con soporte completo para Red Local (LAN / Wi-Fi)
// Escucha explícitamente en 0.0.0.0 e imprime en consola las direcciones IPv4 detectadas automáticamente.

import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { GameRoom } from './gameRoom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function getLocalIPv4Addresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const [ifaceName, entries] of Object.entries(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      const familyV4 = net.family === 'IPv4' || net.family === 4;
      if (familyV4 && !net.internal) {
        addresses.push({ interface: ifaceName, address: net.address });
      }
    }
  }
  // Priorizar rangos típicos de Wi-Fi / LAN doméstica (192.168.x.x / 10.x.x.x)
  addresses.sort((a, b) => {
    const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
    return score(a.address) - score(b.address);
  });
  return addresses;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Servir Three.js localmente desde node_modules (cero dependencias de CDN externas)
app.use('/vendor/three', express.static(path.join(ROOT_DIR, 'node_modules', 'three', 'build')));
// Servir módulo determinista compartido
app.use('/shared', express.static(path.join(ROOT_DIR, 'shared')));
// Servir frontend estático
app.use(express.static(path.join(ROOT_DIR, 'client')));

const room = new GameRoom(io);

app.get('/health', (_req, res) => {
  const lanList = getLocalIPv4Addresses().map((n) => `http://${n.address}:${PORT}`);
  res.json({
    status: 'ok',
    phase: room.phase,
    players: room.players.size,
    botDifficulty: room.botDifficulty,
    lanUrls: lanList
  });
});

io.on('connection', (socket) => {
  const lanList = getLocalIPv4Addresses().map((n) => `http://${n.address}:${PORT}`);
  socket.emit('network_info', { port: PORT, lanUrls: lanList });
  room.broadcastLobbyState();

  socket.on('join_lobby', (payload = {}) => {
    const p = room.addHumanPlayer(socket, payload.name);
    socket.emit('lobby_joined', { selfId: p.id, phase: room.phase });
  });

  socket.on('configure_bots', (payload = {}) => {
    room.configureBots(payload);
  });

  socket.on('add_bot', () => {
    room.addBot();
  });

  socket.on('clear_bots', () => {
    room.clearBots();
  });

  socket.on('start_game', (payload = {}) => {
    room.startGame({
      autoFillBots: Boolean(payload.autoFillBots),
      botCount: typeof payload.botCount === 'number' ? payload.botCount : undefined,
      botDifficulty: payload.botDifficulty
    });
  });

  socket.on('player_jump', () => {
    room.handlePlayerJump(socket.id);
  });

  socket.on('player_input', (payload = {}) => {
    room.handlePlayerInput(socket.id, payload);
  });

  socket.on('player_slide', (payload = {}) => {
    room.handlePlayerSlide(socket.id, payload);
  });

  socket.on('player_shoot', (payload = {}) => {
    room.handleShoot(socket.id, payload);
  });

  socket.on('player_reload', () => {
    room.handleReload(socket.id);
  });

  socket.on('player_switch_weapon', (payload = {}) => {
    if (payload.weapon) room.handleSwitchWeapon(socket.id, payload.weapon);
  });

  socket.on('player_heal', (payload = {}) => {
    room.handleHeal(socket.id, payload.itemType || 'medkit');
  });

  socket.on('player_cancel_heal', () => {
    room.handleCancelHeal(socket.id);
  });

  socket.on('player_pickup', (payload = {}) => {
    if (payload.lootId) room.handlePickup(socket.id, payload.lootId);
  });

  socket.on('player_interact_door', (payload = {}) => {
    if (payload.doorId) room.handleInteractDoor(socket.id, payload.doorId);
  });

  socket.on('player_break_window', (payload = {}) => {
    if (payload.windowId) room.handleBreakWindow(socket.id, payload.windowId);
  });

  socket.on('reset_lobby', () => {
    room.resetToLobby(false);
  });

  socket.on('disconnect', () => {
    room.removePlayer(socket.id);
  });
});

server.listen(PORT, HOST, () => {
  const lanInterfaces = getLocalIPv4Addresses();
  console.log(`\n===================================================================`);
  console.log(`  BATALLA EN EL COCORA (Low-Poly 3D) - Servidor Multijugador LAN`);
  console.log(`  Escuchando en todas las interfaces (${HOST}:${PORT})`);
  console.log(`-------------------------------------------------------------------`);
  console.log(`  -> En esta computadora:    http://localhost:${PORT}`);
  if (lanInterfaces.length > 0) {
    for (const item of lanInterfaces) {
      console.log(`  -> En tu Red Wi-Fi / LAN:  http://${item.address}:${PORT}  (${item.interface})`);
    }
  } else {
    console.log(`  -> En tu Red Wi-Fi / LAN:  (No se detectó interfaz LAN activa)`);
  }
  console.log(`===================================================================\n`);
});
