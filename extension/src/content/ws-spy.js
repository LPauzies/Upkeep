(() => {
  if (window.__UPKEEP_WS_SPY_INSTALLED__) return;
  window.__UPKEEP_WS_SPY_INSTALLED__ = true;

  const ORIGIN = window.location.origin;
  const PUBLIC_ZONES = ['battlefield', 'graveyard', 'exile', 'commandZone'];
  const PRIVATE_ZONES = new Set(['hand', 'libraryTop', 'exilePeek', 'battlefieldPeek']);

  function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function getItemId(item) {
    if (!isPlainObject(item)) return undefined;
    const id = hasOwn(item, 'id') ? item.id : undefined;
    return typeof id === 'string' || typeof id === 'number' ? id : undefined;
  }

  // Exact mirror of Endstep's incremental delta patcher (GAME_DELTA hashV 3/4)
  function applyValuePatch(prev, patch) {
    if (!patch || typeof patch !== 'object') return patch;
    if ('s' in patch) return patch.s;
    if ('o' in patch) {
      const next = {};
      if (isPlainObject(prev)) {
        for (const key of Object.keys(prev)) {
          next[key] = prev[key];
        }
      }
      if (isPlainObject(patch.o)) {
        for (const key of Object.keys(patch.o)) {
          next[key] = applyValuePatch(hasOwn(next, key) ? next[key] : undefined, patch.o[key]);
        }
      }
      if (Array.isArray(patch.d)) {
        for (const key of patch.d) {
          delete next[key];
        }
      }
      return next;
    }
    if (Array.isArray(patch.a)) {
      const byId = new Map();
      if (Array.isArray(prev)) {
        for (const item of prev) {
          const id = getItemId(item);
          if (id !== undefined) byId.set(id, item);
        }
      }
      return patch.a.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        if ('v' in entry) return entry.v;
        const existing = byId.get(entry.id);
        return entry.p ? applyValuePatch(existing, entry.p) : existing;
      });
    }
    return prev;
  }

  function applyGameDelta(baseState, deltaPayload) {
    if (!isPlainObject(baseState) || !isPlainObject(deltaPayload) || !isPlainObject(deltaPayload.patch)) {
      return null;
    }
    const patch = deltaPayload.patch;
    const next = {
      ...baseState,
      ...(isPlainObject(patch.state) ? patch.state : {}),
    };
    if ('pendingAction' in deltaPayload) {
      next.pendingAction = deltaPayload.pendingAction;
    }

    if (Array.isArray(patch.players) && patch.players.length > 0 && Array.isArray(baseState.players)) {
      const pMap = new Map();
      for (const p of patch.players) {
        if (p && typeof p.i === 'number') pMap.set(p.i, p);
      }
      next.players = baseState.players.map((pl, idx) => {
        const diff = pMap.get(idx);
        if (!diff) return pl;
        const { i: _idx, ...rest } = diff;
        return { ...pl, ...rest };
      });
    } else if (Array.isArray(baseState.players)) {
      next.players = baseState.players.slice();
    }

    if (deltaPayload.hashV === 3 || deltaPayload.hashV === 4 || Array.isArray(patch.zones) || patch.stack || patch.priv) {
      if (patch.stack) {
        next.stack = applyValuePatch(baseState.stack, patch.stack);
      }
      const zoneMap = new Map();
      if (Array.isArray(patch.zones)) {
        for (const z of patch.zones) {
          if (z && typeof z.i === 'number') zoneMap.set(z.i, z);
        }
      }
      const privMap = new Map();
      if (Array.isArray(patch.priv?.players)) {
        for (const pp of patch.priv.players) {
          if (pp && typeof pp.i === 'number') privMap.set(pp.i, pp);
        }
      }
      if ((zoneMap.size > 0 || privMap.size > 0) && Array.isArray(next.players)) {
        next.players = next.players.map((pl, idx) => {
          const zDiff = zoneMap.get(idx);
          const pDiff = privMap.get(idx);
          if (!zDiff && !pDiff) return pl;
          const updated = { ...pl };
          if (zDiff) {
            for (const zoneKey of PUBLIC_ZONES) {
              if (zDiff[zoneKey]) {
                updated[zoneKey] = applyValuePatch(updated[zoneKey], zDiff[zoneKey]);
              }
            }
          }
          if (pDiff?.set && isPlainObject(pDiff.set)) {
            for (const k of Object.keys(pDiff.set)) {
              if (PRIVATE_ZONES.has(k)) updated[k] = pDiff.set[k];
            }
          }
          if (Array.isArray(pDiff?.unset)) {
            for (const k of pDiff.unset) {
              if (PRIVATE_ZONES.has(k)) delete updated[k];
            }
          }
          return updated;
        });
      }
    }

    return next;
  }

  function buildImageUrl(name, setCode, collectorNumber, isBackFace) {
    const params = new URLSearchParams({ name });
    params.set('_v', '2');
    if (isBackFace) params.set('face', 'back');
    if (setCode && collectorNumber) {
      params.set('set', String(setCode));
      params.set('cn', String(collectorNumber));
    }
    return `/api/cards/image?${params.toString()}`;
  }

  function extractTypesArray(raw) {
    const src = raw?.types ?? raw?.cardTypes ?? raw?.card?.types ?? raw?.card?.cardTypes;
    if (Array.isArray(src)) {
      return src.map((t) => String(t).trim()).filter(Boolean);
    }
    return [];
  }

  function normalizeCard(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const name = raw.trim();
      return name ? { name, types: [], typeLine: '', manaCost: '', imageUrl: buildImageUrl(name) } : null;
    }
    if (typeof raw !== 'object') return null;

    const name = String(
      raw.name || raw.cardName || raw.card_name || raw.title || raw.card?.name || ''
    ).trim();
    if (!name || name === 'Hidden card') return null;

    const types = extractTypesArray(raw);
    const typeLine = String(
      raw.typeLine ||
        raw.type_line ||
        raw.card?.typeLine ||
        raw.card?.type_line ||
        (types.length > 0 ? types.join(' ') : typeof raw.type === 'string' ? raw.type : '')
    );
    const manaCost = String(
      raw.manaCost || raw.mana_cost || raw.cost || raw.card?.manaCost || raw.card?.mana_cost || ''
    );
    const setCode = String(
      raw.selectedSetCode ||
        raw.setCode ||
        raw.set ||
        raw.printing?.setCode ||
        raw.card?.selectedSetCode ||
        raw.card?.setCode ||
        ''
    ).trim();
    const collectorNumber = String(
      raw.selectedCollectorNumber ||
        raw.collectorNumber ||
        raw.cn ||
        raw.printing?.collectorNumber ||
        raw.card?.selectedCollectorNumber ||
        raw.card?.collectorNumber ||
        ''
    ).trim();
    const isBackFace = Boolean(raw.isBackFace);
    const id = raw.id != null ? String(raw.id) : raw.cardId != null ? String(raw.cardId) : undefined;

    let imageUrl = '';
    if (typeof raw.imageUrl === 'string' && raw.imageUrl) {
      imageUrl = raw.imageUrl;
    } else if (typeof raw.image === 'string' && raw.image) {
      imageUrl = raw.image;
    } else {
      imageUrl = buildImageUrl(name, setCode, collectorNumber, isBackFace);
    }

    return {
      id,
      name,
      types,
      typeLine,
      manaCost,
      setCode,
      collectorNumber,
      imageUrl,
    };
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

  function collectCatalogForPlayer(p) {
    const byKey = new Map();
    const zones = [
      p.graveyard,
      p.battlefield,
      p.hand,
      p.exile,
      p.commandZone,
      p.zones?.graveyard,
      p.zones?.battlefield,
      p.zones?.hand,
      p.zones?.exile,
    ];
    for (const z of zones) {
      if (!Array.isArray(z)) continue;
      for (const raw of z) {
        const c = normalizeCard(raw);
        if (!c) continue;
        const key = c.name.toLowerCase();
        const prev = byKey.get(key);
        const hasCustomArt = Boolean(c.setCode && c.collectorNumber);
        const prevHasCustomArt = Boolean(prev?.setCode && prev?.collectorNumber);
        if (!prev || (hasCustomArt && !prevHasCustomArt) || (c.types.length > (prev.types?.length || 0))) {
          byKey.set(key, {
            name: c.name,
            types: c.types.length > 0 ? c.types : prev?.types || [],
            typeLine: c.typeLine || prev?.typeLine || '',
            setCode: hasCustomArt ? c.setCode : prev?.setCode || '',
            collectorNumber: hasCustomArt ? c.collectorNumber : prev?.collectorNumber || '',
            imageUrl: hasCustomArt || !prevHasCustomArt ? c.imageUrl : prev.imageUrl,
          });
        }
      }
    }
    return Array.from(byKey.values());
  }

  let viewerSeat = null;
  let trackedState = null;

  function parseViewerSeat(audience) {
    if (typeof audience !== 'string') return null;
    const m = audience.match(/(?:player|seat)[:_-]?(\d+)/i);
    if (m) return parseInt(m[1], 10);
    return null;
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
        const selfId = cur.viewerPlayerId || cur.selfPlayerId || cur.yourPlayerId || null;

        for (let idx = 0; idx < cur.players.length; idx++) {
          const p = cur.players[idx];
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
            const seatIdx = typeof p.seat === 'number' ? p.seat : typeof p.index === 'number' ? p.index : idx;
            const isSelf = Boolean(
              p.isSelf ||
                p.isYou ||
                p.isMe ||
                p.self ||
                (selfId && p.id === selfId) ||
                (viewerSeat !== null && seatIdx === viewerSeat) ||
                (Array.isArray(p.hand) && p.hand.some((c) => c && c.name && c.name !== 'Hidden card'))
            );
            const isOpponent = Boolean(
              p.isOpponent || p.opponent || (viewerSeat !== null && cur.players.length === 2 && seatIdx !== viewerSeat)
            );
            players.push({
              name: String(p.name || p.username || p.displayName || p.playerName || ''),
              isSelf,
              isOpponent: isSelf ? false : isOpponent,
              seat: seatIdx,
              graveyard: extractCardArray(gyRaw),
              catalog: collectCatalogForPlayer(p),
            });
          }
        }
        if (foundAnyZone && players.length > 0) {
          const stackCatalog = Array.isArray(cur.stack) ? extractCardArray(cur.stack) : [];
          return { players, stackCatalog };
        }
      }

      // Case 2: direct opponentGraveyard / selfGraveyard keys
      const directOppGy = cur.opponentGraveyard || cur.oppGraveyard || cur.opponent_graveyard;
      const directSelfGy =
        cur.selfGraveyard || cur.myGraveyard || cur.yourGraveyard || cur.playerGraveyard || cur.self_graveyard;
      if (Array.isArray(directOppGy) || Array.isArray(directSelfGy)) {
        const players = [];
        if (Array.isArray(directOppGy)) {
          players.push({
            name: String(cur.opponentName || cur.opponent?.name || ''),
            isSelf: false,
            isOpponent: true,
            graveyard: extractCardArray(directOppGy),
            catalog: [],
          });
        }
        if (Array.isArray(directSelfGy)) {
          players.push({
            name: String(cur.selfName || cur.playerName || cur.self?.name || ''),
            isSelf: true,
            isOpponent: false,
            graveyard: extractCardArray(directSelfGy),
            catalog: [],
          });
        }
        if (players.length > 0) return { players, stackCatalog: [] };
      }

      // Case 3: cards array with zone === 'Graveyard'
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
            players.push({ name: owner, isSelf: false, isOpponent: false, graveyard: cards, catalog: [] });
          }
          return { players, stackCatalog: [] };
        }
      }

      for (const key of ['state', 'game', 'gameState', 'data', 'payload', 'snapshot', 'view', 'delta', 'update']) {
        if (cur[key] && typeof cur[key] === 'object' && !seen.has(cur[key])) {
          queue.push(cur[key]);
        }
      }
    }

    return null;
  }

  let lastSignature = '';

  function emitExtracted(extracted) {
    if (!extracted || !Array.isArray(extracted.players) || extracted.players.length === 0) return;
    const sig = JSON.stringify([
      extracted.players.map((p) => [
        p.name,
        p.isSelf,
        p.graveyard.map((c) => [c.name, c.imageUrl, c.types.join(',')]),
        p.catalog.length,
      ]),
      extracted.stackCatalog?.length || 0,
    ]);
    if (sig === lastSignature) return;
    lastSignature = sig;
    window.postMessage(
      {
        source: 'upkeep-state',
        kind: 'graveyards',
        players: extracted.players,
        stackCatalog: extracted.stackCatalog || [],
        ts: Date.now(),
      },
      ORIGIN
    );
  }

  function inspectJsonString(text) {
    if (typeof text !== 'string' || text.length < 16) return;
    if (
      !text.includes('GAME_STATE') &&
      !text.includes('GAME_DELTA') &&
      !text.includes('ATTACHED') &&
      !text.includes('graveyard') &&
      !text.includes('Graveyard')
    ) {
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') return;

      if (parsed.type === 'ATTACHED') {
        const seat = parseViewerSeat(parsed.payload?.audience);
        if (seat !== null) viewerSeat = seat;
        return;
      }

      if (parsed.type === 'GAME_STATE' && isPlainObject(parsed.payload)) {
        trackedState = parsed.payload;
        emitExtracted(extractGraveyardsFromPayload(trackedState));
        return;
      }

      if (parsed.type === 'GAME_DELTA' && isPlainObject(parsed.payload) && trackedState) {
        const patched = applyGameDelta(trackedState, parsed.payload);
        if (patched) {
          trackedState = patched;
          emitExtracted(extractGraveyardsFromPayload(trackedState));
        }
        return;
      }

      const extracted = extractGraveyardsFromPayload(parsed);
      if (extracted) {
        emitExtracted(extracted);
      }
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
