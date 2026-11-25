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
import { RateLimiter, sanitizers } from './validation.js';

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

  const limiter = new RateLimiter();

  // Registra un evento: aplica límite de frecuencia, sanitiza el payload y aísla errores
  // para que un mensaje malformado nunca tumbe el servidor.
  const on = (event, handler) => {
    const sanitize = sanitizers[event];
    socket.on(event, (raw) => {
      if (!limiter.allow(event)) return;
      const payload = sanitize ? sanitize(raw) : undefined;
      if (sanitize && payload === null) return;
      try {
        handler(payload);
      } catch (err) {
        console.error(`[${event}] error procesando mensaje de ${socket.id}:`, err);
      }
    });
  };

  on('join_lobby', ({ name }) => {
    const p = room.addHumanPlayer(socket, name);
    socket.emit('lobby_joined', { selfId: p.id, phase: room.phase });
  });
  on('configure_bots', (cfg) => room.configureBots(cfg));
  on('add_bot', () => room.addBot());
  on('clear_bots', () => room.clearBots());
  on('start_game', (opts) => room.startGame(opts));
  on('player_jump', () => room.handlePlayerJump(socket.id));
  on('player_input', (data) => room.handlePlayerInput(socket.id, data));
  on('player_slide', (data) => room.handlePlayerSlide(socket.id, data));
  on('player_shoot', (data) => room.handleShoot(socket.id, data));
  on('player_reload', () => room.handleReload(socket.id));
  on('player_switch_weapon', ({ weapon }) => room.handleSwitchWeapon(socket.id, weapon));
  on('player_heal', ({ itemType }) => room.handleHeal(socket.id, itemType));
  on('player_cancel_heal', () => room.handleCancelHeal(socket.id));
  on('player_pickup', ({ lootId }) => room.handlePickup(socket.id, lootId));
  on('player_interact_door', ({ doorId }) => room.handleInteractDoor(socket.id, doorId));
  on('player_break_window', ({ windowId }) => room.handleBreakWindow(socket.id, windowId));
  on('reset_lobby', () => room.resetToLobby(false));

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
