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
    res.render("quiz-form", { config, quiz: null, questions: [], parts: [] });
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
    res.redirect(`/quizz/${quiz.id}/edit`);
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
    const type = ["gradient","single","multiple"].includes(req.body.type) ? req.body.type : "gradient";
    const options = Array.isArray(req.body.options) ? req.body.options.map(o => String(o).slice(0, 200)) : [];
    const partId = req.body.part_id ? Number(req.body.part_id) : null;
    const existing = db.getCustomQuizQuestions(quiz.id);
    db.addCustomQuizQuestion(quiz.id, text, type, options, existing.length, partId);
    const newQs = db.getCustomQuizQuestions(quiz.id);
    newQs.forEach(q => { try { q.options = JSON.parse(q.options); } catch { q.options = []; } });
    const added = newQs[newQs.length - 1];
    res.json({ ok: true, question: added });
  });
  router.post("/:id/questions/:qid/delete", requireAdmin, express.json(), (req, res) => {
    db.deleteCustomQuizQuestion(req.params.qid);
    res.json({ ok: true });
  });

  // Prendre le quizz
  router.get("/:id", requireUser, (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.redirect("/quizz");
    const parts = db.getQuizParts(quiz.id);
    const questions = db.getCustomQuizQuestions(quiz.id);
    questions.forEach(q => { try { q.options = JSON.parse(q.options); } catch { q.options = []; } });
    const existing = db.getCustomQuizAnswer(quiz.id, req.user.id);
    const answers = existing ? JSON.parse(existing.answers) : {};
    res.render("quiz-detail", { config, quiz, parts, questions, answers, completed: existing ? existing.completed : 0 });
  });

  // Sauvegarder les réponses
  router.post("/:id/answer", requireUser, express.urlencoded({ extended: false }), (req, res) => {
    const quiz = db.getCustomQuiz(req.params.id);
    if (!quiz) return res.redirect("/quizz");
    const questions = db.getCustomQuizQuestions(quiz.id);
    const answers = {};
    questions.forEach(q => {
      if (q.type === "multiple") {
        answers[q.id] = Object.keys(req.body)
          .filter(k => k === `q_${q.id}[]` || k.startsWith(`q_${q.id}_`))
          .flatMap(k => Array.isArray(req.body[k]) ? req.body[k] : [req.body[k]]);
      } else if (q.type === "ranking") {
        const v = req.body[`q_${q.id}_rank`];
        answers[q.id] = v ? v.split(',').filter(Boolean).map(Number) : [];
      } else {
        const v = req.body[`q_${q.id}`];
        answers[q.id] = v !== undefined ? v : null;
      }
    });
    const completed = req.body.complete === "1" ? 1 : 0;
    db.saveCustomQuizAnswer(quiz.id, req.user.id, answers, completed);
    res.redirect(`/quizz/${quiz.id}`);
  });

  return router;
}

module.exports = buildCustomQuizRouter;
