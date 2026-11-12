"use strict";
// Récap mail quotidien : prévient un profil si un message ou un coffre
// (lootbox) reste non vu depuis plus de 24h — voir db.js#findUsersNeedingRecap
// pour la condition exacte, et le lien de désinscription en bas du mail
// (GET /notifications/desinscription), réversible depuis /favoris/parametres.
const { findUsersNeedingRecap, touchLastRecapSent, ensureRecapUnsubToken } = require("./db");
const { sendMail } = require("./mailer");

const SITE_URL = process.env.SITE_URL || "https://confidences.dhuis.com";

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendRecapEmails() {
  const users = findUsersNeedingRecap();
  for (const u of users) {
    const token = ensureRecapUnsubToken(u.userId);
    const unsubUrl = SITE_URL + "/notifications/desinscription?token=" + token;

    const parts = [];
    if (u.unreadCount > 0) parts.push(u.unreadCount + (u.unreadCount > 1 ? " messages non lus" : " message non lu"));
    if (u.giftCount > 0) parts.push(u.giftCount + (u.giftCount > 1 ? " coffres à ouvrir" : " coffre à ouvrir"));
    const summary = parts.join(" et ");

    const text = "Bonjour " + u.displayName + ",\n\n"
      + "Vous avez " + summary + " depuis plus d'une journée sur Confidences.\n\n"
      + SITE_URL + "/favoris\n\n"
      + "---\n"
      + "Vous ne souhaitez pas recevoir ce type de mail ? Cliquez ici : " + unsubUrl;

    const html = "<p>Bonjour " + escapeHtml(u.displayName) + ",</p>"
      + "<p>Vous avez <strong>" + escapeHtml(summary) + "</strong> depuis plus d'une journée sur Confidences.</p>"
      + "<p><a href=\"" + SITE_URL + "/favoris\">Voir mon profil</a></p>"
      + "<hr style=\"border:none;border-top:1px solid #333;margin:1.5rem 0\">"
      + "<p style=\"font-size:.8rem;color:#999\">Vous ne souhaitez pas recevoir ce type de mail ? "
      + "<a href=\"" + unsubUrl + "\">Cliquez ici</a>.</p>";

    const sent = await sendMail({ to: u.email, subject: "Un petit récap — Confidences", text, html });
    if (sent) touchLastRecapSent(u.userId);
  }
}

module.exports = { sendRecapEmails };
