/**
 * アクション実行結果から発火するゲームイベントを導出する。
 * カード固有ロジックは持たず、action 名ベースで汎用イベントを生成する。
 */
export function eventsFromResolution(row) {
  if (!row) return [];

  const results = normalizeResults(row);
  const events = [];

  for (const { result, intent } of results) {
    if (!result || result.applied === false || result.cancelled) continue;
    const action = String(result.action || intent?.action || "");
    if (!action) continue;

    const baseData = {
      action,
      result,
      intent,
      sourceCardId: intent?.sourceCardId ?? null,
      sourceCardName: intent?.sourceCardName ?? null
    };

    events.push({ name: "ON_ACTION", data: baseData });
    events.push({ name: `ON_ACTION:${action}`, data: baseData });

    if (action === "DRAW_CARD" && Number(result.drawn) > 0) {
      events.push({
        name: "ON_DRAW",
        data: { ...baseData, count: result.drawn, cardIds: result.cards ?? [] }
      });
    }

    if (action === "RECOVER_PP" && Number(result.recovered) > 0) {
      events.push({
        name: "ON_PP_RECOVER",
        data: { ...baseData, amount: result.recovered, pp: result.pp }
      });
    }

    if (action === "MOVE_TO_GRAVE" && result.cardId) {
      events.push({
        name: "ON_MOVE_TO_GRAVE",
        data: { ...baseData, cardId: result.cardId, fromZone: result.fromZone }
      });
    }

    if (action === "RETURN_TO_DECK" && result.cardId) {
      events.push({
        name: "ON_RETURN_TO_DECK",
        data: { ...baseData, cardId: result.cardId }
      });
    }
  }

  return events;
}

function normalizeResults(row) {
  const fallbackIntent = row.effect ?? {};
  if (Array.isArray(row.results) && Array.isArray(row.executedIntents)) {
    return row.results.map((result, index) => ({
      result,
      intent: row.executedIntents[index] ?? fallbackIntent
    }));
  }
  if (Array.isArray(row.results)) {
    return row.results.map((result) => ({ result, intent: fallbackIntent }));
  }
  if (row.result) {
    const intent = row.executedIntents?.[0] ?? fallbackIntent;
    return [{ result: row.result, intent }];
  }
  return [];
}

/**
 * トリガー定義の listenEvent がイベント名にマッチするか。
 */
export function eventMatchesListen(listenEvent, eventName) {
  const listen = String(listenEvent || "");
  const name = String(eventName || "");
  if (!listen || !name) return false;
  if (listen === name) return true;
  if (listen === "ON_ACTION" && name.startsWith("ON_ACTION")) return true;
  return false;
}
