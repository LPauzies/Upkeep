(() => {
  if (window.__UPKEEP_WS_SPY_INSTALLED__) return;
  window.__UPKEEP_WS_SPY_INSTALLED__ = true;

  const ORIGIN = window.location.origin;

  function toImageUrl(name) {
    return `/api/cards/image?name=${encodeURIComponent(name)}&_v=2`;
  }

  function normalizeCard(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const name = raw.trim();
      return name ? { name, typeLine: '', manaCost: '', imageUrl: toImageUrl(name) } : null;
    }
    if (typeof raw !== 'object') return null;
    const name = String(
      raw.name || raw.cardName || raw.card_name || raw.title || raw.card?.name || ''
    ).trim();
    if (!name) return null;
    const typeLine = String(
      raw.typeLine || raw.type_line || raw.types || raw.type || raw.card?.typeLine || raw.card?.type_line || ''
    );
    const manaCost = String(
      raw.manaCost || raw.mana_cost || raw.cost || raw.card?.manaCost || raw.card?.mana_cost || ''
    );
    const id = raw.id != null ? String(raw.id) : raw.cardId != null ? String(raw.cardId) : undefined;
    const imageUrl =
      typeof raw.imageUrl === 'string' && raw.imageUrl
        ? raw.imageUrl
        : typeof raw.image === 'string' && raw.image
        ? raw.image
        : toImageUrl(name);
    return { id, name, typeLine, manaCost, imageUrl };
  }

  function extractCardArray(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const item of arr) {
      const c = normalizeCard(item);
      if (c) out.push(c);
    }
    return out;
  }

  function extractGraveyardsFromPayload(root) {
    if (!root || typeof root !== 'object') return null;

    const queue = [root];
    const seen = new Set();
    let depth = 0;

    while (queue.length > 0 && depth < 50) {
      const cur = queue.shift();
      depth++;
      if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
      seen.add(cur);

      // Case 1: players array with graveyard / zones.graveyard
      if (Array.isArray(cur.players) && cur.players.length > 0) {
        const players = [];
        let foundAnyZone = false;
        for (const p of cur.players) {
          if (!p || typeof p !== 'object') continue;
          const gyRaw =
            p.graveyard ??
            p.graveyardCards ??
            p.zones?.graveyard ??
            p.zones?.Graveyard ??
            (Array.isArray(p.zones)
              ? p.zones.find((z) => /graveyard/i.test(String(z?.name || z?.zone || z?.type || '')))?.cards
              : null);
          if (Array.isArray(gyRaw)) {
            foundAnyZone = true;
            players.push({
              name: String(p.name || p.username || p.displayName || p.playerName || ''),
              isSelf: Boolean(p.isSelf || p.isYou || p.isMe || p.self),
              isOpponent: Boolean(p.isOpponent || p.opponent),
              seat: p.seat ?? p.index ?? p.id,
              graveyard: extractCardArray(gyRaw),
            });
          }
        }
        if (foundAnyZone && players.length > 0) {
          return { players };
        }
      }

      // Case 2: direct opponentGraveyard / oppGraveyard keys
      const directOppGy = cur.opponentGraveyard || cur.oppGraveyard || cur.opponent_graveyard;
      if (Array.isArray(directOppGy)) {
        return {
          players: [
            {
              name: String(cur.opponentName || cur.opponent?.name || ''),
              isSelf: false,
              isOpponent: true,
              graveyard: extractCardArray(directOppGy),
            },
          ],
        };
      }

      // Case 3: cards dictionary or array with zone === 'Graveyard'
      if (Array.isArray(cur.cards) && cur.cards.length > 0) {
        const gyByOwner = new Map();
        let hasZoneField = false;
        for (const card of cur.cards) {
          if (!card || typeof card !== 'object') continue;
          const z = String(card.zone || card.zoneName || '');
          if (!z) continue;
          hasZoneField = true;
          if (/graveyard/i.test(z)) {
            const owner = String(card.owner || card.ownerName || card.controller || card.player || 'unknown');
            const norm = normalizeCard(card);
            if (norm) {
              if (!gyByOwner.has(owner)) gyByOwner.set(owner, []);
              gyByOwner.get(owner).push(norm);
            }
          }
        }
        if (hasZoneField && gyByOwner.size > 0) {
          const players = [];
          for (const [owner, cards] of gyByOwner.entries()) {
            players.push({ name: owner, isSelf: false, isOpponent: false, graveyard: cards });
          }
          return { players };
        }
      }

      // Enqueue likely state sub-objects
      for (const key of ['state', 'game', 'gameState', 'data', 'payload', 'snapshot', 'view', 'delta', 'update']) {
        if (cur[key] && typeof cur[key] === 'object' && !seen.has(cur[key])) {
          queue.push(cur[key]);
        }
      }
    }

    return null;
  }

  let lastSignature = '';
  function inspectJsonString(text) {
    if (typeof text !== 'string' || text.length < 16) return;
    if (!text.includes('graveyard') && !text.includes('Graveyard')) return;
    try {
      const parsed = JSON.parse(text);
      const extracted = extractGraveyardsFromPayload(parsed);
      if (!extracted) return;
      const sig = JSON.stringify(extracted.players.map((p) => [p.name, p.graveyard.map((c) => c.name)]));
      if (sig === lastSignature) return;
      lastSignature = sig;
      window.postMessage(
        {
          source: 'upkeep-state',
          kind: 'graveyards',
          players: extracted.players,
          ts: Date.now(),
        },
        ORIGIN
      );
    } catch (_) {
      // Non-JSON or unrelated payload
    }
  }

  function handleWsData(data) {
    try {
      if (typeof data === 'string') {
        inspectJsonString(data);
      } else if (data instanceof Blob && data.size < 2_000_000) {
        data.text().then(inspectJsonString).catch(() => {});
      } else if (data instanceof ArrayBuffer && data.byteLength < 2_000_000) {
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(data);
        if (decoded.startsWith('{') || decoded.startsWith('[')) {
          inspectJsonString(decoded);
        }
      }
    } catch (_) {}
  }

  // Passive WebSocket observation (read-only)
  const NativeWebSocket = window.WebSocket;
  if (typeof NativeWebSocket === 'function' && NativeWebSocket.prototype) {
    const origAddEventListener = NativeWebSocket.prototype.addEventListener;
    if (typeof origAddEventListener === 'function') {
      NativeWebSocket.prototype.addEventListener = function (type, listener, options) {
        if (type === 'message' && typeof listener === 'function') {
          const wrapped = function (event) {
            handleWsData(event && event.data);
            return listener.call(this, event);
          };
          return origAddEventListener.call(this, type, wrapped, options);
        }
        return origAddEventListener.call(this, type, listener, options);
      };
    }

    const onmessageDesc = Object.getOwnPropertyDescriptor(NativeWebSocket.prototype, 'onmessage');
    if (onmessageDesc && typeof onmessageDesc.set === 'function') {
      Object.defineProperty(NativeWebSocket.prototype, 'onmessage', {
        configurable: true,
        enumerable: true,
        get: onmessageDesc.get,
        set(fn) {
          if (typeof fn !== 'function') {
            return onmessageDesc.set.call(this, fn);
          }
          return onmessageDesc.set.call(this, function (event) {
            handleWsData(event && event.data);
            return fn.call(this, event);
          });
        },
      });
    }
  }

  // Passive fetch observation for game snapshots
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (...args) {
      const promise = nativeFetch.apply(this, args);
      try {
        const reqUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (reqUrl.includes('/api/')) {
          promise
            .then((res) => {
              if (!res || !res.ok) return;
              const ct = res.headers?.get('content-type') || '';
              if (!ct.includes('json')) return;
              res
                .clone()
                .text()
                .then(inspectJsonString)
                .catch(() => {});
            })
            .catch(() => {});
        }
      } catch (_) {}
      return promise;
    };
  }
})();
