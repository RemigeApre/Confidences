"use strict";
// Alerte mail si un message envoyé par un admin reste non lu plus d'1h (hors
// nuit) — voir db.js#findUsersNeedingAdminMessageAlert pour la condition
// exacte. Réutilise le même interrupteur et lien de désinscription que le
// récap quotidien (notify_recap_email, /notifications/desinscription).
const { findUsersNeedingAdminMessageAlert, touchLastAdminMsgAlertSent, ensureRecapUnsubToken } = require("./db");
const { sendMail } = require("./mailer");

const SITE_URL = process.env.SITE_URL || "https://confidences.dhuis.com";

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Pas d'envoi la nuit (22h-8h, heure de Paris), quel que soit le fuseau du
// serveur — on rattrape simplement au prochain passage une fois le jour levé.
function isNightInFrance() {
  const hour = parseInt(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date()),
    10
  );
  return hour >= 22 || hour < 8;
}

async function sendAdminMessageAlerts() {
  if (isNightInFrance()) return;

  const users = findUsersNeedingAdminMessageAlert();
  for (const u of users) {
    const token = ensureRecapUnsubToken(u.userId);
    const unsubUrl = SITE_URL + "/notifications/desinscription?token=" + token;

    const text = "Bonjour " + u.displayName + ",\n\n"
      + "Vous avez un message de l'administration qui attend une réponse depuis plus d'une heure sur Confidences.\n\n"
      + SITE_URL + "/messages\n\n"
      + "---\n"
      + "Vous ne souhaitez pas recevoir ce type de mail ? Cliquez ici : " + unsubUrl;

    const html = "<p>Bonjour " + escapeHtml(u.displayName) + ",</p>"
      + "<p>Vous avez un message de l'administration qui attend une réponse depuis plus d'une heure sur Confidences.</p>"
      + "<p><a href=\"" + SITE_URL + "/messages\">Voir le message</a></p>"
      + "<hr style=\"border:none;border-top:1px solid #333;margin:1.5rem 0\">"
      + "<p style=\"font-size:.8rem;color:#999\">Vous ne souhaitez pas recevoir ce type de mail ? "
      + "<a href=\"" + unsubUrl + "\">Cliquez ici</a>.</p>";

    const sent = await sendMail({ to: u.email, subject: "Message de l'administration en attente — Confidences", text, html });
    if (sent) touchLastAdminMsgAlertSent(u.userId);
  }
}

module.exports = { sendAdminMessageAlerts };
