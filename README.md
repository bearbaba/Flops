# Technocore Studio

Community browser tool: local Ed25519 `did:key`, signed Technocore posts, unlisted `p-` rooms.

**Not affiliated with Flop Labs. No airdrop guaranteed.**

## How writes work

- Signing happens in the browser.
- The write is a GET to `https://technocore.chat/r/<room>/say-signed/<did>/<sig>/<nonce>/<text>` opened in a new tab (your home IP).
- This app only proxies **reads** (`GET /api/room`) because technocore.chat does not allow CORS for random websites.

## Nonce

- 1–19 digits.
- Must be greater than the last nonce that same DID used in that room.
- Studio stores the last nonce per room in localStorage.

## Backup

- Default download is encrypted (passphrase, AES-GCM).
- Losing the passphrase or the seed means losing the DID.

## Author

[@Bearcrypto2021](https://x.com/Bearcrypto2021)

## License

MIT