'use strict';
// ── Moteur de jeu de cartes ───────────────────────────────────────────────

const RARITY_POWER = { common: 8, rare: 12, epic: 18, legendary: 25, mythic: 35 };
const RARITY_COST  = { common: 2, rare: 3,  epic: 3,  legendary: 4,  mythic: 5  };
const ENERGY_PER_TURN    = 3;
const MAX_SAVE_ENERGY    = 1;
const MAX_PARTENAIRES_ATK= 3;
const VICTORY_EXTASE     = 100;
const DRAW_SETUP_TURNS   = 5; // cartes piochées aux tours 1 et 2
const DRAW_COMBAT_TURNS  = 2; // cartes piochées à partir du tour 3
const ATTACK_ENERGY_COST = 1; // coût pour attaquer avec un partenaire

// Types de cartes
const TYPE_PARTENAIRE = 'partenaires';
const TYPE_LIEU       = 'lieux';
const TYPES_ATTACK_ONLY = ['position', 'jeu_de_role', 'objets']; // pas de défense V1
const TYPES_DUAL        = ['tenues', 'pratique'];                // attaque ou défense

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardPower(card) { return RARITY_POWER[card.rarity] || RARITY_POWER.common; }
function cardCost(card)  { return RARITY_COST[card.rarity]  || RARITY_COST.common; }

// Bonus d'attaque provenant des cartes de soutien sur le terrain
function computeAttackBonus(terrain) {
  let bonus = 0;
  for (const s of terrain.attack) {
    if (s.card.type === 'position')  bonus += 3;
    if (s.card.type === 'objets')    bonus += 2;
    if (s.card.type === 'jeu_de_role') bonus += 1;
  }
  return bonus;
}

// Réduction de dégâts depuis les cartes défensives de soutien
function computeDefenseReduction(terrain) {
  let red = 0;
  for (const s of terrain.defense) {
    if (s.card.type === 'tenues')   red += 4;
    if (s.card.type === 'pratique') red += 2;
  }
  return red;
}

// Applique les dégâts à un joueur — passe d'abord par les partenaires en défense
function applyDamage(defender, rawDamage) {
  const reduction = computeDefenseReduction(defender.terrain);
  let damage = Math.max(0, rawDamage - reduction);
  let blocked = 0;

  const defSlots = defender.terrain.defense.filter(
    s => s.card.type === TYPE_PARTENAIRE && s.defensePoints > 0
  );
  for (const slot of defSlots) {
    if (damage <= 0) break;
    const absorbed = Math.min(slot.defensePoints, damage);
    slot.defensePoints -= absorbed;
    damage  -= absorbed;
    blocked += absorbed;
    if (slot.defensePoints <= 0) {
      defender.discard.push(slot.card);
      defender.terrain.defense = defender.terrain.defense.filter(s => s.slotId !== slot.slotId);
    }
  }

  defender.extase = Math.min(VICTORY_EXTASE, defender.extase + damage);
  return { blocked, damageDealt: damage };
}

// ── Construction de l'état initial d'un joueur ───────────────────────────
function buildPlayerState(personnage, deck, isAI) {
  return {
    isAI,
    personnage: {
      id:      personnage.id,
      name:    personnage.name || personnage.title,
      thumb:   personnage.thumb || null,
      vitesse: personnage.vitesse || 5,
      defense: personnage.defense || 5,
      pv:      personnage.pv || 100,
      domSub:  personnage.domSub || personnage.dom_sub || 0,
      gender:  personnage.gender || '',
      passif:  personnage.passif || '',
      actionPrelim: {
        name:  personnage.actionPrelimName || personnage.action_prelim_name || 'Préliminaires',
        power: personnage.actionPrelimPower ?? personnage.action_prelim_power ?? 3,
        cost:  1,
      },
      actionActe: {
        name:  personnage.actionActeName || personnage.action_acte_name || 'Acte principal',
        power: personnage.actionActePower ?? personnage.action_acte_power ?? 7,
        cost:  2,
      },
      actionFinition: {
        name:  personnage.actionFinitionName || personnage.action_finition_name || 'Finition',
        power: personnage.actionFinitionPower ?? personnage.action_finition_power ?? 20,
        cost:  3,
      },
    },
    extase:             0,
    energy:             ENERGY_PER_TURN,
    savedEnergy:        0,
    hasAttackedThisTurn: false,
    hand:    [],
    deck:    shuffle(deck),
    discard: [],
    terrain: { attack: [], defense: [] },
  };
}

// ── Initiative ────────────────────────────────────────────────────────────
function determineInitiative(p0, p1) {
  if (p0.personnage.vitesse !== p1.personnage.vitesse)
    return p0.personnage.vitesse > p1.personnage.vitesse ? 0 : 1;
  if (p0.personnage.pv !== p1.personnage.pv)
    return p0.personnage.pv < p1.personnage.pv ? 0 : 1; // plus fragile = priorité
  const gPrio = g => (g === 'femme' ? 0 : 1);
  if (p0.personnage.gender !== p1.personnage.gender)
    return gPrio(p0.personnage.gender) < gPrio(p1.personnage.gender) ? 0 : 1;
  return Math.random() < 0.5 ? 0 : 1;
}

// ── Début de tour ─────────────────────────────────────────────────────────
function startTurn(state) {
  const p = state.players[state.activePlayer];
  p.hasAttackedThisTurn = false;
  p.terrain.attack.forEach(s => { s.hasAttacked = false; });

  const drawCount = state.turn <= 2 ? DRAW_SETUP_TURNS : DRAW_COMBAT_TURNS;
  p.energy = ENERGY_PER_TURN + (p.savedEnergy || 0);
  p.savedEnergy = 0;

  // Pioche — reméle la défausse si le deck est vide
  let drawn = 0;
  while (drawn < drawCount) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) break;
      p.deck = shuffle(p.discard);
      p.discard = [];
    }
    p.hand.push(p.deck.shift());
    drawn++;
  }

  state.phase = state.turn <= 2 ? 'setup' : 'combat';
  state.log.push(`Tour ${state.turn} · ${p.isAI ? 'Adversaire' : 'Vous'} · Énergie: ${p.energy}`);
}

// ── Jouer une carte ───────────────────────────────────────────────────────
function playCard(state, playerIdx, cardKey, zone) {
  const p = state.players[playerIdx];
  const cardIdx = p.hand.findIndex(c => c.key === cardKey);
  if (cardIdx === -1) return { ok: false, error: 'Carte introuvable en main' };

  const card = p.hand[cardIdx];
  const cost = cardCost(card);
  if (p.energy < cost) return { ok: false, error: `Énergie insuffisante (coût: ${cost}, disponible: ${p.energy})` };

  // Lieu — case partagée
  if (card.type === TYPE_LIEU) {
    if (state.sharedLieu) {
      // Défausser l'ancien lieu
      const oldLieu = state.sharedLieu;
      state.players.forEach(pl => pl.discard.push(oldLieu));
    }
    state.sharedLieu = card;
    p.hand.splice(cardIdx, 1);
    p.energy -= cost;
    state.log.push(`"${card.title}" remplace le lieu actif`);
    return { ok: true };
  }

  if (zone === 'attack') {
    if (card.type === TYPE_PARTENAIRE) {
      const count = p.terrain.attack.filter(s => s.card.type === TYPE_PARTENAIRE).length;
      if (count >= MAX_PARTENAIRES_ATK)
        return { ok: false, error: `Maximum ${MAX_PARTENAIRES_ATK} partenaires en attaque` };
    }
    const slotId = 'a' + playerIdx + '_' + Date.now();
    p.terrain.attack.push({ slotId, card, hasAttacked: false });

  } else if (zone === 'defense') {
    if (TYPES_ATTACK_ONLY.includes(card.type))
      return { ok: false, error: 'Ce type ne peut pas être en défense' };

    if (card.type === TYPE_PARTENAIRE) {
      const power  = cardPower(card);
      const defPts = power * 3;
      const slotId = 'd' + playerIdx + '_' + Date.now();
      p.terrain.defense.push({ slotId, card, defensePoints: defPts });
    } else {
      const slotId = 'd' + playerIdx + '_' + Date.now();
      p.terrain.defense.push({ slotId, card, defensePoints: 0 });
    }
  } else {
    return { ok: false, error: 'Zone invalide' };
  }

  p.hand.splice(cardIdx, 1);
  p.energy -= cost;
  state.log.push(`"${card.title}" joué en ${zone === 'attack' ? 'attaque' : 'défense'} (−${cost} énergie)`);
  return { ok: true };
}

// ── Attaque avec le personnage ────────────────────────────────────────────
function attackWithPersonnage(state, attackerIdx, actionType) {
  if (state.turn <= 2) return { ok: false, error: 'Pas d\'attaque lors des 2 premiers tours' };

  const attacker   = state.players[attackerIdx];
  const defenderIdx = 1 - attackerIdx;
  const defender   = state.players[defenderIdx];

  if (attacker.hasAttackedThisTurn)
    return { ok: false, error: 'Le personnage a déjà attaqué ce tour' };

  const actionMap = {
    prelim:   attacker.personnage.actionPrelim,
    acte:     attacker.personnage.actionActe,
    finition: attacker.personnage.actionFinition,
  };
  const action = actionMap[actionType];
  if (!action) return { ok: false, error: 'Action invalide' };
  if (attacker.energy < action.cost)
    return { ok: false, error: `Énergie insuffisante (coût: ${action.cost})` };

  const bonus  = computeAttackBonus(attacker.terrain);
  const damage = action.power + bonus;
  const result = applyDamage(defender, damage);

  attacker.energy -= action.cost;
  attacker.hasAttackedThisTurn = true;

  state.log.push(`${attacker.personnage.name} utilise "${action.name}" — ${damage} dégâts${result.blocked ? ` (${result.blocked} bloqués)` : ''} → Extase: ${defender.extase}`);
  return { ok: true, damage, extase: defender.extase };
}

// ── Attaque avec un partenaire ────────────────────────────────────────────
function attackWithCard(state, attackerIdx, slotId) {
  if (state.turn <= 2) return { ok: false, error: 'Pas d\'attaque lors des 2 premiers tours' };

  const attacker   = state.players[attackerIdx];
  const defenderIdx = 1 - attackerIdx;
  const defender   = state.players[defenderIdx];

  const slot = attacker.terrain.attack.find(s => s.slotId === slotId);
  if (!slot) return { ok: false, error: 'Carte introuvable sur le terrain' };
  if (slot.card.type !== TYPE_PARTENAIRE)
    return { ok: false, error: 'Seuls les partenaires peuvent attaquer' };
  if (slot.hasAttacked) return { ok: false, error: 'Ce partenaire a déjà attaqué' };
  if (attacker.energy < ATTACK_ENERGY_COST)
    return { ok: false, error: 'Énergie insuffisante' };

  const bonus  = computeAttackBonus(attacker.terrain);
  const damage = cardPower(slot.card) + bonus;
  const result = applyDamage(defender, damage);

  attacker.energy -= ATTACK_ENERGY_COST;
  slot.hasAttacked = true;

  state.log.push(`"${slot.card.title}" attaque — ${damage} dégâts${result.blocked ? ` (${result.blocked} bloqués)` : ''} → Extase: ${defender.extase}`);
  return { ok: true, damage, extase: defender.extase };
}

// ── Fin de tour ───────────────────────────────────────────────────────────
function endTurn(state) {
  const p = state.players[state.activePlayer];
  p.savedEnergy = Math.min(p.energy, MAX_SAVE_ENERGY);
  state.activePlayer = 1 - state.activePlayer;
  state.turn++;
  startTurn(state);
  return { ok: true };
}

// ── IA simple ─────────────────────────────────────────────────────────────
function runAITurn(state, aiIdx) {
  const ai       = state.players[aiIdx];
  const oppIdx   = 1 - aiIdx;
  const opponent = state.players[oppIdx];

  // Jouer des cartes
  let safetyBail = 12;
  while (safetyBail-- > 0) {
    const playable = ai.hand
      .filter(c => cardCost(c) <= ai.energy)
      .sort((a, b) => cardPower(b) - cardPower(a));
    if (!playable.length) break;

    const card = playable[0];
    let zone = 'attack';

    if (card.type === TYPE_LIEU) {
      // lieu géré automatiquement
    } else if (card.type === TYPE_PARTENAIRE) {
      const atkCount = ai.terrain.attack.filter(s => s.card.type === TYPE_PARTENAIRE).length;
      const defCount = ai.terrain.defense.filter(s => s.card.type === TYPE_PARTENAIRE).length;
      if (atkCount >= MAX_PARTENAIRES_ATK || (ai.extase > 55 && defCount === 0))
        zone = 'defense';
    } else if (TYPES_DUAL.includes(card.type)) {
      zone = ai.extase > 50 ? 'defense' : 'attack';
    } else if (TYPES_ATTACK_ONLY.includes(card.type)) {
      zone = 'attack';
    }

    const res = playCard(state, aiIdx, card.key, zone);
    if (!res.ok) break;
  }

  // Attaquer avec le personnage
  if (state.turn >= 3 && !ai.hasAttackedThisTurn) {
    const actions = [
      { type: 'finition', a: ai.personnage.actionFinition },
      { type: 'acte',     a: ai.personnage.actionActe     },
      { type: 'prelim',   a: ai.personnage.actionPrelim   },
    ];
    for (const { type, a } of actions) {
      if (ai.energy >= a.cost) {
        attackWithPersonnage(state, aiIdx, type);
        break;
      }
    }
  }

  // Attaquer avec les partenaires disponibles
  if (state.turn >= 3) {
    for (const slot of ai.terrain.attack.filter(s => s.card.type === TYPE_PARTENAIRE && !s.hasAttacked)) {
      if (ai.energy >= ATTACK_ENERGY_COST)
        attackWithCard(state, aiIdx, slot.slotId);
    }
  }

  endTurn(state);
  return { victory: opponent.extase >= VICTORY_EXTASE };
}

// ── Création de la partie ─────────────────────────────────────────────────
function createGameState(playerPersonnage, playerDeck, aiPersonnage, aiDeck) {
  const p0 = buildPlayerState(playerPersonnage, playerDeck, false);
  const p1 = buildPlayerState(aiPersonnage,     aiDeck,     true);

  const first = determineInitiative(p0, p1);
  const initMsg = first === 0
    ? `Initiative: vous commencez (Vitesse ${p0.personnage.vitesse} vs ${p1.personnage.vitesse})`
    : `Initiative: l'adversaire commence (Vitesse ${p1.personnage.vitesse} vs ${p0.personnage.vitesse})`;

  const state = {
    turn: 1,
    activePlayer: first,
    phase: 'setup',
    players: [p0, p1],
    sharedLieu: null,
    log: [initMsg],
    victory: null,
  };

  startTurn(state);
  return state;
}

module.exports = {
  createGameState,
  playCard,
  attackWithPersonnage,
  attackWithCard,
  endTurn,
  runAITurn,
  VICTORY_EXTASE,
  RARITY_COST,
  RARITY_POWER,
  cardCost,
  cardPower,
};
