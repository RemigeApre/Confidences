"use strict";
const express = require("express");
const {
  requireUser, requireUserJson,
} = require("../auth");
const {
  getUserKeys, setUserKeys, getPublicKey, getMessagesAfter,
  getOrCreateConversation, getConversation, getConversations,
  insertMessage, getMessages, markRead, deleteMessage, getUnreadCount,
  addSharedItem, getSharedItems, removeSharedItem,
  getFriends, getUserById,
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

  // GET /messages — liste des conversations
  router.get("/", requireUser, (req, res) => {
    const uid = req.user.id;
    const convs = getConversations(uid);
    const friends = getFriends(uid);

    // Enrichir chaque conversation avec les infos du partenaire
    const list = convs.map((c) => {
      const partnerId = convPartner(c, uid);
      return {
        ...c,
        partnerId,
        partnerName: c.p1_id === uid ? c.p2_name : c.p1_name,
        partnerColor: c.p1_id === uid ? c.p2_color : c.p1_color,
      };
    });

    res.render("messages", {
      config,
      convs: list,
      friends,
      navTitle: "Messages",
    });
  });

  // GET /messages/:userId — conversation avec un utilisateur (ou création)
  router.get("/:userId", requireUser, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (!partnerId || partnerId === uid) return res.redirect("/messages");

    const partner = getUserById(partnerId);
    if (!partner) return res.redirect("/messages");

    const conv = getOrCreateConversation(uid, partnerId);
    markRead(conv.id, uid);

    const messages = getMessages(conv.id, uid, 40, null).reverse();
    const sharedItems = getSharedItems(conv.id, uid);
    const myKeys = getUserKeys(uid);
    const partnerPubKey = getPublicKey(partnerId);

    res.render("message-thread", {
      config,
      conv,
      partner,
      messages,
      sharedItems,
      myKeys: myKeys ? { hasKeys: true, encryptedPrivKey: myKeys.encrypted_priv_key, keyIv: myKeys.key_iv } : { hasKeys: false },
      partnerPubKey: partnerPubKey || null,
      navTitle: partner.displayName,
    });
  });

  // POST /messages/:userId — envoyer un message (JSON)
  router.post("/:userId", requireUserJson, (req, res) => {
    const uid = req.user.id;
    const partnerId = parseInt(req.params.userId, 10);
    if (!partnerId || partnerId === uid)
      return res.status(400).json({ error: "destinataire invalide" });

    const { payload, contentRef } = req.body;
    if (!payload) return res.status(400).json({ error: "payload manquant" });

    const conv = getOrCreateConversation(uid, partnerId);
    const msgId = insertMessage(conv.id, uid, payload, contentRef ? JSON.stringify(contentRef) : null);

    // Si le contenu a une référence, l'ajouter à la bibliothèque partagée
    if (contentRef && contentRef.type && contentRef.id) {
      addSharedItem(conv.id, contentRef.type, contentRef.id, uid);
    }

    // Notifier le destinataire via SSE
    pushToUser(partnerId, "message", {
      convId: conv.id,
      fromId: uid,
      fromName: req.user.displayName,
    });

    res.json({ ok: true, msgId, convId: conv.id });
  });

  // DELETE /messages/msg/:msgId — supprimer un message
  router.delete("/msg/:msgId", requireUserJson, (req, res) => {
    const msgId = parseInt(req.params.msgId, 10);
    const ok = deleteMessage(msgId, req.user.id);
    res.json({ ok });
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

    const { type, id, payload } = req.body;
    if (!type || !id || !payload)
      return res.status(400).json({ error: "données manquantes" });

    const conv = getOrCreateConversation(uid, partnerId);
    const msgId = insertMessage(conv.id, uid, payload, JSON.stringify({ type, id }));
    addSharedItem(conv.id, type, id, uid);

    pushToUser(partnerId, "message", {
      convId: conv.id,
      fromId: uid,
      fromName: req.user.displayName,
    });

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
