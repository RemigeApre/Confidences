const express = require("express");
const { requireUser, requireAdmin } = require("../auth");
const db = require("../db");

function buildCustomQuizRouter(config) {
  const router = express.Router();

  // Hub
  router.get("/", requireUser, (req, res) => {
    const all = db.listCustomQuizzes();
    const userId = req.user.id;
    const completedIds = new Set(
      db.db.prepare(`SELECT quiz_id FROM custom_quiz_answers WHERE user_id=? AND completed=1`).all(userId).map(r => r.quiz_id)
    );
    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 86400;
    const featured = all.filter(q => q.featured);
    const newest   = all.filter(q => q.created_at >= weekAgo).slice(0, 10);
    const updated  = all.filter(q => q.updated_at > q.created_at && q.updated_at >= weekAgo).slice(0, 10);
    const notDone  = all.filter(q => !completedIds.has(q.id)).slice(0, 10);
    res.render("quiz-home", { config, featured, newest, updated, notDone, all, completedIds });
  });

  // Créer (admin)
  router.get("/new", requireAdmin, (req, res) => {
    const prefill = {
      title: String(req.query.title || "").slice(0, 200),
      description: String(req.query.desc || "").slice(0, 2000)
    };
    res.render("quiz-form", { config, quiz: null, questions: [], parts: [], prefill });
  });
  router.post("/new", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const title = String(req.body.title || "").slice(0, 200).trim();
    if (!title) return res.redirect("/quizz/new");
    const desc = String(req.body.description || "").slice(0, 2000).trim();
    const id = db.createCustomQuiz(title, desc);
    res.redirect(`/quizz/${id}/edit`);
  });

  // Éditer (admin)
  router.get("/:id/edit", requireAdmin, (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.redirect("/quizz");
    const parts = db.getQuizParts(quiz.id);
    const questions = db.getCustomQuizQuestions(quiz.id);
    questions.forEach(q => { try { q.options = JSON.parse(q.options); } catch { q.options = []; } });
    res.render("quiz-form", { config, quiz, questions, parts });
  });
  router.post("/:id/update", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.redirect("/quizz");
    const title = String(req.body.title || "").slice(0, 200).trim();
    const desc  = String(req.body.description || "").slice(0, 2000).trim();
    const featured = req.body.featured === "1" ? 1 : 0;
    db.updateCustomQuiz(quiz.id, title || quiz.title, desc, featured);
    res.redirect(`/quizz/${quiz.id}`);
  });
  router.post("/:id/delete", requireAdmin, (req, res) => {
    db.deleteCustomQuiz(req.params.id);
    res.redirect("/quizz");
  });

  // ── Parties ──────────────────────────────────────────────────────────────
  router.post("/:id/parts", requireAdmin, express.json(), (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.status(404).json({ ok: false });
    const title = String(req.body.title || "").slice(0, 200).trim();
    if (!title) return res.status(400).json({ ok: false });
    const existing = db.getQuizParts(quiz.id);
    const partId = db.createQuizPart(quiz.id, title, existing.length);
    res.json({ ok: true, partId, parts: db.getQuizParts(quiz.id) });
  });
  router.post("/:id/parts/:pid/update", requireAdmin, express.json(), (req, res) => {
    const title = String(req.body.title || "").slice(0, 200).trim();
    if (!title) return res.status(400).json({ ok: false });
    db.updateQuizPart(req.params.pid, title);
    res.json({ ok: true });
  });
  router.post("/:id/parts/:pid/delete", requireAdmin, express.json(), (req, res) => {
    db.deleteQuizPart(req.params.pid);
    res.json({ ok: true, parts: db.getQuizParts(req.params.id) });
  });

  // ── Questions ─────────────────────────────────────────────────────────────
  router.post("/:id/questions/reorder-all", requireAdmin, express.json(), (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.status(404).json({ ok: false });
    const sections = Array.isArray(req.body.sections) ? req.body.sections : [];
    db.reorderAllQuizQuestions(quiz.id, sections);
    res.json({ ok: true });
  });
  router.post("/:id/questions", requireAdmin, express.json(), (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.status(404).json({ ok: false });
    const text = String(req.body.text || "").slice(0, 500).trim();
    if (!text) return res.status(400).json({ ok: false });
    const type = ["gradient","single","multiple","ranking"].includes(req.body.type) ? req.body.type : "gradient";
    const options = Array.isArray(req.body.options) ? req.body.options.map(o => String(o).slice(0, 200)) : [];
    const partId = req.body.part_id ? Number(req.body.part_id) : null;
    const existing = db.getCustomQuizQuestions(quiz.id);
    db.addCustomQuizQuestion(quiz.id, text, type, options, existing.length, partId);
    const newQs = db.getCustomQuizQuestions(quiz.id);
    newQs.forEach(q => { try { q.options = JSON.parse(q.options); } catch { q.options = []; } });
    const added = newQs[newQs.length - 1];
    res.json({ ok: true, question: added });
  });
  router.post("/:id/questions/:qid/update", requireAdmin, express.json(), (req, res) => {
    const text = String(req.body.text || "").slice(0, 500).trim();
    if (!text) return res.status(400).json({ ok: false });
    const type = ["gradient","single","multiple","ranking"].includes(req.body.type) ? req.body.type : "gradient";
    const options = Array.isArray(req.body.options) ? req.body.options.map(o => String(o).slice(0, 200)) : [];
    db.updateCustomQuizQuestion(req.params.qid, text, type, options);
    const q = db.db.prepare("SELECT * FROM custom_quiz_questions WHERE id=?").get(req.params.qid);
    try { q.options = JSON.parse(q.options); } catch { q.options = []; }
    res.json({ ok: true, question: q });
  });
  router.post("/:id/questions/:qid/delete", requireAdmin, express.json(), (req, res) => {
    db.deleteCustomQuizQuestion(req.params.qid);
    res.json({ ok: true });
  });

  // Helper : construit les étapes (unassigned si non vide, puis parties avec questions)
  function buildSteps(parts, questions) {
    const steps = [];
    const unassigned = questions.filter(q => !q.part_id);
    if (unassigned.length) steps.push({ part: null, questions: unassigned });
    parts.forEach(p => {
      const qs = questions.filter(q => q.part_id === p.id);
      if (qs.length) steps.push({ part: p, questions: qs });
    });
    return steps;
  }

  // Prendre le quizz — étape courante via ?step=N
  router.get("/:id", requireUser, (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.redirect("/quizz");
    const parts = db.getQuizParts(quiz.id);
    const questions = db.getCustomQuizQuestions(quiz.id);
    questions.forEach(q => { try { q.options = JSON.parse(q.options); } catch { q.options = []; } });
    const existing = db.getCustomQuizAnswer(quiz.id, req.user.id);
    const answers = existing ? JSON.parse(existing.answers) : {};
    const steps = buildSteps(parts, questions);
    const completed = existing ? existing.completed : 0;
    if (!steps.length) {
      return res.render("quiz-detail", { config, quiz, steps: [], stepIdx: 0, stepData: null, answers, completed });
    }
    if (req.query.step === "done") {
      return res.render("quiz-detail", { config, quiz, steps, stepIdx: steps.length - 1, stepData: null, answers, completed: 1 });
    }
    let stepIdx = parseInt(req.query.step, 10);
    if (isNaN(stepIdx) || stepIdx < 0) stepIdx = 0;
    if (stepIdx >= steps.length) stepIdx = steps.length - 1;
    res.render("quiz-detail", { config, quiz, steps, stepIdx, stepData: steps[stepIdx], answers, completed });
  });

  // Sauvegarder les réponses de l'étape courante et avancer
  router.post("/:id/answer", requireUser, express.urlencoded({ extended: false }), (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.redirect("/quizz");
    const parts = db.getQuizParts(quiz.id);
    const allQuestions = db.getCustomQuizQuestions(quiz.id);
    const steps = buildSteps(parts, allQuestions);

    // Charger les réponses existantes et fusionner avec les nouvelles
    const existing = db.getCustomQuizAnswer(quiz.id, req.user.id);
    const answers = existing ? JSON.parse(existing.answers) : {};

    // Traiter uniquement les questions de l'étape envoyée
    const stepIdx = parseInt(req.body._step, 10) || 0;
    const stepQs = (steps[stepIdx] ? steps[stepIdx].questions : allQuestions);
    stepQs.forEach(q => {
      if (q.type === "multiple") {
        answers[q.id] = Object.keys(req.body)
          .filter(k => k === `q_${q.id}[]` || k.startsWith(`q_${q.id}_`))
          .flatMap(k => Array.isArray(req.body[k]) ? req.body[k] : [req.body[k]]);
      } else if (q.type === "ranking") {
        const v = req.body[`q_${q.id}_rank`];
        answers[q.id] = v ? v.split(',').filter(Boolean).map(Number) : [];
      } else {
        const v = req.body[`q_${q.id}`];
        if (v !== undefined) answers[q.id] = v;
      }
    });

    const isLast = stepIdx >= steps.length - 1;
    const complete = req.body.complete === "1" && isLast ? 1 : (existing ? existing.completed : 0);
    db.saveCustomQuizAnswer(quiz.id, req.user.id, answers, complete);

    if (req.body.complete === "1" && isLast) return res.redirect(`/quizz/${quiz.id}?step=done`);
    const nextStep = isLast ? stepIdx : stepIdx + 1;
    res.redirect(`/quizz/${quiz.id}?step=${nextStep}`);
  });

  return router;
}

module.exports = buildCustomQuizRouter;
