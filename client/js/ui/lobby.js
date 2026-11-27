// client/js/ui/lobby.js
// Sala de espera LAN (lista de jugadores, bots, avión, cuenta regresiva), controles del lobby y pantalla final.

import { AVATAR_COLORS } from '../player.js';
import { escapeHtml } from './elements.js';

/**
 * @param {object} deps
 * @param {object} deps.ui elementos de queryUiElements()
 * @param {() => string|null} deps.getSelfId id de socket propio (para marcar "TÚ")
 */
export function createLobby({ ui, getSelfId }) {
  /** Banner con la URL LAN para que otros equipos de la red se unan. */
  function showNetworkInfo(info) {
    if (ui.lanBanner && info.lanUrls && info.lanUrls.length > 0) {
      ui.lanBanner.textContent = `🌐 Red Local Wi-Fi / LAN: ${info.lanUrls[0]}`;
      ui.lanBanner.classList.remove('hidden');
    }
  }

  /** Oculta el formulario de apodo y muestra la sala de espera. */
  function showWaitingRoom() {
    ui.joinPanel.classList.add('hidden');
    ui.waitingPanel.classList.remove('hidden');
  }

  /** Refleja el estado del lobby enviado por el servidor. */
  function renderLobbyState(data) {
    ui.lobbyCount.textContent = String(data.players.length);

    if (ui.botDifficultySelect && data.botDifficulty) {
      ui.botDifficultySelect.value = data.botDifficulty;
    }
    if (ui.botCountSelect && typeof data.botCount === 'number') {
      const optExists = Array.from(ui.botCountSelect.options).some(
        (o) => Number(o.value) === data.botCount
      );
      if (optExists) ui.botCountSelect.value = String(data.botCount);
    }
    if (ui.aircraftTypeSelect && data.aircraftType) {
      ui.aircraftTypeSelect.value = data.aircraftType;
    }

    if (data.countdown !== null) {
      ui.lobbyCountdown.textContent = `⏱️ Despegue automático en ${data.countdown}s...`;
    } else {
      ui.lobbyCountdown.textContent =
        data.players.length >= 2
          ? '¡Sala lista! Inicia la partida o espera más jugadores en tu red Wi-Fi / LAN.'
          : 'Elige la cantidad de Bots IA o comparte la dirección LAN para jugar con amigos.';
    }

    ui.lobbyPlayersList.innerHTML = '';
    for (const p of data.players) {
      const li = document.createElement('li');
      li.className = 'player-chip';
      const dotColor = AVATAR_COLORS[p.colorIdx % AVATAR_COLORS.length];
      li.innerHTML = `
        <span class="chip-dot" style="background:${dotColor}"></span>
        <span>${escapeHtml(p.name)}</span>
        <span class="chip-tag">${p.isBot ? 'BOT IA' : p.id === getSelfId() ? 'TÚ' : 'LAN'}</span>
      `;
      ui.lobbyPlayersList.appendChild(li);
    }
  }

  /** Título, campeón y ranking de la pantalla final. */
  function renderGameOver(data, iWon) {
    ui.gameoverTitle.textContent = iWon
      ? '🏆 ¡VICTORIA MAGISTRAL EN EL COCORA!'
      : '🌄 PARTIDA FINALIZADA';
    ui.gameoverWinner.textContent = `Campeón: ${data.winnerName} (${data.winnerKills} bajas)`;

    ui.gameoverRanking.innerHTML = '';
    for (const row of data.ranking || []) {
      const tr = document.createElement('tr');
      if (row.id === getSelfId()) tr.style.background = 'rgba(34, 197, 94, 0.18)';
      tr.innerHTML = `
        <td><strong>#${escapeHtml(row.placement)}</strong></td>
        <td>${escapeHtml(row.name)} ${row.id === getSelfId() ? '(Tú)' : ''}</td>
        <td>${row.isBot ? '🤖 Bot IA' : '🧑 Jugador'}</td>
        <td><strong>${escapeHtml(row.kills)}</strong></td>
      `;
      ui.gameoverRanking.appendChild(tr);
    }

    ui.gameoverScreen.classList.remove('hidden');
  }

  /**
   * Conecta botones y selectores del lobby con la red y el audio.
   * @param {object} deps
   * @param {object} deps.audio SoundEngine (se inicializa con el primer gesto del usuario)
   * @param {object} deps.net NetworkManager
   * @param {(nickname: string) => void} deps.onNickname recibe el apodo elegido
   */
  function bindControls({ audio, net, onNickname }) {
    function submitJoinLobby() {
      audio.init();
      const raw = ui.nicknameInput.value.trim();
      const myNickname = raw || `Arriero_${Math.floor(100 + Math.random() * 899)}`;
      onNickname(myNickname);
      net.joinLobby(myNickname);
    }

    ui.btnJoin.addEventListener('click', submitJoinLobby);
    ui.nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitJoinLobby();
    });

    function sendBotConfigFromSelectors() {
      audio.init();
      const botDifficulty = ui.botDifficultySelect?.value || 'easy';
      const botCount = Number(ui.botCountSelect?.value ?? 6);
      const aircraftType = ui.aircraftTypeSelect?.value || 'auto';
      net.configureBots({ botDifficulty, botCount, aircraftType });
    }

    ui.botDifficultySelect?.addEventListener('change', sendBotConfigFromSelectors);
    ui.botCountSelect?.addEventListener('change', sendBotConfigFromSelectors);
    ui.aircraftTypeSelect?.addEventListener('change', sendBotConfigFromSelectors);

    ui.btnAddBot.addEventListener('click', () => {
      audio.init();
      net.addBot();
    });

    ui.btnClearBots.addEventListener('click', () => {
      audio.init();
      if (ui.botCountSelect) ui.botCountSelect.value = '0';
      net.clearBots();
    });

    ui.btnStartSolo.addEventListener('click', () => {
      audio.init();
      const botDifficulty = ui.botDifficultySelect?.value || 'easy';
      const selectedBots = Math.max(1, Number(ui.botCountSelect?.value || 6));
      const aircraftType = ui.aircraftTypeSelect?.value || 'auto';
      net.startGame({ autoFillBots: true, botCount: selectedBots, botDifficulty, aircraftType });
    });

    ui.btnStartMatch.addEventListener('click', () => {
      audio.init();
      const botDifficulty = ui.botDifficultySelect?.value || 'easy';
      const botCount = Number(ui.botCountSelect?.value ?? 6);
      const aircraftType = ui.aircraftTypeSelect?.value || 'auto';
      net.startGame({ autoFillBots: false, botCount, botDifficulty, aircraftType });
    });

    ui.btnBackLobby.addEventListener('click', () => {
      audio.init();
      net.resetLobby();
    });

    function handleToggleMute() {
      const muted = audio.toggleMute();
      ui.btnMute.textContent = muted ? '🔇 Silenciado' : '🔊 Audio ON';
    }

    ui.btnMute.addEventListener('click', handleToggleMute);
    window.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
      if (e.code === 'KeyM') handleToggleMute();
    });
  }

  return { showNetworkInfo, showWaitingRoom, renderLobbyState, renderGameOver, bindControls };
}
