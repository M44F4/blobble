// What differs per desktop lives in desktop/ (one module each); this is the shared view of it:
// the words, which ring actions and reactions work, and the few names.
import * as Actions from "../core/Actions.mjs";
import { OS, SHELL } from "../desktop/detect.js";
import { desktop } from "../desktop/index.js";

export { OS, SHELL, desktop };
export const NAME = desktop.name;
export const word = (key) => desktop.words[key];
export const defaultHome = () => desktop.defaultHome;

export function supported(id) { return desktop.missingActions.indexOf(id) === -1; }

export function action(id) {
  const a = Actions.byId(id);
  if (!a) return null;
  return Object.assign({}, a, { label: desktop.actionLabels[id] || a.label });
}

export const ACTIONS = Actions.ACTIONS.filter((a) => supported(a.id)).map((a) => action(a.id));

export function ring(saved) {
  return Actions.ring(saved).filter((a) => supported(a.id)).map((a) => action(a.id));
}

// Reactions this desktop can feel so far; the rest are shown as "not on <name> yet".
export function feels(key) { return desktop.reactions.indexOf(key) !== -1; }
