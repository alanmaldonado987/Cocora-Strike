// client/js/ui/elements.js
// Referencias a los nodos del DOM del lobby, HUD y pantalla final, y utilidades comunes de la interfaz.

/** Busca una sola vez todos los elementos de la interfaz (ids definidos en client/index.html). */
export function queryUiElements() {
  return {
    btnMute: document.getElementById('btn-mute'),
    lobbyScreen: document.getElementById('lobby-screen'),
    lanBanner: document.getElementById('lan-url-banner'),
    joinPanel: document.getElementById('join-panel'),
    waitingPanel: document.getElementById('waiting-panel'),
    nicknameInput: document.getElementById('nickname-input'),
    btnJoin: document.getElementById('btn-join-lobby'),
    lobbyCount: document.getElementById('lobby-count'),
    lobbyCountdown: document.getElementById('lobby-countdown'),
    lobbyPlayersList: document.getElementById('lobby-players-list'),
    botDifficultySelect: document.getElementById('bot-difficulty-select'),
    botCountSelect: document.getElementById('bot-count-select'),
    aircraftTypeSelect: document.getElementById('aircraft-type-select'),
    btnAddBot: document.getElementById('btn-add-bot'),
    btnClearBots: document.getElementById('btn-clear-bots'),
    btnStartSolo: document.getElementById('btn-start-solo'),
    btnStartMatch: document.getElementById('btn-start-match'),
  
    hudScreen: document.getElementById('hud-screen'),
    sniperScopeOverlay: document.getElementById('sniper-scope-overlay'),
    minimapCanvas: document.getElementById('minimap-canvas'),
    stormPhaseText: document.getElementById('storm-phase-text'),
    stormTimerText: document.getElementById('storm-timer-text'),
    stormWarning: document.getElementById('storm-warning'),
    stormVignette: document.getElementById('storm-vignette'),
    damageFlash: document.getElementById('damage-flash'),
    aliveCount: document.getElementById('alive-count'),
    killsCount: document.getElementById('kills-count'),
    fpsCount: document.getElementById('fps-count'),
    killfeed: document.getElementById('killfeed'),
    actionBanner: document.getElementById('action-banner'),
    pointerPrompt: document.getElementById('pointer-prompt'),
    crosshair: document.getElementById('crosshair'),
    hitmarker: document.getElementById('hitmarker'),
    floatingDmgLayer: document.getElementById('floating-dmg-layer'),
    targetHud: document.getElementById('target-hud'),
    targetHudName: document.getElementById('target-hud-name'),
    targetHudHp: document.getElementById('target-hud-hp'),
    targetHudFill: document.getElementById('target-hud-fill'),
    statusToast: document.getElementById('status-toast'),
    interactPrompt: document.getElementById('interact-prompt'),
    healWrap: document.getElementById('heal-bar-wrap'),
    healLabel: document.getElementById('heal-bar-label'),
    healTimer: document.getElementById('heal-bar-timer'),
    healFill: document.getElementById('heal-bar-fill'),
  
    hpFill: document.getElementById('hp-fill'),
    hpText: document.getElementById('hp-text'),
    breathBar: document.getElementById('breath-bar'),
    breathFill: document.getElementById('breath-fill'),
    drownWarning: document.getElementById('drown-warning'),
    medkitCount: document.getElementById('medkit-count'),
    bandageCount: document.getElementById('bandage-count'),
    stealthBadge: document.getElementById('stealth-badge'),
    reloadWrap: document.getElementById('reload-bar-wrap'),
    reloadFill: document.getElementById('reload-bar-fill'),
    weaponName: document.getElementById('weapon-name'),
    weaponIconPath: document.getElementById('weapon-icon-path'),
    weaponChargeFill: document.getElementById('weapon-charge-fill'),
    ammoCurrent: document.getElementById('ammo-current'),
    ammoReserve: document.getElementById('ammo-reserve'),
    slotFists: document.getElementById('slot-fists'),
    slotPistol: document.getElementById('slot-pistol'),
    slotRevolver: document.getElementById('slot-revolver'),
    slotShotgun: document.getElementById('slot-shotgun'),
    slotSmg: document.getElementById('slot-smg'),
    slotAssaultRifle: document.getElementById('slot-assault-rifle'),
    slotRifle: document.getElementById('slot-rifle'),
    slotSniper: document.getElementById('slot-sniper'),
  
    gameoverScreen: document.getElementById('gameover-screen'),
    gameoverTitle: document.getElementById('gameover-title'),
    gameoverWinner: document.getElementById('gameover-winner'),
    gameoverRanking: document.getElementById('gameover-ranking'),
    btnBackLobby: document.getElementById('btn-back-lobby')
  };
}

export const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
