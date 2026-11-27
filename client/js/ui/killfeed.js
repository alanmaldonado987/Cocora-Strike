// client/js/ui/killfeed.js
// Feed de eliminaciones (esquina superior): un renglón por baja que desaparece a los 5.5 s.

/**
 * @param {HTMLElement} killfeedEl contenedor #killfeed
 */
export function createKillfeed(killfeedEl) {
  const ui = { killfeed: killfeedEl };
  function addKillfeedItem(killer, victim, reason) {
    const div = document.createElement('div');
    div.className = 'kill-item';
    if (reason === 'storm') {
      div.textContent = `⚡ La Tormenta consumió a ${victim}`;
    } else if (reason === 'bear') {
      div.textContent = `🐻 Un Oso de Anteojos abatió a ${victim}`;
    } else if (reason === 'jaguar') {
      div.textContent = `🐆 Un Jaguar Colombiano cazó a ${victim}`;
    } else if (reason === 'fall') {
      div.textContent = `⛰️ ${victim} cayó desde gran altura`;
    } else if (reason === 'drown') {
      div.textContent = `🌊 ${victim} se ahogó en el río Quindío`;
    } else {
      div.textContent = `🎯 ${killer} eliminó a ${victim}`;
    }
    ui.killfeed.prepend(div);
    setTimeout(() => div.remove(), 5500);
  }

  return {
    add: addKillfeedItem,
    clear() {
      ui.killfeed.innerHTML = '';
    }
  };
}
