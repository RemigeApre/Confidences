const express = require('express');
const { requireUserJson } = require('../auth');
const {
  getMemoryImages, getMemoryTags, grantLootbox, getLootboxCount,
  updateArcadeStats, getUserById,
  listCharms, adjustCoins, grantCharmDirect,
  getLootboxConfig, RARITY_BUY_PRICE,
  getMemoryShop, setMemoryCardIcon, buyOrSetMemoryColor,
  getWordleDaily, getWordleUserGame, saveWordleGuess, updateWordleStreakAndStats, normalizeWordleWord,
  getUserPersonnageCards,
  getActiveCardGameSession, createCardGameSession, updateCardGameSession,
  getPlayerCardGameDeck, getAICardGameDeck, getAICardGamePersonnage,
} = require('../db');
const { thumbUrl } = require('../thumbs');
const {
  createGameState, playCard, attackWithPersonnage, attackWithCard,
  endTurn, runAITurn, VICTORY_EXTASE,
} = require('../cardGame');

const CHARM_SLOTS_COST = 4;
const WIN_PROB = 0.05;
const WORDLE_MAX_GUESSES = 6;
const WORDLE_REWARDS = [5, 4, 3, 2, 1, 0]; // index = guessCount-1

function computeWordleFeedback(guess, target) {
  const result = new Array(guess.length).fill('absent');
  const remaining = {};
  for (let i = 0; i < target.length; i++) {
    if (guess[i] === target[i]) { result[i] = 'correct'; }
    else { remaining[target[i]] = (remaining[target[i]] || 0) + 1; }
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] !== 'correct' && remaining[guess[i]] > 0) {
      result[i] = 'present'; remaining[guess[i]]--;
    }
  }
  return result;
}

function buildArcadeRouter() {
  const router = express.Router();

  // ── Memory ────────────────────────────────────────────────────────────────

  router.get('/memory-images', requireUserJson, (req, res) => {
    const tag = req.query.tag || null;
    const count = Math.min(Math.max(parseInt(req.query.count) || 10, 4), 10);
    const images = getMemoryImages(req.user.id, { tag, count });
    res.json({ ok: true, images: images.map(img => ({ ...img, thumb: thumbUrl(img.thumb) })) });
  });

  router.get('/tags', requireUserJson, (req, res) => {
    const min = Math.max(parseInt(req.query.min) || 8, 4);
    res.json({ ok: true, tags: getMemoryTags(req.user.id, min) });
  });

  router.post('/memory-complete', requireUserJson, express.json(), (req, res) => {
    const { level, won, score } = req.body;
    const lvl = Math.max(1, parseInt(level) || 0);
    const pts = Math.max(0, parseInt(score)  || 0);
    if (!won) return res.json({ ok: true, lootboxGranted: false });
    const prevBest = (getUserById(req.user.id) || {}).arcadeMemoryBestLevel || 0;
    updateArcadeStats(req.user.id, lvl, pts);
    if (lvl % 5 === 0 && lvl > prevBest) {
      grantLootbox(req.user.id, 1, 'standard');
      const newCount = getLootboxCount(req.user.id);
      return res.json({ ok: true, lootboxGranted: true, newCount });
    }
    res.json({ ok: true, lootboxGranted: false });
  });

  // ── Memory boutique ───────────────────────────────────────────────────────

  router.get('/memory/shop', requireUserJson, (req, res) => {
    try {
      const shop = getMemoryShop(req.user.id);
      if (!shop) { console.warn('[arcade/memory/shop] getMemoryShop returned null for user', req.user.id); return res.json({ ok: false }); }
      res.json({ ok: true, ...shop });
    } catch (e) {
      console.error('[arcade/memory/shop] error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post('/memory/shop/icon', requireUserJson, express.json(), (req, res) => {
    const charmId = req.body.charmId ? parseInt(req.body.charmId, 10) : null;
    setMemoryCardIcon(req.user.id, charmId);
    res.json({ ok: true });
  });

  router.post('/memory/shop/color', requireUserJson, express.json(), (req, res) => {
    const colorKey = String(req.body.colorKey || 'default');
    res.json(buyOrSetMemoryColor(req.user.id, colorKey));
  });

  router.post('/memory/time-boost', requireUserJson, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user || user.coins < 5) return res.json({ ok: false, error: 'not_enough_coins' });
    adjustCoins(req.user.id, -5);
    const newCoins = (getUserById(req.user.id) || {}).coins || 0;
    res.json({ ok: true, newCoins });
  });

  router.post('/memory/reveal', requireUserJson, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user || user.coins < 5) return res.json({ ok: false, error: 'not_enough_coins' });
    adjustCoins(req.user.id, -5);
    const newCoins = (getUserById(req.user.id) || {}).coins || 0;
    res.json({ ok: true, newCoins });
  });

  // ── Machine à charmes ─────────────────────────────────────────────────────

  router.get('/charm-slots/info', requireUserJson, (req, res) => {
    const charms = listCharms().map(c => ({ id: c.id, symbol: c.symbol, label: c.label, rarity: c.rarity }));
    res.json({ ok: true, charms });
  });

  router.post('/charm-slots', requireUserJson, express.json(), (req, res) => {
    const user = getUserById(req.user.id);
    if (!user || user.coins < CHARM_SLOTS_COST) return res.json({ ok: false, error: 'not_enough_coins' });
    const charms = listCharms();
    if (!charms.length) return res.json({ ok: false, error: 'no_charms' });
    adjustCoins(req.user.id, -CHARM_SLOTS_COST);
    const win = Math.random() < WIN_PROB;
    const pick = () => charms[Math.floor(Math.random() * charms.length)];
    let symbols, wonCharm = null;
    if (win) {
      wonCharm = pick(); symbols = [wonCharm, wonCharm, wonCharm];
    } else {
      symbols = [pick(), pick(), pick()];
      while (symbols[0].id === symbols[1].id && symbols[1].id === symbols[2].id) symbols[2] = pick();
    }
    let reward = null;
    if (win) {
      const granted = grantCharmDirect(req.user.id, wonCharm.id);
      if (granted.alreadyOwned) {
        const cfg = getLootboxConfig();
        const buyPrice = (cfg.buyPrices || {})[wonCharm.rarity] || RARITY_BUY_PRICE[wonCharm.rarity] || 10;
        const coins = Math.ceil(buyPrice * 0.25);
        adjustCoins(req.user.id, coins);
        reward = { type: 'coins', coins, charm: wonCharm };
      } else {
        reward = { type: 'charm', charm: wonCharm };
      }
    }
    const newCoins = (getUserById(req.user.id) || {}).coins || 0;
    res.json({
      ok: true,
      symbols: symbols.map(c => ({ id: c.id, symbol: c.symbol, label: c.label, rarity: c.rarity })),
      win, reward, newCoins,
    });
  });

  // ── Wordle du Codex ───────────────────────────────────────────────────────

  router.get('/wordle/today', requireUserJson, (req, res) => {
    const daily = getWordleDaily();
    if (!daily) return res.json({ ok: false, error: 'no_words' });
    const userGame = getWordleUserGame(req.user.id, daily.date);
    const gameOver = userGame.solved || userGame.guesses.length >= WORDLE_MAX_GUESSES;
    const userStats = getUserById(req.user.id) || {};
    res.json({
      ok: true,
      wordLength: daily.word.length,
      maxGuesses: WORDLE_MAX_GUESSES,
      guesses: userGame.guesses,
      solved: userGame.solved,
      gameOver,
      rewardGranted: userGame.rewardGranted,
      word: gameOver ? daily.word : null,
      sourceTitle: gameOver ? daily.sourceTitle : null,
      sourceId: gameOver ? daily.sourceId : null,
      currentStreak: userStats.wordleCurrentStreak || 0,
      bestStreak: userStats.wordleBestStreak || 0,
    });
  });

  router.post('/wordle/guess', requireUserJson, express.json(), (req, res) => {
    const daily = getWordleDaily();
    if (!daily) return res.json({ ok: false, error: 'no_words' });
    const guess = normalizeWordleWord(String(req.body.guess || ''));
    if (!guess.length) return res.json({ ok: false, error: 'empty_guess' });
    if (guess.length !== daily.word.length) return res.json({ ok: false, error: 'wrong_length', expected: daily.word.length });
    const userGame = getWordleUserGame(req.user.id, daily.date);
    if (userGame.solved || userGame.guesses.length >= WORDLE_MAX_GUESSES) {
      return res.json({ ok: false, error: 'game_over' });
    }
    const feedback = computeWordleFeedback(guess, daily.word);
    const solved = guess === daily.word;
    const newGuesses = [...userGame.guesses, { guess, feedback }];
    const gameOver = solved || newGuesses.length >= WORDLE_MAX_GUESSES;
    const firstEnd = gameOver && !userGame.gameEnded;
    let lootboxGranted = 0;
    let rewardGranted = userGame.rewardGranted;
    if (solved && !userGame.rewardGranted) {
      lootboxGranted = WORDLE_REWARDS[Math.min(newGuesses.length - 1, WORDLE_REWARDS.length - 1)] || 0;
      if (lootboxGranted > 0) grantLootbox(req.user.id, lootboxGranted, 'standard');
      rewardGranted = true;
    }
    saveWordleGuess(req.user.id, daily.date, newGuesses, solved, rewardGranted, gameOver);
    if (firstEnd) updateWordleStreakAndStats(req.user.id, daily.date, solved);
    const lootboxCount = lootboxGranted > 0 ? getLootboxCount(req.user.id) : null;
    const freshStats = gameOver ? (getUserById(req.user.id) || {}) : null;
    res.json({
      ok: true, feedback, solved, guessCount: newGuesses.length, gameOver,
      lootboxGranted, lootboxCount,
      word: gameOver ? daily.word : null,
      sourceTitle: gameOver ? daily.sourceTitle : null,
      sourceId: gameOver ? daily.sourceId : null,
      currentStreak: freshStats ? (freshStats.wordleCurrentStreak || 0) : null,
      bestStreak:    freshStats ? (freshStats.wordleBestStreak    || 0) : null,
    });
  });

  // ── Jeu de cartes — personnages disponibles ──────────────────────────────
  router.get('/card-game/personnages', requireUserJson, (req, res) => {
    const cards = getUserPersonnageCards(req.user.id).map(p => ({
      ...p,
      id: p.protagonisteId,
      thumb: p.thumb ? thumbUrl(p.thumb) : null,
    }));
    res.json({ ok: true, personnages: cards });
  });

  // ── Jeu de cartes — état de la session active ─────────────────────────
  router.get('/card-game/state', requireUserJson, (req, res) => {
    const session = getActiveCardGameSession(req.user.id);
    res.json({ ok: true, session: session || null });
  });

  // ── Jeu de cartes — démarrer une partie ───────────────────────────────
  router.post('/card-game/start', requireUserJson, express.json(), (req, res) => {
    const userId = req.user.id;

    // Abandonner toute session active existante
    const existing = getActiveCardGameSession(userId);
    if (existing) updateCardGameSession(existing.id, existing.state, 'abandoned');

    const { personnageId } = req.body;
    if (!personnageId) return res.json({ ok: false, error: 'Personnage requis' });

    // Vérifier que le joueur possède ce personnage
    const userPersonnages = getUserPersonnageCards(userId);
    const rawPersonnage = userPersonnages.find(p => p.protagonisteId === Number(personnageId));
    if (!rawPersonnage) return res.json({ ok: false, error: 'Personnage non possédé' });

    const playerPersonnage = {
      ...rawPersonnage,
      id: rawPersonnage.protagonisteId,
      name: rawPersonnage.title,
      thumb: rawPersonnage.thumb ? thumbUrl(rawPersonnage.thumb) : null,
    };

    const aiPersonnage = getAICardGamePersonnage();
    if (!aiPersonnage) return res.json({ ok: false, error: 'Aucun personnage IA disponible' });
    aiPersonnage.thumb = aiPersonnage.thumb ? thumbUrl(aiPersonnage.thumb) : null;

    // Decks
    let playerDeck = getPlayerCardGameDeck(userId).map(c => ({
      ...c, thumb: c.thumb ? thumbUrl(c.thumb) : null,
    }));
    // Si le joueur a moins de 5 cartes jouables, on complète avec des cartes publiques
    if (playerDeck.length < 5) {
      const extra = getAICardGameDeck().map(c => ({ ...c, thumb: c.thumb ? thumbUrl(c.thumb) : null }));
      playerDeck = [...playerDeck, ...extra].slice(0, 20);
    }

    const aiDeck = getAICardGameDeck().map(c => ({ ...c, thumb: c.thumb ? thumbUrl(c.thumb) : null }));

    const state = createGameState(playerPersonnage, playerDeck, aiPersonnage, aiDeck);

    // Si l'IA commence, on joue son premier tour immédiatement
    if (state.activePlayer === 1) {
      const r = runAITurn(state, 1);
      if (r.victory) {
        const sid = createCardGameSession(userId, state);
        updateCardGameSession(sid, state, 'lost', 1);
        return res.json({ ok: true, sessionId: sid, state, status: 'lost' });
      }
    }

    const sessionId = createCardGameSession(userId, state);
    res.json({ ok: true, sessionId, state, status: 'active' });
  });

  // ── Jeu de cartes — action en partie ─────────────────────────────────
  router.post('/card-game/action', requireUserJson, express.json(), (req, res) => {
    const userId  = req.user.id;
    const session = getActiveCardGameSession(userId);
    if (!session) return res.json({ ok: false, error: 'Pas de partie en cours' });

    const state  = session.state;
    const { action } = req.body;

    if (action === 'abandon') {
      updateCardGameSession(session.id, state, 'abandoned');
      return res.json({ ok: true, state, status: 'abandoned' });
    }

    // Player = index 0, IA = index 1
    if (state.activePlayer !== 0)
      return res.json({ ok: false, error: 'Ce n\'est pas votre tour' });

    let result;
    switch (action) {
      case 'play_card':
        result = playCard(state, 0, req.body.cardKey, req.body.zone);
        break;
      case 'attack_personnage':
        result = attackWithPersonnage(state, 0, req.body.actionType);
        break;
      case 'attack_card':
        result = attackWithCard(state, 0, req.body.slotId);
        break;
      case 'end_turn': {
        result = endTurn(state);
        if (result.ok) {
          // Tour de l'IA
          const aiResult = runAITurn(state, 1);
          const aiVictory = aiResult.victory || state.players[0].extase >= VICTORY_EXTASE;
          const playerVictory = state.players[1].extase >= VICTORY_EXTASE;
          if (playerVictory) {
            updateCardGameSession(session.id, state, 'won', 0);
            return res.json({ ok: true, state, status: 'won', message: 'Victoire !' });
          }
          if (aiVictory) {
            updateCardGameSession(session.id, state, 'lost', 1);
            return res.json({ ok: true, state, status: 'lost', message: 'Défaite...' });
          }
        }
        break;
      }
      default:
        return res.json({ ok: false, error: 'Action inconnue' });
    }

    if (!result || !result.ok) return res.json({ ok: false, error: (result && result.error) || 'Erreur' });

    // Vérifier victoire après action
    if (state.players[1].extase >= VICTORY_EXTASE) {
      updateCardGameSession(session.id, state, 'won', 0);
      return res.json({ ok: true, state, status: 'won', message: 'L\'adversaire atteint l\'extase !' });
    }
    if (state.players[0].extase >= VICTORY_EXTASE) {
      updateCardGameSession(session.id, state, 'lost', 1);
      return res.json({ ok: true, state, status: 'lost', message: 'Vous avez atteint l\'extase...' });
    }

    updateCardGameSession(session.id, state);
    res.json({ ok: true, state, status: 'active' });
  });

  return router;
}

module.exports = buildArcadeRouter;
