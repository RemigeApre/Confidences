const express = require("express");
const { requireUser, requireAdmin } = require("../auth");
const db = require("../db");

// ── Scoring ──────────────────────────────────────────────────────────────────

function computeProfilResult(questions, answers, axes) {
  const axisScores = {};
  const positionAxes = axes.filter(a => a.is_position);
  const normalAxes = axes.filter(a => !a.is_position);

  for (const axis of normalAxes) {
    const qs = questions.filter(q => q.axis_id === axis.id);
    let sum = 0, count = 0;
    for (const q of qs) {
      const val = Number(answers[q.id] ?? 3);
      const v = val - 1; // 0-4
      sum += q.pole === 1 ? v : (4 - v);
      count++;
    }
    axisScores[axis.slug] = count > 0 ? sum / (count * 4) : 0.5;
  }

  const menagAxis = positionAxes[0];
  if (menagAxis) {
    const qs = questions.filter(q => q.axis_id === menagAxis.id);
    const pole1Qs = qs.filter(q => q.pole === 1);
    const pole2Qs = qs.filter(q => q.pole === 2);
    const menScore = pole1Qs.reduce((s, q) => s + ((Number(answers[q.id] ?? 3) - 1)), 0) / (pole1Qs.length * 4 || 1);
    const laisserScore = pole2Qs.reduce((s, q) => s + ((Number(answers[q.id] ?? 3) - 1)), 0) / (pole2Qs.length * 4 || 1);
    axisScores['position_mener'] = menScore;
    axisScores['position_laisser'] = laisserScore;
  }

  const code = normalAxes.map(axis => {
    const pct = axisScores[axis.slug] ?? 0.5;
    return pct >= 0.5 ? axis.pole1_code : axis.pole2_code;
  }).join('');

  const men = axisScores['position_mener'] ?? 0.5;
  const lai = axisScores['position_laisser'] ?? 0.5;
  let position = 'SW';
  if (men >= 0.6 && lai < 0.5) position = 'D';
  else if (lai >= 0.6 && men < 0.5) position = 'S';
  else if (men < 0.4 && lai < 0.4) position = 'SW';

  return { code, position, scores: axisScores };
}

// ── Router ───────────────────────────────────────────────────────────────────

function buildProfilQuizRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  // Hub
  router.get("/", (req, res) => {
    const types = db.listProfilQuizTypes();
    const userId = req.user.id;
    const attemptsMap = {};
    types.forEach(t => {
      attemptsMap[t.id] = db.listProfilQuizAttempts(t.id, userId);
    });
    res.render("profil-quiz-home", { config, types, attemptsMap });
  });

  // Page des personnalités
  router.get("/personnalites", (req, res) => {
    const types = db.listProfilQuizTypes();
    const type = types[0];
    if (!type) return res.redirect("/quizz/profil");
    const axes = db.getProfilQuizAxes(type.id);
    const archetypes = db.getProfilQuizArchetypes(type.id);
    res.render("profil-quiz-personnalites", { config, type, axes, archetypes });
  });

  // Passer le test
  router.get("/:slug", (req, res) => {
    const type = db.getProfilQuizType(req.params.slug);
    if (!type) return res.redirect("/quizz/profil");
    const axes = db.getProfilQuizAxes(type.id);
    const questions = db.getProfilQuizQuestions(type.id);
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    res.render("profil-quiz-take", { config, type, axes, questions: shuffled });
  });

  // Soumettre
  router.post("/:slug", express.json(), (req, res) => {
    const type = db.getProfilQuizType(req.params.slug);
    if (!type) return res.status(404).json({ ok: false });
    const axes = db.getProfilQuizAxes(type.id);
    const questions = db.getProfilQuizQuestions(type.id);
    const answers = req.body.answers || {};
    const { code, position, scores } = computeProfilResult(questions, answers, axes);
    const archetypes = db.getProfilQuizArchetypes(type.id);
    const archetype = archetypes.find(a => a.code === code);
    const attemptId = db.saveProfilQuizAttempt({
      typeId: type.id,
      userId: req.user.id,
      answers,
      scores,
      resultCode: code,
      resultPosition: position,
      resultArchetype: archetype ? archetype.name : code,
      completed: 1
    });
    res.json({ ok: true, attemptId, code, position, archetype: archetype || null });
  });

  // Résultat
  router.get("/:slug/result/:attemptId", (req, res) => {
    const type = db.getProfilQuizType(req.params.slug);
    if (!type) return res.redirect("/quizz/profil");
    const attempt = db.getProfilQuizAttempt(Number(req.params.attemptId), req.user.id);
    if (!attempt || attempt.type_id !== type.id) return res.redirect("/quizz/profil");
    const axes = db.getProfilQuizAxes(type.id);
    const archetypes = db.getProfilQuizArchetypes(type.id);
    const archetype = archetypes.find(a => a.code === attempt.result_code);
    let scores = {};
    try { scores = JSON.parse(attempt.scores || '{}'); } catch {}
    const history = db.listProfilQuizAttempts(type.id, req.user.id);
    res.render("profil-quiz-result", { config, type, attempt, axes, archetype, archetypes, scores, history });
  });

  // Historique
  router.get("/:slug/history", (req, res) => {
    const type = db.getProfilQuizType(req.params.slug);
    if (!type) return res.redirect("/quizz/profil");
    const attempts = db.listProfilQuizAttempts(type.id, req.user.id);
    res.render("profil-quiz-history", { config, type, attempts });
  });

  // Admin : éditer questions
  router.get("/:slug/admin", requireAdmin, (req, res) => {
    const type = db.getProfilQuizType(req.params.slug);
    if (!type) return res.redirect("/quizz/profil");
    const axes = db.getProfilQuizAxes(type.id);
    const questions = db.getProfilQuizQuestions(type.id);
    const archetypes = db.getProfilQuizArchetypes(type.id);
    res.render("profil-quiz-admin", { config, type, axes, questions, archetypes });
  });

  // Admin: update question
  router.post("/:slug/admin/question/:qid", requireAdmin, express.json(), (req, res) => {
    const type = db.getProfilQuizType(req.params.slug);
    if (!type) return res.json({ ok: false });
    const { text, axis_id, pole } = req.body;
    db.updateProfilQuizQuestion(Number(req.params.qid), { text, axisId: Number(axis_id), pole: Number(pole), sortOrder: 0 });
    res.json({ ok: true });
  });

  // Admin: add question
  router.post("/:slug/admin/question", requireAdmin, express.json(), (req, res) => {
    const type = db.getProfilQuizType(req.params.slug);
    if (!type) return res.json({ ok: false });
    const { text, axis_id, pole } = req.body;
    const id = db.createProfilQuizQuestion({ typeId: type.id, axisId: Number(axis_id), pole: Number(pole), text, sortOrder: 0 });
    res.json({ ok: true, id });
  });

  // Admin: delete question
  router.delete("/:slug/admin/question/:qid", requireAdmin, (req, res) => {
    db.deleteProfilQuizQuestion(Number(req.params.qid));
    res.json({ ok: true });
  });

  // Admin: update archetype
  router.post("/:slug/admin/archetype/:aid", requireAdmin, express.json(), (req, res) => {
    const { code, name, world, description } = req.body;
    db.updateProfilQuizArchetype(Number(req.params.aid), { code, name, world, description });
    res.json({ ok: true });
  });

  // Admin: add archetype
  router.post("/:slug/admin/archetype", requireAdmin, express.json(), (req, res) => {
    const type = db.getProfilQuizType(req.params.slug);
    if (!type) return res.json({ ok: false });
    const { code, name, world, description } = req.body;
    const id = db.createProfilQuizArchetype({ typeId: type.id, code, name, world, description });
    res.json({ ok: true, id });
  });

  // Admin: delete archetype
  router.delete("/:slug/admin/archetype/:aid", requireAdmin, (req, res) => {
    db.deleteProfilQuizArchetype(Number(req.params.aid));
    res.json({ ok: true });
  });

  return router;
}

module.exports = buildProfilQuizRouter;
