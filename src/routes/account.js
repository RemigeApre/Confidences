const express = require("express");

// La page "Mon compte" a été fusionnée dans /favoris.
// Ce router redirige toutes les routes /compte/* vers /favoris.
function buildAccountRouter(_config) {
  const router = express.Router();
  router.use((req, res) => res.redirect(301, "/favoris"));
  return router;
}

module.exports = buildAccountRouter;
