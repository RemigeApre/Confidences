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

// ── Template HTML minimaliste ─────────────────────────────────────────────
// Génère un HTML d'email compatible tous clients (pas de style block, tout
// inline). opts : { title, body (HTML), cta?, ctaUrl?, siteName?, siteUrl? }
function emailHtml({ title, body, cta, ctaUrl, siteName = 'Confidences', siteUrl = '', unsubscribeUrl = '' }) {
  const btn = cta && ctaUrl
    ? `<tr><td style="padding:28px 0 8px;text-align:center">` +
      `<a href="${ctaUrl}" style="display:inline-block;background:#5b4fcf;color:#fff;` +
      `text-decoration:none;font-size:14px;font-weight:600;padding:11px 28px;border-radius:7px;` +
      `letter-spacing:.02em">${cta}</a></td></tr>`
    : '';
  const unsub = unsubscribeUrl
    ? `&nbsp;&middot;&nbsp;<a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:none">Se d&eacute;sinscrire</a>`
    : '';
  const footer = siteUrl
    ? `<tr><td style="padding:24px 0 0;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb">` +
      `<a href="${siteUrl}" style="color:#9ca3af;text-decoration:none">${siteName}</a>${unsub}</td></tr>`
    : `<tr><td style="padding:24px 0 0;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb">${siteName}${unsub}</td></tr>`;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>` +
    `<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:36px 16px">` +
    `<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;padding:36px 32px">` +
    `<tr><td style="padding-bottom:20px;border-bottom:1px solid #e5e7eb">` +
    `<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7280">${siteName}</span>` +
    `</td></tr>` +
    `<tr><td style="padding-top:24px;padding-bottom:8px">` +
    `<h1 style="margin:0;font-size:20px;font-weight:700;color:#111827;line-height:1.3">${title}</h1>` +
    `</td></tr>` +
    `<tr><td style="padding-top:12px;font-size:14px;color:#374151;line-height:1.7">${body}</td></tr>` +
    btn +
    footer +
    `</table></td></tr></table></body></html>`;
}

module.exports = { sendMail, emailHtml };
