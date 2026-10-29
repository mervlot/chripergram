import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;
type Query = Record<string, any>;
type ColumnInfo = { name: string; type: string; pk: number; notnull: number };
type Relation = { model?: string; many?: boolean; where?: Row; value?: any };

const boolFields = new Set(['emailVerified', 'verified', 'isPrivate', 'read', 'marketingOptIn']);
const dateFields = new Set([
  'createdAt', 'updatedAt', 'editedAt', 'lastSeenAt', 'expiresAt', 'revokedAt',
  'lastUsedAt', 'rotationGraceUntil', 'usedAt', 'termsAcceptedAt', 'readAt', 'deletedAt', 'joinedAt', 'viewedAt', 'endsAt',
]);
const jsonFields: Record<string, Set<string>> = {
  post: new Set(['media', 'mediaJson', 'poll']),
  poll: new Set(['options']),
};
const operators = new Set([
  'equals', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'not', 'contains', 'startsWith', 'endsWith',
]);

const camelToSnake = (value: string) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const snakeToCamel = (value: string) => value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

function dateMillis(value: any): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function isDateColumn(column: string) {
  return /(?:_at|_until|^expires_at$|^created_at$|^updated_at$)/i.test(column);
}

function parseJson(value: any) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function createSqliteModels(sqlite: DatabaseSync, modelTables: Record<string, string>) {
  const knownModels = new Set(Object.keys(modelTables));
  const columnCache = new Map<string, Map<string, ColumnInfo>>();
  let transactionDepth = 0;
  let savepointCounter = 0;

  function columns(table: string) {
    let result = columnCache.get(table);
    if (!result) {
      result = new Map(
        (sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all() as ColumnInfo[]).map((column) => [column.name, column]),
      );
      columnCache.set(table, result);
    }
    return result;
  }

  function primaryColumns(table: string) {
    return [...columns(table).values()].filter((item) => item.pk > 0).sort((a, b) => a.pk - b.pk).map((item) => item.name);
  }

  function normalizeValue(model: string, key: string, input: any): any {
    if (input === undefined || input === null) return input ?? null;
    if (input instanceof Date) {
      if (!Number.isFinite(input.getTime())) throw new TypeError(`${model}.${key} must be a valid date`);
      return input.toISOString();
    }
    const table = modelTables[model];
    const physical = camelToSnake(key);
    const info = columns(table).get(physical);
    if (!info) throw new Error(`Unknown SQLite column "${table}.${physical}"`);
    const affinity = info.type.toUpperCase();
    if (jsonFields[model]?.has(key)) {
      if (typeof input === 'string') {
        try { JSON.parse(input); } catch { throw new TypeError(`${model}.${key} must contain valid JSON`); }
        return input;
      }
      return JSON.stringify(input);
    }
    if (boolFields.has(key)) {
      if (typeof input === 'boolean') return input ? 1 : 0;
      if (input === 0 || input === 1) return input;
      throw new TypeError(`${model}.${key} must be a boolean`);
    }
    if (affinity === 'INTEGER' || affinity === 'REAL' || affinity === 'NUMERIC') {
      if (typeof input !== 'number' || !Number.isFinite(input)) {
        throw new TypeError(`${model}.${key} must be a finite number`);
      }
      if (affinity === 'INTEGER' && !Number.isInteger(input)) {
        throw new TypeError(`${model}.${key} must be an integer`);
      }
      return input;
    }
    if (affinity === 'BLOB') {
      if (Buffer.isBuffer(input)) return input;
      if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
      throw new TypeError(`${model}.${key} must be a byte buffer`);
    }
    if (typeof input !== 'string') {
      throw new TypeError(`${model}.${key} must be a string${info.notnull ? ' or null' : ''}`);
    }
    return input;
  }

  function fromRow(model: string, raw: Row | undefined): Row | null {
    if (!raw) return null;
    const row: Row = Object.fromEntries(Object.entries(raw).map(([key, input]) => {
      const camelKey = snakeToCamel(key);
      let value = jsonFields[model]?.has(camelKey) ? parseJson(input) : input;
      if (dateFields.has(camelKey) && typeof value === 'string') {
        const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
          ? `${value.replace(' ', 'T')}Z`
          : value;
        const parsed = new Date(normalized);
        if (Number.isFinite(parsed.getTime())) value = parsed;
      }
      return [camelKey, boolFields.has(camelKey) && value !== null ? Boolean(value) : value];
    }));
    if (model === 'story') {
      row.authorId ??= row.userId;
      row.userId ??= row.authorId;
    }
    if (model === 'notification') {
      row.recipientId ??= row.userId;
      row.userId ??= row.recipientId;
    }
    if (model === 'post') {
      if (!Array.isArray(row.media) && row.media && typeof row.media === 'object') {
        row.media = row.media.create ?? row.media;
      }
      if (!Array.isArray(row.media) && Array.isArray(row.mediaJson)) row.media = row.mediaJson;
      if (!Array.isArray(row.media)) row.media = [];
    }
    return row;
  }

  function sqlValue(model: string, key: string, input: any) {
    if (input instanceof Date) {
      if (!Number.isFinite(input.getTime())) throw new TypeError(`${model}.${key} must be a valid date`);
      return input.toISOString();
    }
    if (input === null || input === undefined) return null;
    if (boolFields.has(key)) {
      if (typeof input === 'boolean') return input ? 1 : 0;
      if (input === 0 || input === 1) return input;
    }
    const info = columns(modelTables[model]).get(camelToSnake(key));
    if (info && /^(INTEGER|REAL|NUMERIC)$/.test(info.type.toUpperCase())) {
      if (typeof input !== 'number' || !Number.isFinite(input)) {
        throw new TypeError(`${model}.${key} must be a finite number`);
      }
      if (info.type.toUpperCase() === 'INTEGER' && !Number.isInteger(input)) {
        throw new TypeError(`${model}.${key} must be an integer`);
      }
      return input;
    }
    if (info?.type.toUpperCase() === 'BLOB') {
      if (Buffer.isBuffer(input)) return input;
      if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
      throw new TypeError(`${model}.${key} must be a byte buffer`);
    }
    if (typeof input === 'string') return input;
    if (input instanceof Date) return input.toISOString();
    throw new TypeError(`${model}.${key} must be a scalar value`);
  }

  function compareValue(actual: any, expected: any, column?: string): boolean {
    if (expected instanceof Date || (column && isDateColumn(column))) {
      const left = dateMillis(actual);
      const right = dateMillis(expected);
      return left !== null && right !== null && left === right;
    }
    if (typeof expected === 'boolean') return Boolean(actual) === expected;
    if (actual == null || expected == null) return actual == null && expected == null;
    if (typeof actual === 'number' && typeof expected === 'number') return actual === expected;
    return String(actual) === String(expected);
  }

  function conditionMatches(actual: any, expected: any, column?: string): boolean {
    if (expected === null) return actual == null;
    if (expected instanceof Date || Array.isArray(expected) || typeof expected !== 'object') {
      return compareValue(actual, expected, column);
    }
    const keys = Object.keys(expected);
    if (!keys.some((key) => operators.has(key))) return false;
    for (const [operator, operand] of Object.entries(expected)) {
      if (operator === 'equals' && !compareValue(actual, operand, column)) return false;
      if (operator === 'in' && (!Array.isArray(operand) || !operand.some((item: any) => compareValue(actual, item, column)))) return false;
      if (operator === 'notIn' && Array.isArray(operand) && operand.some((item: any) => compareValue(actual, item, column))) return false;
      if (operator === 'not' && conditionMatches(actual, operand, column)) return false;
      if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
        const left = column && isDateColumn(column) ? dateMillis(actual) : Number(actual);
        const right = column && isDateColumn(column) ? dateMillis(operand) : Number(operand);
        if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) return false;
        if (operator === 'gt' && !(left > right)) return false;
        if (operator === 'gte' && !(left >= right)) return false;
        if (operator === 'lt' && !(left < right)) return false;
        if (operator === 'lte' && !(left <= right)) return false;
      }
      if (operator === 'contains' && !String(actual ?? '').toLocaleLowerCase().includes(String(operand).toLocaleLowerCase())) return false;
      if (operator === 'startsWith' && !String(actual ?? '').toLocaleLowerCase().startsWith(String(operand).toLocaleLowerCase())) return false;
      if (operator === 'endsWith' && !String(actual ?? '').toLocaleLowerCase().endsWith(String(operand).toLocaleLowerCase())) return false;
    }
    return true;
  }

  function matchesPlain(row: Row, where: Query = {}): boolean {
    if (!where || !Object.keys(where).length) return true;
    if (where.OR && (!Array.isArray(where.OR) || !where.OR.some((part: Query) => matchesPlain(row, part)))) return false;
    if (where.AND && (!Array.isArray(where.AND) || !where.AND.every((part: Query) => matchesPlain(row, part)))) return false;
    if (where.NOT && matchesPlain(row, where.NOT)) return false;
    return Object.entries(where).every(([key, expected]) => {
      if (['OR', 'AND', 'NOT'].includes(key)) return true;
      return conditionMatches(row[key], expected);
    });
  }

  function relationData(model: string, row: Row, key: string): Relation {
    const one = (target: string, where: Row): Relation => ({ model: target, where });
    const many = (target: string, where: Row): Relation => ({ model: target, where, many: true });
    switch (model) {
      case 'user':
        if (key === 'followers') return many('follow', { followingId: row.id });
        if (key === 'following') return many('follow', { followerId: row.id });
        if (key === 'posts') return many('post', { authorId: row.id });
        break;
      case 'post':
        if (key === 'author') return one('user', { id: row.authorId });
        if (key === 'media') return { many: true, value: row.media ?? [] };
        if (key === 'hashtags') return many('postHashtag', { postId: row.id });
        if (key === 'community') return row.communityId ? one('community', { id: row.communityId }) : { value: null };
        if (key === 'poll') return one('poll', { postId: row.id });
        if (key === 'likes') return many('like', { postId: row.id });
        if (key === 'bookmarks') return many('bookmark', { postId: row.id });
        if (key === 'reposts') return many('post', { repostOfId: row.id });
        if (key === 'replies') return many('post', { parentId: row.id });
        if (key === 'quotes') return many('post', { quotedPostId: row.id });
        if (key === 'repostOf') return row.repostOfId ? one('post', { id: row.repostOfId }) : { value: null };
        if (key === 'quotedPost') return row.quotedPostId ? one('post', { id: row.quotedPostId }) : { value: null };
        break;
      case 'postHashtag':
        if (key === 'hashtag') return one('hashtag', { id: row.hashtagId });
        if (key === 'post') return one('post', { id: row.postId });
        break;
      case 'mention':
        if (key === 'user') return one('user', { id: row.userId });
        if (key === 'post') return one('post', { id: row.postId });
        break;
      case 'poll':
        if (key === 'post') return one('post', { id: row.postId });
        if (key === 'options') return many('pollOption', { pollId: row.id });
        if (key === 'votes') return many('pollVote', { pollId: row.id });
        break;
      case 'pollOption':
        if (key === 'poll') return one('poll', { id: row.pollId });
        if (key === 'votes') return many('pollVote', { optionId: row.id });
        break;
      case 'pollVote':
        if (key === 'user') return one('user', { id: row.userId });
        if (key === 'option') return one('pollOption', { id: row.optionId });
        break;
      case 'story':
        if (key === 'author') return one('user', { id: row.authorId });
        if (key === 'views') return many('storyView', { storyId: row.id });
        break;
      case 'storyView':
        if (key === 'user') return one('user', { id: row.userId });
        if (key === 'story') return one('story', { id: row.storyId });
        break;
      case 'community':
        if (key === 'members') return many('communityMember', { communityId: row.id });
        if (key === 'posts') return many('post', { communityId: row.id });
        if (key === 'messages') return many('communityMessage', { communityId: row.id });
        break;
      case 'communityMember':
        if (key === 'community') return one('community', { id: row.communityId });
        if (key === 'user') return one('user', { id: row.userId });
        break;
      case 'communityMessage':
        if (key === 'community') return one('community', { id: row.communityId });
        if (key === 'sender') return one('user', { id: row.senderId });
        if (key === 'reactions') return many('communityMessageReaction', { messageId: row.id });
        break;
      case 'communityMessageReaction':
      case 'messageReaction':
        if (key === 'user') return one('user', { id: row.userId });
        if (key === 'message') return one(model === 'messageReaction' ? 'message' : 'communityMessage', { id: row.messageId });
        break;
      case 'conversation':
        if (key === 'userA') return one('user', { id: row.userAId });
        if (key === 'userB') return one('user', { id: row.userBId });
        if (key === 'messages') return many('message', { conversationId: row.id });
        break;
      case 'message':
        if (key === 'conversation') return one('conversation', { id: row.conversationId });
        if (key === 'sender') return one('user', { id: row.senderId });
        if (key === 'replyTo') return row.replyToId ? one('message', { id: row.replyToId }) : { value: null };
        if (key === 'reactions') return many('messageReaction', { messageId: row.id });
        break;
      case 'notification':
        if (key === 'actor') return row.actorId ? one('user', { id: row.actorId }) : { value: null };
        if (key === 'recipient') return one('user', { id: row.recipientId });
        if (key === 'post') return row.postId ? one('post', { id: row.postId }) : { value: null };
        break;
      case 'bookmark':
        if (key === 'user') return one('user', { id: row.userId });
        if (key === 'post') return one('post', { id: row.postId });
        break;
      case 'like':
        if (key === 'user') return one('user', { id: row.userId });
        if (key === 'post') return one('post', { id: row.postId });
        break;
      case 'follow':
        if (key === 'follower') return one('user', { id: row.followerId });
        if (key === 'following') return one('user', { id: row.followingId });
        break;
    }
    return { value: undefined };
  }

  function getRelated(model: string, row: Row, key: string, relationArgs: Query = {}): any {
    const relation = relationData(model, row, key);
    if (relation.value !== undefined) {
      if (relation.many && Array.isArray(relation.value)) {
        return relation.value.map((item: any) => projectPlainObject(item, relationArgs));
      }
      return relation.value;
    }
    if (!relation.model) throw new Error(`Unknown relation "${model}.${key}"`);
    let rows = findRows(relation.model, { where: relation.where });
    if (relationArgs.where) rows = rows.filter((item) => matches(relation.model!, item, relationArgs.where));
    rows = applyOrder(relation.model, rows, relationArgs.orderBy);
    if (relationArgs.skip) rows = rows.slice(Math.max(0, Number(relationArgs.skip)));
    if (relationArgs.take !== undefined) rows = rows.slice(0, Math.max(0, Number(relationArgs.take)));
    const shaped = rows.map((item) => project(relation.model!, item, relationArgs));
    return relation.many ? shaped : shaped[0] ?? null;
  }

  function relationCount(model: string, row: Row, key: string): number {
    const relation = relationData(model, row, key);
    if (relation.value !== undefined) return Array.isArray(relation.value) ? relation.value.length : Number(Boolean(relation.value));
    if (!relation.model) return 0;
    return findRows(relation.model, { where: relation.where }).length;
  }

  function matches(model: string, row: Row, where: Query = {}): boolean {
    if (!where || !Object.keys(where).length) return true;
    if (where.OR && (!Array.isArray(where.OR) || !where.OR.some((part: Query) => matches(model, row, part)))) return false;
    if (where.AND && (!Array.isArray(where.AND) || !where.AND.every((part: Query) => matches(model, row, part)))) return false;
    if (where.NOT && matches(model, row, where.NOT)) return false;

    for (const [key, expected] of Object.entries(where)) {
      if (['OR', 'AND', 'NOT'].includes(key)) continue;
      const physical = camelToSnake(key);
      const info = columns(modelTables[model]).get(physical);
      const relation = relationData(model, row, key);
      const hasQuantifier = expected && typeof expected === 'object' && !Array.isArray(expected)
        && ('some' in expected || 'none' in expected || 'every' in expected);
      if (hasQuantifier && (relation.model || relation.value !== undefined)) {
        const related = getRelated(model, row, key);
        if (!Array.isArray(related)) return false;
        const matchesRelated = (item: Row, filter: Query) =>
          relation.model ? matches(relation.model, item, filter) : matchesPlain(item, filter);
        if ('some' in expected && !related.some((item) => matchesRelated(item, expected.some))) return false;
        if ('none' in expected && related.some((item) => matchesRelated(item, expected.none))) return false;
        if ('every' in expected && !related.every((item) => matchesRelated(item, expected.every))) return false;
        continue;
      }
      if (info) {
        const actual = row[snakeToCamel(physical)] ?? row[key];
        if (!conditionMatches(actual, expected, physical)) return false;
        continue;
      }
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        // Unique selectors for composite primary/unique keys are named as
        // field_field in the service layer, but remain ordinary column values.
        const selector = Object.keys(expected).every((field) => columns(modelTables[model]).has(camelToSnake(field)));
        if (selector) {
          if (!matches(model, row, expected)) return false;
          continue;
        }
      }
      if (!relation.model && relation.value === undefined) return false;
      const related = getRelated(model, row, key);
      if (expected && typeof expected === 'object' && !Array.isArray(expected)
          && ('some' in expected || 'none' in expected || 'every' in expected)) {
        if (!Array.isArray(related)) return false;
        const matchesRelated = (item: Row, filter: Query) =>
          relation.model ? matches(relation.model, item, filter) : matchesPlain(item, filter);
        if ('some' in expected && !related.some((item) => matchesRelated(item, expected.some))) return false;
        if ('none' in expected && related.some((item) => matchesRelated(item, expected.none))) return false;
        if ('every' in expected && !related.every((item) => matchesRelated(item, expected.every))) return false;
        continue;
      }
      if (Array.isArray(related)) {
        if (!related.some((item) => relation.model ? matches(relation.model, item, expected) : matchesPlain(item, expected))) return false;
      } else if (!related || (relation.model ? !matches(relation.model, related, expected) : !matchesPlain(related, expected))) {
        return false;
      }
    }
    return true;
  }

  function compileCondition(model: string, key: string, expected: any, params: any[]): string | null {
    const physical = camelToSnake(key);
    const info = columns(modelTables[model]).get(physical);
    if (!info) {
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        const nested = Object.keys(expected).every((field) => columns(modelTables[model]).has(camelToSnake(field)));
        if (nested) return compileWhere(model, expected, params);
      }
      return null;
    }
    const identifier = quote(physical);
    const dateExpr = isDateColumn(physical) ? `julianday(${identifier})` : identifier;
    if (expected === null) return `${identifier} IS NULL`;
    if (!expected || typeof expected !== 'object' || expected instanceof Date || Array.isArray(expected)) {
      params.push(sqlValue(model, key, expected));
      return `${identifier} = ?`;
    }
    const parts: string[] = [];
    for (const [operator, operand] of Object.entries(expected)) {
      if (!operators.has(operator)) return null;
      if (operator === 'equals') {
        if (operand === null) parts.push(`${identifier} IS NULL`);
        else { params.push(sqlValue(model, key, operand)); parts.push(`${identifier} = ?`); }
      } else if (operator === 'not') {
        if (operand === null) parts.push(`${identifier} IS NOT NULL`);
        else { params.push(sqlValue(model, key, operand)); parts.push(`${identifier} <> ?`); }
      } else if (operator === 'in' || operator === 'notIn') {
        if (!Array.isArray(operand)) return null;
        if (!operand.length) {
          parts.push(operator === 'in' ? '0' : '1');
        } else {
          params.push(...operand.map((item) => sqlValue(model, key, item)));
          parts.push(`${identifier} ${operator === 'in' ? 'IN' : 'NOT IN'} (${operand.map(() => '?').join(', ')})`);
        }
      } else if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
        const symbol = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator];
        if (isDateColumn(physical)) {
          params.push(sqlValue(model, key, operand));
          parts.push(`${dateExpr} ${symbol} julianday(?)`);
        } else {
          params.push(sqlValue(model, key, operand));
          parts.push(`${identifier} ${symbol} ?`);
        }
      } else if (operator === 'contains') {
        params.push(String(operand).toLocaleLowerCase());
        parts.push(`instr(lower(COALESCE(CAST(${identifier} AS TEXT), '')), ?) > 0`);
      } else if (operator === 'startsWith' || operator === 'endsWith') {
        const value = String(operand).replace(/[\\%_]/g, '\\$&');
        params.push(operator === 'startsWith' ? `${value}%` : `%${value}`);
        parts.push(`${identifier} LIKE ? ESCAPE '\\'`);
      }
    }
    return parts.length ? `(${parts.join(' AND ')})` : null;
  }

  function compileWhere(model: string, where: Query = {}, params: any[] = []): string | null {
    if (!where || !Object.keys(where).length) return '1';
    const parts: string[] = [];
    for (const [key, expected] of Object.entries(where)) {
      if (key === 'OR' || key === 'AND') {
        if (!Array.isArray(expected)) return null;
        if (!expected.length) {
          parts.push(key === 'AND' ? '1' : '0');
          continue;
        }
        const nestedParts: string[] = [];
        for (const part of expected) {
          const nested = compileWhere(model, part, params);
          if (nested === null) return null;
          nestedParts.push(`(${nested})`);
        }
        parts.push(`(${nestedParts.join(key === 'AND' ? ' AND ' : ' OR ')})`);
      } else if (key === 'NOT') {
        const nested = compileWhere(model, expected, params);
        if (nested === null) return null;
        parts.push(`NOT (${nested})`);
      } else {
        const condition = compileCondition(model, key, expected, params);
        if (condition === null) return null;
        parts.push(condition);
      }
    }
    return parts.join(' AND ');
  }

  function compileOrder(model: string, orderBy: any): string | null {
    if (!orderBy) return '';
    const clauses: string[] = [];
    const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
    for (const item of entries) {
      if (!item || typeof item !== 'object') return null;
      for (const [key, directionValue] of Object.entries(item)) {
        const direction = String(directionValue).toLowerCase();
        if (direction !== 'asc' && direction !== 'desc') return null;
        const physical = camelToSnake(key);
        if (!columns(modelTables[model]).has(physical)) return null;
        const expression = isDateColumn(physical) ? `julianday(${quote(physical)})` : quote(physical);
        clauses.push(`${expression} ${direction.toUpperCase()}`);
      }
    }
    return clauses.join(', ');
  }

  function readRows(model: string, where?: Query): Row[] {
    const table = modelTables[model];
    const params: any[] = [];
    const compiled = compileWhere(model, where ?? {}, params);
    const sql = `SELECT * FROM ${quote(table)}${compiled ? ` WHERE ${compiled}` : ''}`;
    // When part of the filter can't be expressed in SQL (e.g. relation filters
    // like media.some), the query runs without a WHERE clause and is filtered in
    // memory. The params gathered while compiling must be dropped in that case,
    // otherwise SQLite throws "column index out of range".
    const raw = sqlite.prepare(sql).all(...(compiled === null ? [] : params)) as Row[];
    const rows = raw.map((item) => fromRow(model, item)!).filter(Boolean);
    return compiled === null ? rows.filter((item) => matches(model, item, where)) : rows;
  }

  function applyOrder(model: string, rows: Row[], orderBy: any): Row[] {
    if (!orderBy) return rows;
    const compiled = compileOrder(model, orderBy);
    if (compiled !== null) {
      const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
      return [...rows].sort((a, b) => {
        for (const item of entries) {
        for (const [key, rawDirection] of Object.entries(item)) {
          let direction: any = rawDirection;
            const physical = camelToSnake(key);
            let left = a[key];
            let right = b[key];
            if (isDateColumn(physical)) {
              left = dateMillis(left);
              right = dateMillis(right);
            }
            const comparison = left == null && right == null ? 0
              : left == null ? -1
                : right == null ? 1
                  : typeof left === 'number' && typeof right === 'number' ? left - right
                    : String(left).localeCompare(String(right));
            if (comparison) return String(direction).toLowerCase() === 'desc' ? -comparison : comparison;
          }
        }
        return 0;
      });
    }
    const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const item of entries) {
        for (const [key, rawDirection] of Object.entries(item)) {
          let direction: any = rawDirection;
          let left: any;
          let right: any;
          if (rawDirection && typeof rawDirection === 'object' && '_count' in (rawDirection as object)) {
            left = relationCount(model, a, key);
            right = relationCount(model, b, key);
            direction = (rawDirection as any)._count;
          } else {
            left = a[key];
            right = b[key];
            if (isDateColumn(camelToSnake(key))) {
              left = dateMillis(left);
              right = dateMillis(right);
            }
          }
          const comparison = left == null && right == null ? 0
            : left == null ? -1
              : right == null ? 1
                : typeof left === 'number' && typeof right === 'number' ? left - right
                  : String(left).localeCompare(String(right));
          if (comparison) return String(direction).toLowerCase() === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  function selectorWhere(model: string, selector: Query = {}): Query {
    const result: Query = {};
    const cols = columns(modelTables[model]);
    for (const [key, value] of Object.entries(selector ?? {})) {
      if (cols.has(camelToSnake(key))) result[key] = value;
      else if (value && typeof value === 'object' && !Array.isArray(value)) {
        const entries = Object.entries(value as object);
        if (entries.length && entries.every(([field]) => cols.has(camelToSnake(field)))) {
          Object.assign(result, Object.fromEntries(entries));
        }
      }
    }
    return result;
  }

  function findRows(model: string, args: Query = {}): Row[] {
    const where = args.where ?? {};
    let rows = readRows(model, where);
    rows = applyOrder(model, rows, args.orderBy);
    if (args.cursor) {
      const selector = selectorWhere(model, args.cursor);
      const index = rows.findIndex((row) => matches(model, row, selector));
      if (index >= 0) rows = rows.slice(index + (args.skip ? Math.max(0, Number(args.skip)) : 0));
      else rows = [];
    } else if (args.skip) {
      rows = rows.slice(Math.max(0, Number(args.skip)));
    }
    if (args.take !== undefined) {
      const take = Number(args.take);
      if (!Number.isInteger(take) || take < 0) throw new TypeError(`${model}.findMany take must be a non-negative integer`);
      rows = rows.slice(0, take);
    }
    return rows;
  }

  function projectPlainObject(row: Row, args: Query = {}) {
    if (!args.select) return { ...row };
    return Object.fromEntries(Object.entries(args.select).filter(([, selected]) => selected).map(([key]) => [key, row[key]]));
  }

  function project(model: string, row: Row, args: Query = {}): Row {
    const output: Row = args.select ? {} : { ...row };
    const fields = args.select ?? args.include ?? {};
    for (const [key, specification] of Object.entries(fields)) {
      if (!specification) continue;
      if (key === '_count') {
        const countSpec = typeof specification === 'object' ? (specification as Query).select ?? {} : {};
        output._count = Object.fromEntries(Object.entries(countSpec).map(([relation, enabled]) => [
          relation,
          enabled ? relationCount(model, row, relation) : 0,
        ]));
        continue;
      }
      if (args.select && columns(modelTables[model]).has(camelToSnake(key))) {
        output[key] = row[key];
        continue;
      }
      const nestedArgs = specification === true ? {} : (specification as Query);
      const related = getRelated(model, row, key, nestedArgs);
      if (related === undefined) continue;
      output[key] = related;
    }
    return output;
  }

  function insertRaw(model: string, data: Row): Row {
    const table = modelTables[model];
    const cols = columns(table);
    const normalized = { ...data };
    if (model === 'story') {
      normalized.authorId ??= normalized.userId;
      normalized.userId ??= normalized.authorId;
    }
    if (model === 'notification') {
      normalized.userId ??= normalized.recipientId;
      normalized.recipientId ??= normalized.userId;
    }
    if (model === 'post' && normalized.media !== undefined) {
      const media = normalized.media;
      const serialized = typeof media === 'string' ? media : JSON.stringify(media);
      normalized.media = serialized;
      if (cols.has('media_json')) normalized.mediaJson = serialized;
    }
    const primary = primaryColumns(table);
    if (primary.length === 1 && primary[0] === 'id' && !normalized.id) normalized.id = randomUUID();

    const entries: Array<[string, any]> = [];
    for (const [key, input] of Object.entries(normalized)) {
      const physical = camelToSnake(key);
      if (!cols.has(physical) || input === undefined || input === null && model === 'post' && key === 'poll') continue;
      if (input && typeof input === 'object' && !(input instanceof Date) && !Buffer.isBuffer(input) && !ArrayBuffer.isView(input)) continue;
      entries.push([physical, normalizeValue(model, key, input)]);
    }
    if (!entries.length) throw new Error(`Cannot create ${model}: no SQLite columns were provided`);
    const sql = `INSERT INTO ${quote(table)} (${entries.map(([key]) => quote(key)).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`;
    sqlite.prepare(sql).run(...entries.map(([, input]) => input));
    const row: Row = { ...normalized };
    for (const key of primary) {
      const camel = snakeToCamel(key);
      if (row[camel] === undefined) {
        const result = sqlite.prepare(`SELECT ${quote(key)} FROM ${quote(table)} ORDER BY rowid DESC LIMIT 1`).get() as Row | undefined;
        row[camel] = result?.[key];
      }
    }
    return row;
  }

  function getByPrimary(model: string, row: Row): Row | null {
    const table = modelTables[model];
    const keys = primaryColumns(table);
    if (!keys.length) return null;
    const where = Object.fromEntries(keys.map((key) => [snakeToCamel(key), row[snakeToCamel(key)]]));
    if (Object.values(where).some((value) => value === undefined)) return null;
    return readRows(model, where)[0] ?? null;
  }

  function createNested(model: string, row: Row, data: Row) {
    if (model === 'post') {
      const media = data.media?.create;
      if (Array.isArray(media)) {
        const serialized = JSON.stringify(media);
        sqlite.prepare('UPDATE posts SET media = ?, media_json = ? WHERE id = ?').run(serialized, serialized, row.id);
      }
      const pollInput = data.poll?.create;
      if (pollInput) {
        const pollId = randomUUID();
        const endsAt = pollInput.endsAt instanceof Date ? pollInput.endsAt.toISOString() : pollInput.endsAt ?? null;
        sqlite.prepare('INSERT INTO polls (id, post_id, question, ends_at) VALUES (?, ?, ?, ?)').run(
          pollId, row.id, String(data.content ?? ''), endsAt,
        );
        const options = pollInput.options?.create ?? [];
        const insert = sqlite.prepare('INSERT INTO poll_options (id, poll_id, text, "order") VALUES (?, ?, ?, ?)');
        options.forEach((option: Row, index: number) => insert.run(
          randomUUID(), pollId, String(option.text ?? ''), Number(option.order ?? index),
        ));
      }
    }
    if (model === 'community' && data.members?.create) {
      const members = Array.isArray(data.members.create) ? data.members.create : [data.members.create];
      const insert = sqlite.prepare('INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)');
      for (const member of members) insert.run(row.id, member.userId, member.role ?? 'MEMBER');
    }
  }

  function insertWithRelations(model: string, data: Row) {
    const plain: Row = { ...data };
    const nested: Row = {};
    for (const key of ['media', 'poll', 'members']) {
      if (plain[key] && typeof plain[key] === 'object' && 'create' in plain[key]) {
        nested[key] = plain[key];
        delete plain[key];
      }
    }
    const row = insertRaw(model, plain);
    createNested(model, row, nested);
    return getByPrimary(model, row) ?? fromRow(model, row);
  }

  function updateRaw(model: string, row: Row, data: Row) {
    const table = modelTables[model];
    const cols = columns(table);
    const normalized: Row = { ...data };
    if (cols.has('updated_at') && normalized.updatedAt === undefined) normalized.updatedAt = new Date();
    const entries: Array<[string, any]> = [];
    for (const [key, input] of Object.entries(normalized)) {
      const physical = camelToSnake(key);
      if (!cols.has(physical) || input === undefined) continue;
      let next = input;
      if (input && typeof input === 'object' && 'increment' in input) {
        next = Number(row[key] ?? 0) + Number(input.increment);
      } else if (input && typeof input === 'object' && 'decrement' in input) {
        next = Number(row[key] ?? 0) - Number(input.decrement);
      } else if (input && typeof input === 'object' && !(input instanceof Date) && !Buffer.isBuffer(input) && !ArrayBuffer.isView(input)) {
        continue;
      }
      entries.push([physical, normalizeValue(model, key, next)]);
    }
    if (!entries.length) return;
    const primary = primaryColumns(table);
    if (!primary.length) throw new Error(`Cannot update ${model}: table has no primary key`);
    const where = primary.map((key) => `${quote(key)} = ?`).join(' AND ');
    const values = primary.map((key) => row[snakeToCamel(key)]);
    sqlite.prepare(`UPDATE ${quote(table)} SET ${entries.map(([key]) => `${quote(key)} = ?`).join(', ')} WHERE ${where}`)
      .run(...entries.map(([, value]) => value), ...values);
  }

  function deleteRaw(model: string, row: Row) {
    const table = modelTables[model];
    const primary = primaryColumns(table);
    if (!primary.length) throw new Error(`Cannot delete ${model}: table has no primary key`);
    const where = primary.map((key) => `${quote(key)} = ?`).join(' AND ');
    sqlite.prepare(`DELETE FROM ${quote(table)} WHERE ${where}`).run(...primary.map((key) => row[snakeToCamel(key)]));
  }

  function atomic<T>(operation: () => T): T {
    const savepoint = `agent_sqlite_${++savepointCounter}`;
    const outermost = transactionDepth === 0;
    sqlite.exec(outermost ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    transactionDepth += 1;
    try {
      const result = operation();
      if (outermost) sqlite.exec('COMMIT');
      else sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      if (outermost) sqlite.exec('ROLLBACK');
      else sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    } finally {
      transactionDepth -= 1;
    }
  }

  async function transaction<T>(callback: (client: any) => Promise<T> | T): Promise<T> {
    if (typeof callback !== 'function') {
      throw new TypeError('SQLite transactions require a callback: db.$transaction(async (tx) => { ... })');
    }
    const savepoint = `agent_sqlite_${++savepointCounter}`;
    const outermost = transactionDepth === 0;
    sqlite.exec(outermost ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    transactionDepth += 1;
    try {
      const result = await callback(proxy);
      if (outermost) sqlite.exec('COMMIT');
      else sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      if (outermost) sqlite.exec('ROLLBACK');
      else sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    } finally {
      transactionDepth -= 1;
    }
  }

  function model(name: string): any {
    if (!knownModels.has(name)) throw new Error(`Unknown SQLite model "${name}"`);
    const table = modelTables[name];
    return {
      findFirst: async (args: Query = {}) => {
        const row = findRows(name, { ...args, take: 1 })[0];
        return row ? project(name, row, args) : null;
      },
      findUnique: async (args: Query = {}) => {
        const row = findRows(name, { ...args, take: 1 })[0];
        return row ? project(name, row, args) : null;
      },
      findMany: async (args: Query = {}) => findRows(name, args).map((row) => project(name, row, args)),
      count: async (args: Query = {}) => findRows(name, { where: args.where }).length,
      groupBy: async (args: Query = {}) => {
        const groups = new Map<string, Row>();
        const by = args.by ?? [];
        for (const row of findRows(name, { where: args.where })) {
          const key = by.map((field: string) => JSON.stringify(row[field] ?? null)).join('|');
          const group = groups.get(key) ?? Object.fromEntries(by.map((field: string) => [field, row[field]]));
          group._count = { ...(group._count ?? {}), _all: (group._count?._all ?? 0) + 1 };
          const countFields = args._count?.select ? Object.keys(args._count.select) : Object.keys(args._count ?? {});
          for (const field of countFields) {
            group._count[field] = (group._count[field] ?? 0) + 1;
          }
          groups.set(key, group);
        }
        let result = [...groups.values()];
        if (args.orderBy) {
          const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
          result.sort((left, right) => {
            for (const item of order) {
              for (const [key, rawDirection] of Object.entries(item)) {
                const direction = key === '_count' ? Object.values(rawDirection as object)[0] : rawDirection;
                const countKey = key === '_count' ? Object.keys(rawDirection as object)[0] : key;
                const difference = Number(left._count?.[countKey] ?? left[countKey] ?? 0)
                  - Number(right._count?.[countKey] ?? right[countKey] ?? 0);
                if (difference) return String(direction).toLowerCase() === 'desc' ? -difference : difference;
              }
            }
            return 0;
          });
        }
        if (args.take !== undefined) result = result.slice(0, Number(args.take));
        return result;
      },
      create: async (args: Query) => atomic(() => {
        const row = insertWithRelations(name, args.data ?? {});
        if (!row) throw new Error(`${name} create failed`);
        return project(name, row, args);
      }),
      update: async (args: Query) => atomic(() => {
        const current = findRows(name, { where: args.where })[0];
        if (!current) throw new Error(`${name} not found`);
        updateRaw(name, current, args.data ?? {});
        const fresh = getByPrimary(name, current) ?? current;
        return project(name, fresh, args);
      }),
      updateMany: async (args: Query = {}) => atomic(() => {
        if (!args.where || !Object.keys(args.where).length) {
          throw new Error(`${name}.updateMany requires a non-empty where clause`);
        }
        const rows = findRows(name, { where: args.where });
        for (const row of rows) updateRaw(name, row, args.data ?? {});
        return { count: rows.length };
      }),
      deleteMany: async (args: Query = {}) => atomic(() => {
        if (!args.where || !Object.keys(args.where).length) {
          throw new Error(`${name}.deleteMany requires a non-empty where clause`);
        }
        const rows = findRows(name, { where: args.where });
        for (const row of rows) deleteRaw(name, row);
        return { count: rows.length };
      }),
      delete: async (args: Query) => atomic(() => {
        const row = findRows(name, { where: args.where, take: 1 })[0];
        if (!row) return null;
        deleteRaw(name, row);
        return project(name, row, args);
      }),
      upsert: async (args: Query) => atomic(() => {
        const row = findRows(name, { where: args.where, take: 1 })[0];
        if (row) {
          updateRaw(name, row, args.update ?? {});
          return project(name, getByPrimary(name, row) ?? row, args);
        }
        const created = insertWithRelations(name, args.create ?? {});
        if (!created) throw new Error(`${name} create failed`);
        return project(name, created, args);
      }),
    };
  }

  const proxy: any = new Proxy({
    $transaction: transaction,
    $disconnect: async () => sqlite.close(),
    close: () => sqlite.close(),
  }, {
    get: (target, key: string | symbol) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return (target as any)[key];
      return model(key);
    },
  });
  return proxy;
}
