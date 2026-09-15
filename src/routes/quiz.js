const express = require("express");
const { flattenItems, flattenItemsRaw, computeScores, slugify } = require("../scoring");
const {
  insertSubmission,
  getAttempt,
  saveAttempt,
  getLinkedQuestionIds,
} = require("../db");
const csvLog = require("../csvLog");
const { requireUser, requireUserJson, tokenForUser } = require("../auth");

function parseSectionSubmission(config, section, body) {
  if (section.type === "matrix") {
    const rawItems = flattenItemsRaw(section);
    const matrix = {};
    rawItems.forEach((item) => {
      if (item.variants) {
        matrix[item.id] = {};
        item.variants.forEach((variantLabel) => {
          const vKey = slugify(variantLabel);
          const levels = {};
          config.levels.forEach((lvl) => {
            const v = Number(body[`m_${item.id}_${vKey}_${lvl.key}`]);
            levels[lvl.key] = Number.isNaN(v) ? 1 : v;
          });
          matrix[item.id][vKey] = levels;
        });
      } else {
        const levels = {};
        config.levels.forEach((lvl) => {
          const v = Number(body[`m_${item.id}_${lvl.key}`]);
          levels[lvl.key] = Number.isNaN(v) ? 1 : v;
        });
        matrix[item.id] = levels;
      }
    });

    const rankings = {};
    const rankingsChecked = {};
    for (const r of section.rankings || []) {
      const raw = body[`ranking_${r.id}`];
      rankings[r.id] = raw
        ? String(raw).split(",").map(Number)
        : r.items.map((_, i) => i);
      if (r.checkable) {
        const rawChecked = body[`ranking_${r.id}_checked`];
        rankingsChecked[r.id] = rawChecked
          ? String(rawChecked).split(",").filter(Boolean).map(Number)
          : [];
      }
    }

    const spectrums = {};
    for (const sp of section.spectrums || []) {
      const v = Number(body[`spectrum_${sp.id}`]);
      spectrums[sp.id] = Number.isNaN(v) ? 3 : v;
    }

    const multiselects = {};
    for (const ms of section.multiselects || []) {
      multiselects[ms.id] = ms.options
        .map((_, i) => i)
        .filter((i) => body[`ms_${ms.id}_${i}`] === "on" || body[`ms_${ms.id}_${i}`] === "1");
    }

    return { matrix, rankings, rankingsChecked, spectrums, multiselects };
  }

  if (section.type === "profile") {
    const fields = {};
    for (const f of section.fields) {
      fields[f.id] = body[`field_${f.id}`];
    }
    const rankings = {};
    const rankingsChecked = {};
    for (const r of section.rankings || []) {
      const raw = body[`ranking_${r.id}`];
      rankings[r.id] = raw
        ? String(raw).split(",").map(Number)
        : r.items.map((_, i) => i);
      if (r.checkable) {
        const rawChecked = body[`ranking_${r.id}_checked`];
        rankingsChecked[r.id] = rawChecked
          ? String(rawChecked).split(",").filter(Boolean).map(Number)
          : [];
      }
    }
    return { fields, rankings, rankingsChecked };
  }

  return {};
}

function applySectionSubmission(config, attempt, section, idx, body, token) {
  attempt.data[section.key] = parseSectionSubmission(config, section, body);

  // __bookmarks.favorite n'est plus alimenté depuis le quizz (l'étoile
  // favori a été retirée au profit du lien wiki), mais on garde la
  // structure et les données déjà enregistrées pour ne rien casser côté
  // admin/résultats.
  attempt.data.__bookmarks = Object.assign(
    { favorite: {} },
    attempt.data.__bookmarks || {}
  );
  attempt.data.__doneGroups = attempt.data.__doneGroups || {};

  if (section.type === "matrix") {
    section.groups.forEach((group) => {
      const gkey = `${section.key}:${group.id}`;
      if (body[`done_${group.id}`] === "1") attempt.data.__doneGroups[gkey] = true;
      else delete attempt.data.__doneGroups[gkey];
    });
  }

  // Filet de securite : chaque sauvegarde (soumission finale ou autosave)
  // part aussi dans un CSV en texte brut, independant de SQLite.
  csvLog.append("section_save", token, section.key, idx, attempt.data[section.key]);
}

function buildQuizRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    if (!req.user) return res.redirect("/wiki");
    // Bouton "Quizz" de l'accueil : reprend là où le profil s'était arrêté
    // plutôt que de toujours renvoyer à la première section.
    const attempt = getAttempt(tokenForUser(req.user));
    const quizIdx = attempt
      ? Math.min(Math.max(attempt.nextSection, 0), config.sections.length - 1)
      : 0;
    res.render("home", { config, quizIdx });
  });

  router.get("/section/:idx", requireUser, (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.redirect("/");
    }

    const attempt = getAttempt(tokenForUser(req.user)) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];
    const existing = attempt.data[section.key] || null;

    // Pour marquer d'un coup d'œil les questions déjà liées à une page
    // wiki, sans un aller-retour par question.
    const linkedQuestions = {};
    getLinkedQuestionIds(section.key).forEach((qid) => { linkedQuestions[qid] = true; });

    res.render("section", {
      config,
      section,
      slugify,
      idx,
      total: config.sections.length,
      existing,
      doneGroups: attempt.data.__doneGroups || {},
      linkedQuestions,
    });
  });

  router.get("/results", requireUser, (req, res) => {
    const attempt = getAttempt(tokenForUser(req.user)) || { data: {}, nextSection: 0 };
    const scores = computeScores(config, attempt.data);
    res.render("result", {
      config,
      scores,
      answers: attempt.data,
      flattenItems,
      flattenItemsRaw,
      slugify,
      isFinal: false,
      resumeIdx: Math.min(Math.max(attempt.nextSection, 0), config.sections.length - 1),
    });
  });

  router.post("/section/:idx", requireUser, (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.redirect("/");
    }

    const token = tokenForUser(req.user);
    const attempt = getAttempt(token) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];

    applySectionSubmission(config, attempt, section, idx, req.body, token);

    const nextIdx = idx + 1;
    attempt.nextSection = Math.max(attempt.nextSection, Math.min(nextIdx, config.sections.length - 1));
    saveAttempt(token, attempt.data, attempt.nextSection);

    if (nextIdx >= config.sections.length) {
      // On garde la progression (elle reste modifiable a volonte), on
      // enregistre juste un instantane du score dans l'historique.
      const scores = computeScores(config, attempt.data);
      insertSubmission(req.user.id, attempt.data, scores);
      csvLog.append("complete", token, section.key, idx, { answers: attempt.data, scores });
      return res.render("result", { config, scores, answers: attempt.data, flattenItems, flattenItemsRaw, slugify, isFinal: true });
    }

    res.redirect(`/section/${nextIdx}`);
  });

  // Sauvegarde silencieuse a chaque modification (select, coche, favori...),
  // sans avancer la progression ni finaliser le quiz : evite de perdre une
  // reponse si on ferme l'onglet ou qu'on repart vers une autre section
  // sans avoir clique sur le bouton "Section suivante".
  router.post("/section/:idx/autosave", requireUserJson, (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.status(400).json({ ok: false });
    }

    const token = tokenForUser(req.user);
    const attempt = getAttempt(token) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];

    applySectionSubmission(config, attempt, section, idx, req.body, token);
    saveAttempt(token, attempt.data, attempt.nextSection);

    res.json({ ok: true });
  });

  return router;
}

module.exports = buildQuizRouter;
