import * as A from "@automerge/automerge";
import { ChangeType, getChanges, type Change } from "@homeostate/core";

export type Container = Record<string, unknown>;

const isRecord = (value: unknown): value is Container =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const diff = (current: unknown, next: unknown): Change[] | null => {
  if (!isRecord(next)) return [];
  return isRecord(current) ? getChanges(current, next) : null;
};

export const applyChanges = (
  doc: Container,
  path: A.Prop[],
  changes: Change[],
): void => {
  const container = path.reduce<unknown>(
    (value, prop) => (value as Container)[prop],
    doc,
  );
  for (const [type, key, value] of changes) {
    if (typeof container === "string")
      applyToText(doc, path, type, key as number, value);
    else if (Array.isArray(container))
      applyToList(doc, path, container, type, key as number, value);
    else
      applyToMap(doc, path, container as Container, type, key as string, value);
  }
};

const applyToMap = (
  doc: Container,
  path: A.Prop[],
  map: Container,
  type: ChangeType,
  key: string,
  value: unknown,
): void => {
  switch (type) {
    case ChangeType.INSERT:
    case ChangeType.UPDATE:
      map[key] = value;
      break;

    case ChangeType.DELETE:
      delete map[key];
      break;

    case ChangeType.PENDING:
      applyChanges(doc, [...path, key], value as Change[]);
      break;
  }
};

const applyToList = (
  doc: Container,
  path: A.Prop[],
  list: unknown[],
  type: ChangeType,
  index: number,
  value: unknown,
): void => {
  switch (type) {
    case ChangeType.INSERT:
      A.insertAt(list, index, value);
      break;

    case ChangeType.UPDATE:
      list[index] = value;
      break;

    case ChangeType.DELETE:
      A.deleteAt(list, index, 1);
      break;

    case ChangeType.PENDING:
      applyChanges(doc, [...path, index], value as Change[]);
      break;
  }
};

const applyToText = (
  doc: Container,
  path: A.Prop[],
  type: ChangeType,
  index: number,
  value: unknown,
): void => {
  if (type === ChangeType.INSERT)
    A.splice(doc, path, index, 0, value as string);
  else if (type === ChangeType.DELETE)
    A.splice(doc, path, index, typeof value === "number" ? value : 1);
};
