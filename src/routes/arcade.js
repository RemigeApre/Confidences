const express = require('express');
const { requireUserJson } = require('../auth');
const {
  getMemoryImages, getMemoryTags, grantLootbox, getLootboxCount,
  updateArcadeStats, getUserById,
  listCharms, adjustCoins, grantCharmDirect,
  getLootboxConfig, RARITY_BUY_PRICE,
  getWordleDaily, getWordleUserGame, saveWordleGuess, normalizeWordleWord,
} = require('../db');
const { thumbUrl } = require('../thumbs');

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
    res.json({
      ok: true,
      wordLength: daily.word.length,
      maxGuesses: WORDLE_MAX_GUESSES,
      guesses: userGame.guesses,
      solved: userGame.solved,
      gameOver,
      word: gameOver ? daily.word : null,
      sourceTitle: gameOver ? daily.sourceTitle : null,
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
    let lootboxGranted = 0;
    let rewardGranted = userGame.rewardGranted;
    if (solved && !userGame.rewardGranted) {
      lootboxGranted = WORDLE_REWARDS[Math.min(newGuesses.length - 1, WORDLE_REWARDS.length - 1)] || 0;
      if (lootboxGranted > 0) grantLootbox(req.user.id, lootboxGranted, 'standard');
      rewardGranted = true;
    }
    saveWordleGuess(req.user.id, daily.date, newGuesses, solved, rewardGranted);
    const lootboxCount = lootboxGranted > 0 ? getLootboxCount(req.user.id) : null;
    res.json({
      ok: true, feedback, solved, guessCount: newGuesses.length, gameOver,
      lootboxGranted, lootboxCount,
      word: gameOver ? daily.word : null,
      sourceTitle: gameOver ? daily.sourceTitle : null,
    });
  });

  return router;
}

module.exports = buildArcadeRouter;
