// Envoi de mail (réinitialisation de mot de passe) via un SMTP générique —
// IONOS ou n'importe quel autre fournisseur, configuré uniquement par
// variables d'environnement (jamais d'identifiants en dur dans le code).
// Si SMTP_HOST n'est pas renseigné, on logge un avertissement et on ne tente
// rien : évite un crash en dev/local où aucun mail ne doit réellement partir.
const nodemailer = require("nodemailer");

let transporter = null;
let warned = false;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) {
    if (!warned) {
      console.warn("[mailer] SMTP_HOST manquant dans .env : aucun mail ne sera envoyé.");
      warned = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_PORT === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

// Renvoie une Promise<boolean> (true si envoyé, false si SMTP non configuré
// ou en erreur — on ne propage jamais l'erreur, l'appelant décide quoi dire
// à l'utilisateur dans tous les cas).
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (e) {
    console.error("[mailer] Échec d'envoi :", e.message);
    return false;
  }
}

module.exports = { sendMail };
