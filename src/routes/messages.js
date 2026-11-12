"use strict";
const express = require("express");
const {
  requireUser, requireUserJson,
} = require("../auth");
const {
  getUserKeys, setUserKeys, getPublicKey, getMessagesAfter,
  getOrCreateConversation, getConversation, getConversations,
  insertMessage, getMessages, markRead, getUnreadCount,
  setConversationPinned, setConversationMuted, markConversationUnread,
  addSharedItem, getSharedItems, removeSharedItem,
  getFriends, getUserById,
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

  // ── Clés crypto ─────────────────────────────────────────────────────────

  // GET /messages/keys/me — clé privée chiffrée (pour le navigateur du propriétaire)
  router.get("/keys/me", requireUser, (req, res) => {
    const keys = getUserKeys(req.user.id);
    if (!keys) return res.json({ hasKeys: false });
    res.json({
      hasKeys: true,
      encryptedPrivKey: keys.encrypted_priv_key,
      keyIv: keys.key_iv,
    });
  });

  // GET /messages/keys/:userId — clé publique d'un utilisateur
  router.get("/keys/:userId", requireUser, (req, res) => {
    const targetId = parseInt(req.params.userId, 10);
    if (!targetId) return res.status(400).json({ error: "id invalide" });
    const pk = getPublicKey(targetId);
    if (!pk) return res.json({ hasKey: false });
    res.json({ hasKey: true, publicKey: pk });
  });

  // POST /messages/keys — sauvegarder ses propres clés
  router.post("/keys", requireUserJson, (req, res) => {
    const { publicKey, encryptedPrivKey, keyIv } = req.body;
    if (!publicKey || !encryptedPrivKey || !keyIv)
      return res.status(400).json({ error: "données manquantes" });
    setUserKeys(req.user.id, publicKey, encryptedPrivKey, keyIv);
    res.json({ ok: true });
  });

  // GET /messages/friends — liste des amis avec leur statut de clé (JSON, pour popup de partage)
  router.get("/friends", requireUserJson, (req, res) => {
    const friends = getFriends(req.user.id).map((f) => ({
      id: f.id,
      displayName: f.display_name,
      profileColor: f.profile_color,
      hasKey: !!getPublicKey(f.id),
    }));
    res.json({ friends });
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
    if (!partner) return res.redirect("/messages");

    const conv = getOrCreateConversation(uid, partnerId);
    markRead(conv.id, uid);
    const partnerAvatar = resolveAvatar(partner);

    res.render("messages", {
      config,
      convs: buildConvList(uid),
      friends: buildFriendsList(uid),
      conv,
      partner,
      partnerAvatarThumb: partnerAvatar.thumb,
      partnerAvatarCrop: partnerAvatar.crop,
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
    if (partnerId && partnerId !== uid) {
      pushToUser(partnerId, "typing", { fromId: uid });
    }
    res.json({ ok: true });
  });

  // POST /messages/:userId — envoyer un message (JSON)
  router.post("/:userId", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (!partnerId || partnerId === uid)
      return res.status(400).json({ error: "destinataire invalide" });

    const { text, contentRef } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "message vide" });

    const conv = getOrCreateConversation(uid, partnerId);
    const msgId = insertMessage(conv.id, uid, text.trim(), contentRef ? JSON.stringify(contentRef) : null);

    if (contentRef && contentRef.type && contentRef.id) {
      addSharedItem(conv.id, contentRef.type, contentRef.id, uid);
    }

    pushToUser(partnerId, "message", { convId: conv.id, fromId: uid, fromName: req.user.displayName });

    res.json({ ok: true, msgId, convId: conv.id });
  });

  // DELETE /messages/conv/:convId — supprimer toute la discussion (côté utilisateur)
  router.delete("/conv/:convId", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const conv = getConversation(convId);
    if (!conv || (conv.p1_id !== uid && conv.p2_id !== uid))
      return res.status(403).json({ error: "accès refusé" });
    clearConversation(convId, uid);
    res.json({ ok: true });
  });

  // POST /messages/conv/:convId/pin — épingler/désépingler (menu ⋮)
  router.post("/conv/:convId/pin", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const conv = getConversation(convId);
    if (!conv || (conv.p1_id !== uid && conv.p2_id !== uid))
      return res.status(403).json({ error: "accès refusé" });
    setConversationPinned(convId, uid, !!req.body.pinned);
    res.json({ ok: true });
  });

  // POST /messages/conv/:convId/mute — sourdine/réactiver (menu ⋮)
  router.post("/conv/:convId/mute", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const conv = getConversation(convId);
    if (!conv || (conv.p1_id !== uid && conv.p2_id !== uid))
      return res.status(403).json({ error: "accès refusé" });
    setConversationMuted(convId, uid, !!req.body.muted);
    res.json({ ok: true });
  });

  // POST /messages/conv/:convId/mark-unread — pense-bête (menu ⋮)
  router.post("/conv/:convId/mark-unread", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const convId = parseInt(req.params.convId, 10);
    const conv = getConversation(convId);
    if (!conv || (conv.p1_id !== uid && conv.p2_id !== uid))
      return res.status(403).json({ error: "accès refusé" });
    markConversationUnread(convId, uid);
    res.json({ ok: true });
  });

  // GET /messages/ref-card/:type/:id — métadonnées + vignette d'un contenu partagé
  router.get("/ref-card/:type/:id", requireUserJson, (req, res) => {
    const { type } = req.params;
    const id = parseInt(req.params.id, 10);
    if (!id) return res.json({ thumb: null, title: "" });

    if (type === "image") {
      const img = getGalleryImage(id);
      if (!img) return res.json({ thumb: null, title: "" });
      const raw = img.imagePaths && img.imagePaths[0];
      return res.json({ thumb: raw ? thumbUrl(raw) : null, title: img.title || "" });
    }
    if (type === "wiki") {
      const page = getWikiPage(id);
      if (!page) return res.json({ thumb: null, title: "" });
      const raw = page.imagePaths && page.imagePaths[0];
      return res.json({ thumb: raw ? thumbUrl(raw) : null, title: page.title || "" });
    }
    if (type === "bd") {
      const book = getBdBook(id);
      if (!book) return res.json({ thumb: null, title: "" });
      const raw = book.coverPath || (book.imagePaths && book.imagePaths[0]);
      return res.json({ thumb: raw ? thumbUrl(raw) : null, title: book.title || "" });
    }
    res.json({ thumb: null, title: "" });
  });

  // GET /messages/:userId/library — bibliothèque partagée
  router.get("/:userId/library", requireUser, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (!partnerId) return res.redirect("/messages");

    const conv = getOrCreateConversation(uid, partnerId);
    const items = getSharedItems(conv.id, uid);
    const partner = getUserById(partnerId);

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
    if (!partnerId || partnerId === uid)
      return res.status(400).json({ error: "destinataire invalide" });

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
    if (!conv || (conv.p1_id !== uid && conv.p2_id !== uid))
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
    if (!conv || (conv.p1_id !== uid && conv.p2_id !== uid))
      return res.status(403).json({ error: "accès refusé" });

    const msgs = getMessages(convId, uid, 40, beforeId).reverse();
    res.json({ messages: msgs });
  });

  return router;
}

module.exports.buildRouter = buildRouter;
