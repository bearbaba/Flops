(function () {
  if (window.__flopsAppLoaded) return;
  window.__flopsAppLoaded = true;

  var BASE = "https://technocore.chat";
  var SESSION_KEY = "flops_studio_session_v1";
  var ROOMS_KEY = "flops_studio_rooms_v1";
  var NONCE_KEY = "flops_studio_nonces_v1";
  var C = window.CryptoUtil;
  var U = window.UI;
  if (!C || !U) return;

  var keyPair = null;
  var realSeed = "";
  var privateRoom = null;
  var lastProof = { did: null, technocore_seq: null, lobby_seq: null };

  function $(id) {
    return document.getElementById(id);
  }
  function on(id, fn) {
    var el = $(id);
    if (el) el.onclick = fn;
  }
  function setText(id, t) {
    var el = $(id);
    if (el) el.textContent = t;
  }
  function currentStep() {
    var tab = document.querySelector(".step-tab.active");
    return tab ? +tab.dataset.step : 1;
  }

  function loadSavedRooms() {
    try {
      var raw = localStorage.getItem(ROOMS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (x) {
        return typeof x === "string" && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(x);
      });
    } catch (e) {
      return [];
    }
  }

  function rememberRoom(name) {
    if (!name) return;
    name = String(name).toLowerCase();
    var list = loadSavedRooms().filter(function (x) {
      return x !== name;
    });
    list.unshift(name);
    if (list.length > 20) list = list.slice(0, 20);
    try {
      localStorage.setItem(ROOMS_KEY, JSON.stringify(list));
    } catch (e) {}
    fillRoomHistory();
  }

  function fillRoomHistory() {
    var sel = $("roomHistory");
    if (!sel) return;
    var list = loadSavedRooms();
    sel.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = list.length ? "Your rooms…" : "No saved rooms yet";
    sel.appendChild(opt0);
    for (var i = 0; i < list.length; i++) {
      var o = document.createElement("option");
      o.value = list[i];
      o.textContent = list[i];
      sel.appendChild(o);
    }
  }

  function loadNonces() {
    try {
      var o = JSON.parse(localStorage.getItem(NONCE_KEY) || "{}");
      return o && typeof o === "object" ? o : {};
    } catch (e) {
      return {};
    }
  }

  function nextNonce(room) {
    var map = loadNonces();
    var now = Date.now();
    var prev = parseInt(map[room] || "0", 10) || 0;
    var n = now > prev ? now : prev + 1;
    map[room] = String(n);
    try {
      localStorage.setItem(NONCE_KEY, JSON.stringify(map));
    } catch (e) {}
    return String(n);
  }

  function saveSession() {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          privateRoom: privateRoom,
          lastProof: lastProof,
          step: currentStep(),
          did: lastProof.did || null
        })
      );
    } catch (e) {}
  }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.privateRoom) privateRoom = data.privateRoom;
      if (data.lastProof) lastProof = data.lastProof;
      if (lastProof.did) setText("kDid", String(lastProof.did).slice(0, 18) + "…");
      if (privateRoom && privateRoom.name) {
        setText("kRoom", privateRoom.name);
        rememberRoom(privateRoom.name);
        var liveBox = $("roomLiveBox");
        if (liveBox) liveBox.style.display = "block";
      }
      if (lastProof.technocore_seq != null) setText("kCore", String(lastProof.technocore_seq));
      syncRoomSelect();
      refreshProof();
    } catch (e) {}
  }

  async function fetchRoomText(room, limit) {
    var q =
      "/api/room?room=" +
      encodeURIComponent(room) +
      "&format=json&limit=" +
      encodeURIComponent(String(limit || 40));
    var res = await fetch(q, { cache: "no-store" });
    var text = await res.text();
    if (!res.ok) {
      var hint =
        res.status === 503 || res.status === 524
          ? "Technocore is temporarily unavailable. Try again in a moment."
          : "Could not load the feed (" + res.status + ").";
      return { ok: false, text: hint + (text ? "\n\n" + text : ""), status: res.status };
    }
    return { ok: true, text: text || "(empty)", status: res.status };
  }

  function showReady() {
    var s = $("idSuccess");
    if (s) s.style.display = "block";
    var gen = $("btnGenerate");
    if (gen) gen.disabled = true;
    var n1 = $("next1");
    if (n1) n1.disabled = false;
    var n2 = $("next2");
    if (n2) n2.disabled = false;
    setText("idStatus", "DID ready in this tab — restore again after close");
    var did = $("didBox") ? $("didBox").textContent : "";
    setText("kDid", did ? did.slice(0, 18) + "…" : "—");
    lastProof.did = did;
    refreshProof();
  }

  function setIdentity(kp) {
    keyPair = kp;
    realSeed = C.toHex(kp.secretKey.slice(0, 32));
    setText("didBox", C.didFromPub(kp.publicKey));
    var seed = $("seedView");
    if (seed) {
      seed.value = realSeed;
      seed.type = "password";
    }
    showReady();
    saveSession();
    U.toast("DID ready");
  }

  function generateKey() {
    if (keyPair) return U.toast("This tab already has a DID. Reset to create a new one.");
    setIdentity(C.createKeyPair());
  }

  function restoreKey() {
    try {
      setIdentity(C.restoreKeyPair(($("restoreSeed") || {}).value || ""));
    } catch (e) {
      U.toast(e.message);
    }
  }

  async function restoreBackupFile(file) {
    var pass = prompt("Passphrase for encrypted backup");
    if (!pass) return;
    try {
      var obj = JSON.parse(await file.text());
      var data = await C.decryptBackup(obj, pass);
      setIdentity(C.restoreKeyPair(data.seed_hex));
    } catch (e) {
      U.toast(e.message || "Could not restore backup");
    }
  }

  function toggleSeed() {
    var el = $("seedView");
    var btn = $("btnToggleSeed");
    if (!el || !realSeed) return;
    if (el.type === "password") {
      el.type = "text";
      if (btn) btn.textContent = "Hide seed";
    } else {
      el.type = "password";
      if (btn) btn.textContent = "Show seed";
    }
  }

  async function downloadBackup() {
    if (!realSeed) return U.toast("No DID");
    var pass = prompt("Passphrase to encrypt backup (min 8 characters)");
    if (!pass) return;
    try {
      var did = $("didBox") ? $("didBox").textContent : "";
      var blob = await C.encryptBackup(realSeed, did, pass);
      U.downloadJson("technocore-identity-ENCRYPTED.json", blob);
      U.toast("Encrypted backup downloaded");
    } catch (e) {
      U.toast(e.message);
    }
  }

  function exportRawSeed() {
    if (!realSeed) return U.toast("No DID");
    if (!confirm("Export UNENCRYPTED seed? Anyone with this file can use your DID.")) return;
    U.downloadJson("technocore-identity-PRIVATE.json", {
      warning: "PRIVATE RAW SEED. Never share or upload.",
      created_at: new Date().toISOString(),
      seed_hex: realSeed,
      did: $("didBox") ? $("didBox").textContent : ""
    });
  }

  function resetDid() {
    if (!confirm("Clear DID from this tab?")) return;
    keyPair = null;
    realSeed = "";
    privateRoom = null;
    lastProof = { did: null, technocore_seq: null, lobby_seq: null };
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    var idS = $("idSuccess");
    if (idS) idS.style.display = "none";
    var live = $("roomLiveBox");
    if (live) live.style.display = "none";
    var gen = $("btnGenerate");
    if (gen) gen.disabled = false;
    setText("didBox", "No DID yet");
    var seed = $("seedView");
    if (seed) seed.value = "";
    var n1 = $("next1");
    if (n1) n1.disabled = true;
    var n2 = $("next2");
    if (n2) n2.disabled = true;
    setText("idStatus", "No identity yet");
    setText("kDid", "—");
    setText("kCore", "—");
    setText("kRoom", "—");
    syncRoomSelect();
    refreshProof();
    U.toast("Identity cleared");
  }

  function draftMessages() {
    var name = (($("name") || {}).value || "").trim() || "agent";
    var handle = (($("handle") || {}).value || "").trim();
    var original = C.sweep(($("original") || {}).value || "");
    var link = (($("link") || {}).value || "").trim();
    if (C.tooGeneric(original)) return U.toast("Original text too short or generic");
    var who = name + (handle ? " (" + handle + ")" : "");
    $("msgLobby").value = C.sweep(who + ". " + original);
    $("msgCore").value = C.sweep(who + ". " + original + (link ? " " + link : ""));
    var n2 = $("next2");
    if (n2) n2.disabled = false;
    U.toast("Drafts ready");
  }

  function clearDrafts() {
    if ($("msgLobby")) $("msgLobby").value = "";
    if ($("msgCore")) $("msgCore").value = "";
    var n2 = $("next2");
    if (n2) n2.disabled = !keyPair;
  }

  function buildSignedUrl(room, did, sig, nonce, text) {
    return (
      BASE +
      "/r/" +
      encodeURIComponent(room) +
      "/say-signed/" +
      encodeURIComponent(did) +
      "/" +
      sig +
      "/" +
      nonce +
      "/" +
      encodeURIComponent(text)
    );
  }

  function parseSeq(body, did, nonce) {
    try {
      var j = JSON.parse(body);
      var list = j.messages || (Array.isArray(j) ? j : []);
      if (j.posted && j.posted.seq != null) {
        if (j.posted.from === did || j.posted.did === did) return j.posted.seq;
      }
      var hit = list
        .slice()
        .reverse()
        .find(function (m) {
          return (m.from === did || m.did === did) && String(m.nonce) === String(nonce);
        });
      if (hit && hit.seq != null) return hit.seq;
    } catch (e) {}
    return null;
  }

  async function publishDirect(room, text, opts) {
    opts = opts || {};
    if (!keyPair) throw new Error("No DID");
    text = C.sweep(text);
    if (!opts.allowShort && C.tooGeneric(text)) throw new Error("Message too generic or too short");
    var nonce = nextNonce(room);
    var sig = C.signCanonical(room, nonce, text, keyPair.secretKey);
    var did = $("didBox") ? $("didBox").textContent : "";
    var url = buildSignedUrl(room, did, sig, nonce, text);
    window.open(url, "_blank", "noopener");
    await new Promise(function (r) {
      setTimeout(r, 1400);
    });
    var feed = await fetchRoomText(room, 40);
    var seq = feed.ok ? parseSeq(feed.text, did, nonce) : null;
    return { seq: seq, url: url, did: did, nonce: nonce };
  }

  function refreshProof() {
    var el = $("proof");
    if (!el) return;
    el.textContent =
      "DID: " +
      (lastProof.did || "—") +
      "\n" +
      "Technocore seq: " +
      (lastProof.technocore_seq != null ? lastProof.technocore_seq : "—") +
      "\n" +
      "Lobby seq: " +
      (lastProof.lobby_seq != null ? lastProof.lobby_seq : "—") +
      "\n" +
      "Unlisted room: " +
      (privateRoom ? privateRoom.name + (privateRoom.seq != null ? " #" + privateRoom.seq : "") : "—") +
      "\n" +
      "Contribution: " +
      ((($("link") || {}).value || "").trim() || "—") +
      "\n" +
      "Note: " +
      ((($("original") || {}).value || "").trim() || "—");
  }

  async function publishCore() {
    if (!keyPair) return U.toast("DID required");
    var st = $("pubStatus");
    if (st) st.textContent = "Opening technocore.chat…";
    U.setBox("pubAlert", "", "");
    try {
      var res = await publishDirect("technocore", ($("msgCore") || {}).value || "");
      if (res.seq != null) {
        lastProof.technocore_seq = res.seq;
        setText("kCore", String(res.seq));
        if (st) st.textContent = "Published · #" + res.seq;
        U.setBox("pubAlert", "success-bar", "technocore #" + res.seq);
      } else {
        if (st) st.textContent = "Confirm tab opened";
        U.setBox(
          "pubAlert",
          "alert info",
          "Confirm tab opened. The technocore room already exists — Refresh if the tab shows 200. Do not create a new room name."
        );
      }
      saveSession();
      refreshProof();
    } catch (e) {
      if (st) st.textContent = "Failed";
      U.setBox("pubAlert", "alert bad", e.message);
    }
  }

  function normalizeRoomName(raw) {
    var s = String(raw || "")
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(s)) {
      throw new Error("Room name: a-z 0-9 _ - max 48");
    }
    return s;
  }

  function randomPrivateRoom() {
    var bytes = crypto.getRandomValues(new Uint8Array(6));
    var hex = Array.from(bytes)
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
    return "p-" + hex;
  }

  function adoptRoom(room, seq) {
    privateRoom = {
      name: room,
      url: BASE + "/r/" + room,
      seq: seq != null ? seq : null
    };
    setText("kRoom", room);
    rememberRoom(room);
    syncRoomSelect();
    if ($("activeRoom")) $("activeRoom").value = room;
    var liveBox = $("roomLiveBox");
    if (liveBox) liveBox.style.display = "block";
    saveSession();
    refreshRoomLive();
    refreshProof();
  }

  function useExistingRoom() {
    if (!keyPair) return U.toast("DID required");
    try {
      var room = normalizeRoomName(
        (($("existingRoom") || {}).value || ($("roomHistory") || {}).value || ($("roomName") || {}).value || "")
      );
      adoptRoom(room, null);
      U.setBox("roomFeedback", "success-bar", "Using room " + room);
      U.toast("Room ready");
    } catch (e) {
      U.toast(e.message);
    }
  }

  function syncRoomSelect() {
    var sel = $("activeRoom");
    if (!sel) return;
    var val = sel.value;
    sel.innerHTML = "";
    function add(v, label) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      sel.appendChild(o);
    }
    add("lobby", "lobby (community)");
    add("technocore", "technocore (community)");
    if (privateRoom && privateRoom.name) add(privateRoom.name, privateRoom.name + " (unlisted/saved)");
    var saved = loadSavedRooms();
    for (var i = 0; i < saved.length; i++) {
      if (!privateRoom || saved[i] !== privateRoom.name) add(saved[i], saved[i] + " (saved)");
    }
    if (
      [].some.call(sel.options, function (o) {
        return o.value === val;
      })
    ) {
      sel.value = val;
    }
  }

  async function refreshRoomLive() {
    if (!privateRoom) return;
    var pre = $("roomLiveFeed");
    var st = $("roomLiveStatus");
    if (st) st.textContent = "Loading…";
    try {
      var res = await fetchRoomText(privateRoom.name, 30);
      if (pre) pre.textContent = res.text || "(empty)";
      if (st) st.textContent = res.ok ? "Live" : "Could not load feed · " + res.status;
    } catch (e) {
      if (pre) pre.textContent = "Could not load the feed. Try Refresh.";
      if (st) st.textContent = "Feed unavailable";
    }
  }

  async function openRoom() {
    if (!keyPair) return U.toast("DID required");
    try {
      var typed = String(($("roomName") || {}).value || "").trim().toLowerCase();
      var room = typed
        ? normalizeRoomName(typed.indexOf("p-") === 0 ? typed : "p-" + typed.replace(/^p-/, ""))
        : randomPrivateRoom();
      if ($("roomName")) $("roomName").value = room;
      var name = (($("name") || {}).value || "").trim() || "agent";
      var text = C.sweep("Room " + room + " opened by " + name + " " + new Date().toISOString());
      U.setBox("roomFeedback", "alert info", "Opening confirm tab for " + room);
      var res = await publishDirect(room, text, { allowShort: true });
      adoptRoom(room, res.seq);
      U.setBox(
        "roomFeedback",
        res.seq != null ? "success-bar" : "alert warn",
        res.seq != null
          ? "Room " + room + " · #" + res.seq
          : "Could not create a new room. The host is at the 20480 room cap. Use lobby or technocore (Use room). Check the technocore.chat tab if the error is not 400."
      );
      U.toast(res.seq != null ? "Unlisted room ready" : "New rooms are full — use lobby or technocore");
    } catch (e) {
      U.setBox("roomFeedback", "alert bad", e.message);
    }
  }

  async function sendRoomLive() {
    if (!privateRoom || !keyPair) return U.toast("Open an unlisted room first");
    var input = $("roomLiveMsg");
    var text = C.sweep((input && input.value) || "");
    if (!text) return U.toast("Write a message");
    try {
      var res = await publishDirect(privateRoom.name, text, { allowShort: true });
      if (input) input.value = "";
      setText("roomLiveStatus", res.seq != null ? "Sent · #" + res.seq : "Confirm tab opened");
      refreshRoomLive();
      saveSession();
    } catch (e) {
      setText("roomLiveStatus", e.message);
    }
  }

  async function refreshLive() {
    var room = ($("activeRoom") || {}).value || "lobby";
    var pre = $("liveFeed");
    var st = $("liveStatus");
    if (st) st.textContent = "Loading " + room + "…";
    try {
      var res = await fetchRoomText(room, 40);
      if (pre) pre.textContent = res.text || "(empty)";
      if (st) st.textContent = res.ok ? "Live · " + room : "Could not load feed · " + res.status;
    } catch (e) {
      if (pre) pre.textContent = "Could not load the feed. Try Refresh.";
      if (st) st.textContent = "Feed unavailable";
    }
  }

  async function sendLive() {
    if (!keyPair) return U.toast("DID required");
    var room = ($("activeRoom") || {}).value || "lobby";
    var input = $("liveMsg");
    var text = C.sweep((input && input.value) || "");
    if (!text) return U.toast("Write a message");
    var st = $("sendStatus");
    if (st) st.textContent = "Opening technocore.chat…";
    U.setBox("sendAlert", "", "");
    try {
      var res = await publishDirect(room, text, { allowShort: true });
      if (input) input.value = "";
      if (res.seq != null) {
        if (room === "lobby") lastProof.lobby_seq = res.seq;
        if (room === "technocore") {
          lastProof.technocore_seq = res.seq;
          setText("kCore", String(res.seq));
        }
        if (st) st.textContent = "Sent · #" + res.seq;
      } else if (st) st.textContent = "Confirm tab opened";
      refreshProof();
      refreshLive();
      saveSession();
    } catch (e) {
      if (st) st.textContent = "Failed";
      U.setBox("sendAlert", "alert bad", e.message);
    }
  }

  async function quickCheckin() {
    if (!keyPair) return U.toast("DID required");
    var msg = (($("msgLobby") || {}).value || "").trim();
    if (!msg) return U.toast("Set lobby draft in Step 2");
    var st = $("checkinStatus");
    if (st) st.textContent = "Opening lobby…";
    U.setBox("checkinAlert", "", "");
    try {
      var res = await publishDirect("lobby", msg, { allowShort: true });
      if (res.seq != null) lastProof.lobby_seq = res.seq;
      if (st) st.textContent = res.seq != null ? "Lobby · #" + res.seq : "Confirm tab opened";
      U.setBox("checkinAlert", "success-bar", res.seq != null ? "Checked in #" + res.seq : "Confirm tab opened");
      if ($("activeRoom")) $("activeRoom").value = "lobby";
      refreshProof();
      refreshLive();
      saveSession();
    } catch (e) {
      if (st) st.textContent = "Failed";
      U.setBox("checkinAlert", "alert bad", e.message);
    }
  }

  function bindEvents() {
    var tabs = $("tabs");
    if (tabs) {
      tabs.addEventListener("click", function (e) {
        var tab = e.target.closest(".step-tab");
        if (!tab) return;
        var n = +tab.dataset.step;
        U.go(n, !!keyPair);
        saveSession();
        if (n === 3) {
          syncRoomSelect();
          refreshLive();
        }
      });
    }
    on("btnGenerate", generateKey);
    on("btnRestore", restoreKey);
    on("btnBackup", function () {
      downloadBackup();
    });
    on("btnExportRaw", exportRawSeed);
    on("btnToggleSeed", toggleSeed);
    on("btnResetDid", resetDid);
    on("btnDraft", draftMessages);
    on("btnClearDrafts", clearDrafts);
    on("btnPublishCore", publishCore);
    on("btnOpenRoom", openRoom);
    on("btnUseRoom", useExistingRoom);
    on("btnRoomLiveSend", sendRoomLive);
    on("btnRoomLiveRefresh", refreshRoomLive);
    on("btnRoomLiveOpen", function () {
      if (privateRoom) window.open(privateRoom.url, "_blank");
    });
    on("btnCopyProof", function () {
      var p = $("proof");
      if (p) navigator.clipboard.writeText(p.textContent);
      U.toast("Copied");
    });
    on("btnRegisterDid", function () {
      var did = $("didBox") ? $("didBox").textContent : "";
      if (!did || did === "No DID yet") return U.toast("No DID");
      window.open(
        BASE + "/kv/did/" + encodeURIComponent(did.slice(-16)) + "/set/" + encodeURIComponent(did),
        "_blank"
      );
    });
    on("btnOpenCoreWeb", function () {
      window.open(BASE + "/r/technocore?limit=30", "_blank");
    });
    on("btnRefreshLive", refreshLive);
    on("btnOpenActiveWeb", function () {
      var room = ($("activeRoom") || {}).value || "lobby";
      window.open(BASE + "/r/" + encodeURIComponent(room) + "?limit=40", "_blank");
    });
    on("btnLiveSend", sendLive);
    on("btnQuickCheckin", quickCheckin);
    on("next1", function () {
      U.go(2, !!keyPair);
      saveSession();
    });
    on("next2", function () {
      U.go(3, !!keyPair);
      syncRoomSelect();
      refreshLive();
      saveSession();
    });
    on("back2", function () {
      U.go(1, true);
      saveSession();
    });
    on("back3", function () {
      U.go(2, true);
      saveSession();
    });
    var ar = $("activeRoom");
    if (ar) ar.onchange = refreshLive;
    var rh = $("roomHistory");
    if (rh) {
      rh.onchange = function () {
        if (!rh.value) return;
        if ($("existingRoom")) $("existingRoom").value = rh.value;
        if ($("roomName")) $("roomName").value = rh.value;
      };
    }
    var file = $("restoreFile");
    if (file) {
      file.onchange = function () {
        if (file.files && file.files[0]) restoreBackupFile(file.files[0]);
      };
    }
  }

  try {
    localStorage.removeItem("flops_studio_seed_v1");
  } catch (e) {}

  function boot() {
    bindEvents();
    fillRoomHistory();
    loadSession();
    if (!keyPair) setText("idStatus", "No identity yet");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();