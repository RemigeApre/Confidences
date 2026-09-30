const express = require('express');
const router = express.Router();
const { requireUser } = require('../auth');
const { listAllParodiesWithCounts, getContentByParody, listAllParodies, listAllSubParodies, normalizeParody } = require('../db');

function buildParodiesRouter(config) {
  router.use(requireUser);

  router.get('/autocomplete', function(req, res) {
    var q = String(req.query.q || '').trim();
    var main = String(req.query.main || '').trim();
    if (main) {
      res.json(listAllSubParodies(main, q || undefined));
    } else {
      var all = listAllParodies();
      if (q) { var ql = q.toLowerCase(); all = all.filter(function(p) { return p.toLowerCase().indexOf(ql) !== -1; }); }
      res.json(all.slice(0, 12));
    }
  });

  router.get('/', function(req, res) {
    var parodies = listAllParodiesWithCounts();
    res.render('parodies', { config, parodies, currentUser: req.user || null });
  });

  router.get('/:name/:sub', function(req, res) {
    var parody = decodeURIComponent(req.params.name);
    var subParody = decodeURIComponent(req.params.sub);
    var content = getContentByParody(parody, subParody);
    res.render('parody-detail', { config, parody, subParody, subs: [], content, currentUser: req.user || null });
  });

  router.get('/:name', function(req, res) {
    var parody = decodeURIComponent(req.params.name);
    var content = getContentByParody(parody);
    var allWithCounts = listAllParodiesWithCounts();
    var entry = allWithCounts.find(function(e) { return e.parody === parody; });
    var subs = entry ? entry.subs : [];
    res.render('parody-detail', { config, parody, subParody: null, subs, content, currentUser: req.user || null });
  });

  return router;
}

module.exports = buildParodiesRouter;
