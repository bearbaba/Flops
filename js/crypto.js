window.CryptoUtil = (function () {
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  var BANNED = [
    "agent online",
    "ready for $flop",
    "spreading technocore",
    "gm flop",
    "airdrop plz",
    "to the moon",
    "food for your ai agent",
    "not a copied template",
    "xin chao lobby",
    "checking in for"
  ];

  function base58Encode(bytes) {
    var n = 0n;
    for (var i = 0; i < bytes.length; i++) n = n * 256n + BigInt(bytes[i]);
    var out = "";
    while (n > 0n) {
      out = B58[Number(n % 58n)] + out;
      n = n / 58n;
    }
    for (var j = 0; j < bytes.length; j++) {
      if (bytes[j] === 0) out = "1" + out;
      else break;
    }
    return out || "1";
  }

  function toHex(bytes) {
    return Array.from(bytes)
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function fromHex(hex) {
    hex = hex.trim().toLowerCase().replace(/^0x/, "");
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("Seed must be exactly 64 hex characters");
    var out = new Uint8Array(32);
    for (var i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  function didFromPub(pub) {
    var mc = new Uint8Array(2 + pub.length);
    mc[0] = 0xed;
    mc[1] = 0x01;
    mc.set(pub, 2);
    return "did:key:z" + base58Encode(mc);
  }

  function sweep(text) {
    return String(text || "")
      .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function b64url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlToBytes(s) {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function tooGeneric(s) {
    var x = (s || "").toLowerCase();
    for (var i = 0; i < BANNED.length; i++) if (x.indexOf(BANNED[i]) !== -1) return true;
    return x.length < 24;
  }

  function createKeyPair() {
    if (typeof nacl === "undefined") throw new Error("tweetnacl not loaded");
    return nacl.sign.keyPair();
  }

  function restoreKeyPair(seedHex) {
    if (typeof nacl === "undefined") throw new Error("tweetnacl not loaded");
    return nacl.sign.keyPair.fromSeed(fromHex(seedHex));
  }

  function signCanonical(room, nonce, text, secretKey) {
    if (typeof nacl === "undefined") throw new Error("tweetnacl not loaded");
    var msg = new TextEncoder().encode(room + "|" + nonce + "|" + text);
    return b64url(nacl.sign.detached(msg, secretKey));
  }

  async function deriveKey(pass, salt) {
    var enc = new TextEncoder();
    var base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 250000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptBackup(seedHex, did, passphrase) {
    if (!passphrase || passphrase.length < 8) throw new Error("Passphrase at least 8 characters");
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(passphrase, salt);
    var pt = new TextEncoder().encode(JSON.stringify({ seed_hex: seedHex, did: did }));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, pt));
    return {
      v: 1,
      alg: "PBKDF2-SHA256-AES-GCM",
      iter: 250000,
      salt: b64url(salt),
      iv: b64url(iv),
      ct: b64url(ct),
      did: did,
      warning: "ENCRYPTED backup. Keep the passphrase separate. Never share this file with the passphrase."
    };
  }

  async function decryptBackup(obj, passphrase) {
    if (!obj || !obj.ct || !obj.salt || !obj.iv) throw new Error("Not an encrypted backup");
    var key = await deriveKey(passphrase, b64urlToBytes(obj.salt));
    var pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64urlToBytes(obj.iv) },
      key,
      b64urlToBytes(obj.ct)
    );
    var data = JSON.parse(new TextDecoder().decode(pt));
    if (!data.seed_hex) throw new Error("Bad backup");
    return data;
  }

  return {
    toHex: toHex,
    fromHex: fromHex,
    didFromPub: didFromPub,
    sweep: sweep,
    tooGeneric: tooGeneric,
    createKeyPair: createKeyPair,
    restoreKeyPair: restoreKeyPair,
    signCanonical: signCanonical,
    encryptBackup: encryptBackup,
    decryptBackup: decryptBackup
  };
})();