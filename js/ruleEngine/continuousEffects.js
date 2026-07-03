import { evaluateCondition } from "./conditions.js";
import { eventMatchesListen } from "./eventMap.js";

let effectIdSeq = 1;

/**
 * 常駐・継続効果を activeContinuousEffects に登録する。
 * @param {import('./GameState.js').GameState} gameState
 * @param {object} definition
 * @returns {object} 登録された効果オブジェクト
 */
export function registerContinuousEffect(gameState, definition) {
  const kind = String(definition.kind || "REPLACEMENT");
  const effect = {
    id: definition.id ?? `cont-${effectIdSeq++}`,
    kind,
    condition: definition.condition ?? null,
    priority: Number(definition.priority ?? 0),
    sourceCardId: definition.sourceCardId ?? null,
    sourceCardName: definition.sourceCardName ?? null,
    remainingUses: definition.remainingUses ?? null,
    oncePerChain: definition.oncePerChain === true
  };

  if (kind === "REPLACEMENT") {
    effect.interceptAction = String(definition.interceptAction || "");
    effect.replaceWith = normalizeReplaceWith(definition.replaceWith);
    effect.cancelOriginal = definition.cancelOriginal !== false;
  } else if (kind === "TRIGGER") {
    effect.listenEvent = String(definition.listenEvent || "");
    effect.response = normalizeResponse(definition.response);
    effect.responses = normalizeResponses(definition.responses, effect.response);
  } else if (kind === "PROXY") {
    effect.interceptAction = String(definition.interceptAction || "*");
    effect.delegateSourceCardId = definition.delegateSourceCardId ?? null;
    effect.delegateSourceCardName = definition.delegateSourceCardName ?? null;
    effect.delegateMode = String(definition.delegateMode || "REDIRECT_SOURCE");
    effect.delegateEffect = normalizeResponse(definition.delegateEffect);
    effect.onlyIfOnField = definition.onlyIfOnField !== false;
  }

  gameState.activeContinuousEffects.push(effect);
  return effect;
}

export function unregisterContinuousEffect(gameState, effectId) {
  const before = gameState.activeContinuousEffects.length;
  gameState.activeContinuousEffects = gameState.activeContinuousEffects.filter(
    (e) => e.id !== effectId
  );
  return before - gameState.activeContinuousEffects.length;
}

export function unregisterBySourceCard(gameState, sourceCardId) {
  gameState.activeContinuousEffects = gameState.activeContinuousEffects.filter(
    (e) => e.sourceCardId !== sourceCardId
  );
}

/**
 * カード DSL の continuous ブロックから常駐効果を生成して登録。
 */
export function registerContinuousFromDsl(gameState, continuousDef, sourceCard = {}) {
  return registerContinuousEffect(gameState, {
    ...continuousDef,
    sourceCardId: sourceCard.id ?? null,
    sourceCardName: sourceCard.name ?? null
  });
}

/**
 * 置換対象となる常駐効果を優先度順に取得（高い順）。
 */
export function getReplacementCandidates(gameState, actionName) {
  const target = String(actionName || "");
  return gameState.activeContinuousEffects
    .filter((eff) => eff.kind === "REPLACEMENT" && eff.interceptAction === target)
    .filter((eff) => eff.remainingUses == null || eff.remainingUses > 0)
    .sort((a, b) => Number(b.priority) - Number(a.priority));
}

/**
 * イベントに反応するトリガー常駐効果を優先度順に取得。
 */
export function getTriggerCandidates(gameState, eventName) {
  return gameState.activeContinuousEffects
    .filter((eff) => eff.kind === "TRIGGER")
    .filter((eff) => eventMatchesListen(eff.listenEvent, eventName))
    .filter((eff) => eff.remainingUses == null || eff.remainingUses > 0)
    .sort((a, b) => Number(b.priority) - Number(a.priority));
}

/**
 * 代行対象となる常駐効果を優先度順に取得。
 */
export function getProxyCandidates(gameState, actionName) {
  const target = String(actionName || "");
  return gameState.activeContinuousEffects
    .filter((eff) => eff.kind === "PROXY")
    .filter((eff) => eff.interceptAction === "*" || eff.interceptAction === target)
    .filter((eff) => eff.remainingUses == null || eff.remainingUses > 0)
    .sort((a, b) => Number(b.priority) - Number(a.priority));
}

export function isCardOnField(gameState, cardId) {
  if (!cardId) return false;
  return gameState.field.some((c) => c.id === cardId);
}

export function findCardById(gameState, cardId) {
  if (!cardId) return null;
  const zones = ["field", "hand", "grave", "deck"];
  for (const zoneName of zones) {
    const found = gameState[zoneName]?.find((c) => c.id === cardId);
    if (found) return { ...found, zone: zoneName };
  }
  return null;
}

export function consumeContinuousUse(gameState, effectId) {
  const effect = gameState.activeContinuousEffects.find((e) => e.id === effectId);
  if (!effect || effect.remainingUses == null) return;
  effect.remainingUses = Math.max(0, effect.remainingUses - 1);
  if (effect.remainingUses <= 0) {
    unregisterContinuousEffect(gameState, effectId);
  }
}

function normalizeReplaceWith(replaceWith) {
  if (replaceWith == null) return [];
  return Array.isArray(replaceWith) ? replaceWith.map(cloneIntent) : [cloneIntent(replaceWith)];
}

function normalizeResponse(response) {
  if (!response || typeof response !== "object") return null;
  return cloneIntent(response);
}

function normalizeResponses(responses, fallback) {
  if (Array.isArray(responses) && responses.length > 0) {
    return responses.map(cloneIntent);
  }
  return fallback ? [fallback] : [];
}

function cloneIntent(intent) {
  return { ...intent };
}

export function matchesContinuousCondition(effect, gameState, intent, eventData = null) {
  if (!effect.condition) return true;
  const ctx = intent?.context ?? eventData ?? {};
  if (ctx.cardId && effect.condition.sourceCardId) {
    if (ctx.cardId !== effect.condition.sourceCardId) return false;
  }
  return evaluateCondition(effect.condition, gameState);
}
