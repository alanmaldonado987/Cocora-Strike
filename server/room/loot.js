// server/room/loot.js
// Botín: aparición inicial, drops, alcance y recolección.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import {
  WATER_LEVEL,
  WEAPONS,
  LOOT_TYPES,
  getRiverCenterWorldX,
  hasLineOfSight
} from '../../shared/mapData.js';

export const lootMethods = {
  spawnInitialLoot(rng) {
    this.loot.clear();
    this.nextLootId = 1;

    const randomLootType = () => {
      const r = rng();
      if (r < 0.12) return 'pistol';
      if (r < 0.22) return 'revolver';
      if (r < 0.34) return 'shotgun';
      if (r < 0.46) return 'smg';
      if (r < 0.56) return 'assault_rifle';
      if (r < 0.65) return 'rifle';
      if (r < 0.72) return 'sniper';
      if (r < 0.84) return 'ammo';
      if (r < 0.92) return 'bandage';
      return 'medkit';
    };

    for (const sp of this.map.lootSpawns) {
      const type = sp.preferredType || randomLootType();
      this.createLootItem(type, sp.x, sp.y, sp.z, Boolean(sp.onFlatStructure));
    }

    for (let i = 0; i < 65; i++) {
      const wx = (rng() - 0.5) * 520;
      const wz = (rng() - 0.5) * 520;
      if (Math.abs(wx - getRiverCenterWorldX(wz)) < 16) continue;
      const gy = this.map.getTerrainHeightAt ? this.map.getTerrainHeightAt(wx, wz) : this.map.getGroundHeightAt(wx, wz);
      if (gy <= WATER_LEVEL + 0.8 || gy >= 40 || this.map.getSlopeAt(wx, wz) > 0.55) continue;
      if (!this.map.exclusion.canPlace(wx, wz, 0.95)) continue;

      this.map.exclusion.register(wx, wz, 0.9);
      const safe = this.map.findSafeLootPlacement(wx, gy, wz);
      this.createLootItem(randomLootType(), safe.x, safe.y, safe.z, safe.onFlatStructure);
    }
  },

  createLootItem(type, x, y, z, onFlatStructure = false) {
    const id = `loot_${this.nextLootId++}`;
    const item = {
      id,
      type,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      z: Number(z.toFixed(2)),
      onFlatStructure: Boolean(onFlatStructure)
    };
    this.loot.set(id, item);
    return item;
  },

  spawnDroppedLootList(types, cx, cy, cz) {
    const offsets = [
      [0.6, 0.0],
      [-0.6, 0.35],
      [0.0, -0.65],
      [0.55, 0.55]
    ];
    const items = [];
    types.forEach((t, idx) => {
      if (!t) return;
      const [ox, oz] = offsets[idx % offsets.length];
      const safe = this.map.findSafeLootPlacement(cx + ox, cy, cz + oz);
      items.push(this.createLootItem(t, safe.x, safe.y, safe.z, safe.onFlatStructure));
    });
    if (items.length > 0) this.io.emit('loot_spawned', { items });
  },

  spawnDroppedLootPair(type1, type2, cx, cy, cz) {
    this.spawnDroppedLootList([type1, type2], cx, cy, cz);
  },

  canPlayerReachLoot(p, item, manual = false) {
    const spec = LOOT_TYPES[item.type] || LOOT_TYPES.ammo;
    const pickupR = manual ? 3.6 : (spec.pickupRadius || 1.7);
    const horiz = Math.hypot(item.x - p.x, item.z - p.z);
    if (horiz > pickupR) return false;

    const effH = this.getParticipantHeight(p);
    if (item.y < p.y - 0.85 || item.y > p.y + effH + 0.55) return false;

    if (manual) return true;
    const chest = { x: p.x, y: p.y + 0.95, z: p.z };
    const lootPt = { x: item.x, y: item.y + 0.16, z: item.z };
    return hasLineOfSight(this.map, chest, lootPt, 0.22);
  },

  handlePickup(socketId, lootId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== 'ground') return;
    const item = this.loot.get(lootId);
    if (!item) return;

    if (this.canPlayerReachLoot(p, item, true)) {
      this.applyLootToPlayer(p, item);
    }
  },

  applyLootToPlayer(p, item) {
    const wSpec = WEAPONS[item.type];
    if (wSpec && item.type !== 'fists') {
      const slotState = p.weapons[item.type];
      const wasUnlocked = slotState.unlocked;
      slotState.unlocked = true;
      if (!wasUnlocked) {
        slotState.mag = wSpec.magSize;
        p.reserveAmmo += wSpec.startAmmo || 30;
      } else {
        p.reserveAmmo += Math.round((wSpec.startAmmo || 24) * 0.75);
      }
      if (p.equipped === 'fists' || (p.isBot && wSpec.slot > (WEAPONS[p.equipped]?.slot || 0))) {
        p.equipped = item.type;
      }
    } else if (item.type === 'ammo') {
      p.reserveAmmo += LOOT_TYPES.ammo.amount;
    } else if (item.type === 'medkit') {
      if (p.medkits < 3) {
        p.medkits += 1;
      } else {
        return false;
      }
    } else if (item.type === 'bandage') {
      if (p.bandages < 5) {
        p.bandages += 1;
      } else {
        return false;
      }
    }

    this.loot.delete(item.id);
    this.io.emit('loot_picked', {
      lootId: item.id,
      type: item.type,
      playerId: p.id,
      hp: p.hp,
      medkits: p.medkits,
      bandages: p.bandages,
      equipped: p.equipped,
      weapons: p.weapons,
      reserveAmmo: p.reserveAmmo
    });
    return true;
  }
};
