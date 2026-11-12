"use strict";
const express = require("express");
const {
  requireUser, requireUserJson,
} = require("../auth");
const {
  getMessagesAfter,
  getOrCreateConversation, getConversation, getConversations,
  insertMessage, getMessages, markRead, getUnreadCount, setMessageReaction,
  setConversationPinned, setConversationMuted, markConversationUnread,
  addSharedItem, getSharedItems, removeSharedItem,
  getFriends, getUserById, getFriendshipBetween,
  clearConversation,
  getGalleryImage, getWikiPage, getBdBook,
} = require("../db");
const { thumbUrl } = require("../thumbs");

// ── SSE : clients connectés (userId → Set de response) ───────────────────
const sseClients = new Map();

function pushToUser(userId, event, data) {
  const clients = sseClients.get(userId);
  if (!clients || !clients.size) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch (_) {}
  }
}
module.exports.pushToUser = pushToUser;

// ── Helpers ───────────────────────────────────────────────────────────────

function convPartner(conv, userId) {
  return conv.p1_id === userId ? conv.p2_id : conv.p1_id;
}

// true si userId est bien p1 ou p2 de cette conversation — remplace les 6
// copies du même if(!conv || (conv.p1_id!==uid && conv.p2_id!==uid)) qui
// traînaient dans ce fichier.
function isConvParticipant(conv, userId) {
  return !!conv && (conv.p1_id === userId || conv.p2_id === userId);
}

// Autorise la messagerie entre deux comptes : soit ils sont amis (acceptée),
// soit l'un des deux est admin (l'admin crée les comptes à la main, hors du
// circuit d'invitation/ami automatique — voir db.js#autoFriend). Sans ce
// contrôle, deux comptes non-amis pouvaient s'écrire en devinant un id.
function canMessage(uid, partnerId) {
  if (!partnerId || partnerId === uid) return false;
  const u = getUserById(uid);
  const p = getUserById(partnerId);
  if (!u || !p) return false;
  if (u.isAdmin || p.isAdmin) return true;
  const f = getFriendshipBetween(uid, partnerId);
  return !!(f && f.status === "accepted");
}

// Résout un content_ref {type, id} → {thumb, title, href}, partagé entre la
// popup de la bulle de chat (GET /ref-card) et la page bibliothèque.
function resolveContentRef(type, id) {
  if (type === "image") {
    const img = getGalleryImage(id);
    if (!img) return null;
    const raw = img.imagePaths && img.imagePaths[0];
    return { thumb: raw ? thumbUrl(raw) : null, title: img.title || "", href: "/galerie/" + id };
  }
  if (type === "wiki") {
    const page = getWikiPage(id);
    if (!page) return null;
    const raw = page.imagePaths && page.imagePaths[0];
    return { thumb: raw ? thumbUrl(raw) : null, title: page.title || "", href: "/wiki/" + id };
  }
  if (type === "bd") {
    const book = getBdBook(id);
    if (!book) return null;
    const raw = book.coverPath || (book.imagePaths && book.imagePaths[0]);
    return { thumb: raw ? thumbUrl(raw) : null, title: book.title || "", href: "/bd/" + id };
  }
  return null;
}

// Résout profileImageId (FK vers gallery_images) → une vraie URL de vignette,
// et parse profileImageCrop si besoin. Accepte aussi bien un user "camelCase"
// (getUserById) qu'une ligne SQL brute "snake_case" (getConversations,
// getFriends) — voir partials/msg-avatar.ejs pour le rendu.
function resolveAvatar(src) {
  const imgId = src.profileImageId != null ? src.profileImageId : src.profile_image_id;
  if (!imgId) return { thumb: null, crop: null };
  const img = getGalleryImage(imgId);
  const path = img && img.imagePaths && img.imagePaths[0];
  let crop = src.profileImageCrop !== undefined ? src.profileImageCrop : src.profile_image_crop;
  if (typeof crop === "string") {
    try { crop = JSON.parse(crop); } catch (_) { crop = null; }
  }
  return { thumb: path ? thumbUrl(path) : null, crop: crop || null };
}

// Palette fixe de réactions autorisées (évite d'accepter n'importe quelle
// chaîne comme "emoji" côté serveur).
const ALLOWED_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];

function buildRouter(config) {
  const router = express.Router();

  // ── SSE : flux temps réel ───────────────────────────────────────────────
  router.get("/events", requireUser, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Nginx : désactive le buffering
    res.flushHeaders();
    res.write(": connected\n\n");

    const uid = req.user.id;
    if (!sseClients.has(uid)) sseClients.set(uid, new Set());
    sseClients.get(uid).add(res);

    const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch (_) {} }, 25000);
    req.on("close", () => {
      clearInterval(hb);
      sseClients.get(uid)?.delete(res);
      if (sseClients.get(uid)?.size === 0) sseClients.delete(uid);
    });
  });

  // GET /messages/friends — liste des amis (JSON, pour popup de partage)
  router.get("/friends", requireUserJson, (req, res) => {
    const friends = getFriends(req.user.id).map((f) => ({
      id: f.id,
      displayName: f.display_name,
      profileColor: f.profile_color,
    }));
    res.json({ friends });
  });

  // ── Widget flottant (popup "Messages" accessible depuis toutes les pages,
  //    voir partials/foot.ejs) : versions compactes et JSON des mêmes
  //    données/actions que la page /messages, sans naviguer hors de la page.

  // GET /messages/widget/list — liste compacte des conversations
  router.get("/widget/list", requireUserJson, (req, res) => {
    const convs = buildConvList(req.user.id).map((c) => ({
      partnerId: c.partnerId,
      partnerName: c.partnerName,
      partnerColor: c.partnerColor,
      partnerIsAdmin: c.partnerIsAdmin,
      partnerAvatarThumb: c.partnerAvatarThumb,
      partnerAvatarCrop: c.partnerAvatarCrop,
      unread: c.unread,
      pinned: !!c.pinned,
      muted: !!c.muted,
    }));
    res.json({ convs });
  });

  // GET /messages/widget/thread/:userId — mini-fil (ouvre/marque lu une conv)
  router.get("/widget/thread/:userId", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    const partner = getUserById(partnerId);
    if (!partner || !canMessage(uid, partnerId))
      return res.status(403).json({ error: "accès refusé" });

    const conv = getOrCreateConversation(uid, partnerId);
    markRead(conv.id, uid);
    pushToUser(partnerId, "seen", { convId: conv.id });
    const avatar = resolveAvatar(partner);
    const msgs = getMessages(conv.id, uid, 30, null).reverse();
    res.json({
      convId: conv.id,
      partner: {
        id: partner.id, name: partner.displayName, color: partner.profileColor,
        isAdmin: !!partner.isAdmin, avatarThumb: avatar.thumb, avatarCrop: avatar.crop,
      },
      messages: msgs.map((m) => ({
        id: m.id, senderId: m.sender_id, text: m.payload,
        createdAt: m.created_at, reaction: m.reaction || null,
      })),
    });
  });

  // ── Conversations ────────────────────────────────────────────────────────

  // Helper : enrichit la liste des conversations pour un userId
  function buildConvList(uid) {
    return getConversations(uid).map((c) => {
      const pId = convPartner(c, uid);
      const isP1 = c.p1_id === uid;
      const avatar = resolveAvatar({
        profile_image_id: isP1 ? c.p2_image_id : c.p1_image_id,
        profile_image_crop: isP1 ? c.p2_image_crop : c.p1_image_crop,
      });
      return {
        ...c,
        partnerId: pId,
        partnerName: isP1 ? c.p2_name : c.p1_name,
        partnerColor: isP1 ? c.p2_color : c.p1_color,
        partnerIsAdmin: !!(isP1 ? c.p2_is_admin : c.p1_is_admin),
        partnerAvatarThumb: avatar.thumb,
        partnerAvatarCrop: avatar.crop,
      };
    });
  }

  // Helper : liste d'amis enrichie avec leur avatar résolu (popup "+ Nouvelle discussion")
  function buildFriendsList(uid) {
    return getFriends(uid).map((f) => {
      const avatar = resolveAvatar(f);
      return { ...f, avatarThumb: avatar.thumb, avatarCrop: avatar.crop };
    });
  }

  // GET /messages — liste des conversations (panneau droit seul)
  router.get("/", requireUser, (req, res) => {
    const uid = req.user.id;
    res.render("messages", {
      config,
      convs: buildConvList(uid),
      friends: buildFriendsList(uid),
      partner: null,
      conv: null,
      messages: [],
      navTitle: "Messages",
    });
  });

  // GET /messages/:userId — conversation avec un utilisateur + liste des convs
  router.get("/:userId", requireUser, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (!partnerId || partnerId === uid) return res.redirect("/messages");

    const partner = getUserById(partnerId);
    if (!partner || !canMessage(uid, partnerId)) return res.redirect("/messages");

    const conv = getOrCreateConversation(uid, partnerId);
    markRead(conv.id, uid);
    // Prévient l'expéditeur, en direct, que ses messages viennent d'être lus
    // (indicateur "Vu" sous son dernier message — voir messages.ejs).
    pushToUser(partnerId, "seen", { convId: conv.id });
    const partnerAvatar = resolveAvatar(partner);
    // Rappel affiché en haut du fil quand on écrit à un admin sans être déjà
    // ami avec lui/elle (voir canMessage : l'admin peut toujours être
    // contacté, mais ce rappel ne concerne pas les admins déjà amis).
    const friendship = getFriendshipBetween(uid, partnerId);
    const isFriendWithPartner = !!(friendship && friendship.status === "accepted");
    const showAdminNotice = !!partner.isAdmin && !isFriendWithPartner;

    res.render("messages", {
      config,
      convs: buildConvList(uid),
      friends: buildFriendsList(uid),
      conv,
      partner,
      partnerAvatarThumb: partnerAvatar.thumb,
      partnerAvatarCrop: partnerAvatar.crop,
      showAdminNotice,
      convPinned: !!(conv.p1_id === uid ? conv.pinned_p1 : conv.pinned_p2),
      convMuted: !!(conv.p1_id === uid ? conv.muted_p1 : conv.muted_p2),
      messages: getMessages(conv.id, uid, 40, null).reverse(),
      navTitle: partner.displayName,
    });
  });

  // POST /messages/:userId/typing — indicateur de frappe (SSE → partenaire)
  router.post("/:userId/typing", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (canMessage(uid, partnerId)) {
      pushToUser(partnerId, "typing", { fromId: uid });
    }
    res.json({ ok: true });
  });

  // POST /messages/:userId — envoyer un message (JSON)
  router.post("/:userId", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (!canMessage(uid, partnerId))
      return res.status(403).json({ error: "destinataire invalide" });

    const { text, contentRef } = req.body;
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return res.status(400).json({ error: "message vide" });
    if (trimmed.length > 4000) return res.status(400).json({ error: "message trop long" });

    const conv = getOrCreateConversation(uid, partnerId);
    const msgId = insertMessage(conv.id, uid, trimmed, contentRef ? JSON.stringify(contentRef) : null);

    if (contentRef && contentRef.type && contentRef.id) {
      addSharedItem(conv.id, contentRef.type, contentRef.id, uid);
    }

    pushToUser(partnerId, "message", { convId: conv.id, fromId: uid, fromName: req.user.displayName });

    res.json({ ok: true, msgId, convId: conv.id });
  });

  // POST /messages/msg/:msgId/react — réagir (ou retirer sa réaction) à un
  // message, notifié à l'autre comme un nouveau message (SSE "reaction").
  router.post("/msg/:msgId/react", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const msgId = parseInt(req.params.msgId, 10);
    const emoji = typeof req.body.emoji === "string" ? req.body.emoji.trim() : "";
    if (emoji && !ALLOWED_REACTIONS.includes(emoji))
      return res.status(400).json({ error: "emoji invalide" });
    const result = setMessageReaction(msgId, uid, emoji || null);
    if (!result) return res.status(403).json({ error: "accès refusé" });
    pushToUser(result.partnerId, "reaction", { convId: result.convId, msgId, emoji: emoji || null });
    res.json({ ok: true });
  });

  // DELETE /messages/conv/:convId — supprimer toute la discussion (côté utilisateur)
  router.delete("/conv/:convId", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const conv = getConversation(convId);
    if (!isConvParticipant(conv, uid))
      return res.status(403).json({ error: "accès refusé" });
    clearConversation(convId, uid);
    res.json({ ok: true });
  });

  // POST /messages/conv/:convId/pin — épingler/désépingler (menu ⋮)
  router.post("/conv/:convId/pin", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const conv = getConversation(convId);
    if (!isConvParticipant(conv, uid))
      return res.status(403).json({ error: "accès refusé" });
    setConversationPinned(convId, uid, !!req.body.pinned);
    res.json({ ok: true });
  });

  // POST /messages/conv/:convId/mute — sourdine/réactiver (menu ⋮)
  router.post("/conv/:convId/mute", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const conv = getConversation(convId);
    if (!isConvParticipant(conv, uid))
      return res.status(403).json({ error: "accès refusé" });
    setConversationMuted(convId, uid, !!req.body.muted);
    res.json({ ok: true });
  });

  // POST /messages/conv/:convId/mark-unread — pense-bête (menu ⋮)
  router.post("/conv/:convId/mark-unread", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const conv = getConversation(convId);
    if (!isConvParticipant(conv, uid))
      return res.status(403).json({ error: "accès refusé" });
    markConversationUnread(convId, uid);
    res.json({ ok: true });
  });

  // GET /messages/ref-card/:type/:id — métadonnées + vignette d'un contenu partagé
  router.get("/ref-card/:type/:id", requireUserJson, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.json({ thumb: null, title: "" });
    const ref = resolveContentRef(req.params.type, id);
    res.json(ref ? { thumb: ref.thumb, title: ref.title } : { thumb: null, title: "" });
  });

  // GET /messages/:userId/library — bibliothèque partagée
  router.get("/:userId/library", requireUser, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (!canMessage(uid, partnerId)) return res.redirect("/messages");

    const conv = getOrCreateConversation(uid, partnerId);
    const partner = getUserById(partnerId);
    const items = getSharedItems(conv.id, uid)
      .map((it) => {
        const ref = resolveContentRef(it.content_type, it.content_id);
        if (!ref) return null;
        return {
          id: it.id,
          type: it.content_type,
          href: ref.href,
          thumb: ref.thumb,
          title: ref.title,
          sharedByMe: it.shared_by === uid,
        };
      })
      .filter(Boolean);

    res.render("message-library", {
      config,
      conv,
      partner,
      items,
      navTitle: `Partagé avec ${partner?.displayName || ""}`,
    });
  });

  // POST /messages/:userId/share — partager un contenu depuis une autre page
  router.post("/:userId/share", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (!canMessage(uid, partnerId))
      return res.status(403).json({ error: "destinataire invalide" });

    const { type, id, title } = req.body;
    if (!type || !id) return res.status(400).json({ error: "données manquantes" });

    const label = { image: '📷', bd: '📖', wiki: '📄' }[type] || '';
    const text  = (label ? label + ' ' : '') + (title || type);
    const conv  = getOrCreateConversation(uid, partnerId);
    const refId = parseInt(id, 10);
    const msgId = insertMessage(conv.id, uid, text, JSON.stringify({ type, id: refId, title: title || '' }));
    addSharedItem(conv.id, type, refId, uid);

    pushToUser(partnerId, "message", { convId: conv.id, fromId: uid, fromName: req.user.displayName });

    res.json({ ok: true, msgId, convId: conv.id });
  });

  // DELETE /messages/shared/:itemId — retirer un élément de la bibliothèque
  router.delete("/shared/:itemId", requireUserJson, (req, res) => {
    const itemId = parseInt(req.params.itemId, 10);
    const ok = removeSharedItem(itemId, req.user.id);
    res.json({ ok });
  });

  // POST /messages/load-new/:convId — nouveaux messages après un ID (SSE fallback)
  router.post("/load-new/:convId", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const afterId = parseInt(req.body.afterId, 10) || 0;
    const conv = getConversation(convId);
    if (!isConvParticipant(conv, uid))
      return res.status(403).json({ error: 'accès refusé' });
    const msgs = getMessagesAfter(convId, uid, afterId);
    res.json({ messages: msgs });
  });

  // POST /messages/load-more/:convId — pagination des messages (JSON)
  router.post("/load-more/:convId", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const beforeId = parseInt(req.body.beforeId, 10) || null;

    const conv = getConversation(convId);
    if (!isConvParticipant(conv, uid))
      return res.status(403).json({ error: "accès refusé" });

    const msgs = getMessages(convId, uid, 40, beforeId).reverse();
    res.json({ messages: msgs });
  });

  return router;
}

module.exports.buildRouter = buildRouter;
