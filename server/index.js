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
import { C2S, S2C } from '../shared/protocol.js';

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

// Servir Three.js y sus addons (GLTFLoader, OBJLoader, FontLoader, TextGeometry, BufferGeometryUtils) localmente desde node_modules
app.use('/vendor/three', express.static(path.join(ROOT_DIR, 'node_modules', 'three', 'build')));
app.use('/vendor/three-addons', express.static(path.join(ROOT_DIR, 'node_modules', 'three', 'examples', 'jsm')));
// Servir estáticamente la carpeta de modelos externos "/Modelos 3D" (soportando espacio codificado %20 en HTTP)
app.use(['/Modelos 3D', '/Modelos%203D'], express.static(path.join(ROOT_DIR, 'Modelos 3D')));
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
  socket.emit(S2C.NETWORK_INFO, { port: PORT, lanUrls: lanList });
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

  on(C2S.JOIN_LOBBY, ({ name }) => {
    const p = room.addHumanPlayer(socket, name);
    socket.emit(S2C.LOBBY_JOINED, { selfId: p.id, phase: room.phase });
  });
  on(C2S.CONFIGURE_BOTS, (cfg) => room.configureBots(cfg));
  on(C2S.ADD_BOT, () => room.addBot());
  on(C2S.CLEAR_BOTS, () => room.clearBots());
  on(C2S.START_GAME, (opts) => room.startGame(opts));
  on(C2S.PLAYER_JUMP, () => room.handlePlayerJump(socket.id));
  on(C2S.PLAYER_INPUT, (data) => room.handlePlayerInput(socket.id, data));
  on(C2S.PLAYER_SLIDE, (data) => room.handlePlayerSlide(socket.id, data));
  on(C2S.PLAYER_SHOOT, (data) => room.handleShoot(socket.id, data));
  on(C2S.PLAYER_RELOAD, () => room.handleReload(socket.id));
  on(C2S.PLAYER_SWITCH_WEAPON, ({ weapon }) => room.handleSwitchWeapon(socket.id, weapon));
  on(C2S.PLAYER_HEAL, ({ itemType }) => room.handleHeal(socket.id, itemType));
  on(C2S.PLAYER_CANCEL_HEAL, () => room.handleCancelHeal(socket.id));
  on(C2S.PLAYER_PICKUP, ({ lootId }) => room.handlePickup(socket.id, lootId));
  on(C2S.PLAYER_INTERACT_DOOR, ({ doorId }) => room.handleInteractDoor(socket.id, doorId));
  on(C2S.PLAYER_BREAK_WINDOW, ({ windowId }) => room.handleBreakWindow(socket.id, windowId));
  on(C2S.RESET_LOBBY, () => room.resetToLobby(false));

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
