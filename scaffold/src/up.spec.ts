import { describe, expect, it } from 'vitest';

import { declaredUp, resolveUp } from './up';

describe('resolveUp', () => {
  it('is the path as declared when it names no parameter', () => {
    expect(resolveUp('/', {}, {})).toEqual({ path: '/', query: {}, label: 'back', opener: false });
  });

  it("fills a :name from the route's parameters, escaped", () => {
    expect(resolveUp('/s/:id', { id: 'a b', run: 'r1' }, {}).path).toBe('/s/a%20b');
  });

  it('carries only the query parameters it keeps, and only when present', () => {
    const up = resolveUp({ path: '/s/:id/w/:run', keep: ['task', 'absent'] }, { id: 'x', run: 'r' }, {
      task: 't1',
      scroll: '40',
    });
    expect(up).toEqual({ path: '/s/x/w/r', query: { task: 't1' }, label: 'back', opener: false });
  });

  it('says what the declaration names it', () => {
    expect(resolveUp({ path: '/', label: 'all sessions' }, {}, {}).label).toBe('all sessions');
  });

  it('returns to the opener only when the route says so', () => {
    expect(resolveUp({ path: '/inventory', opener: true }, {}, {}).opener).toBe(true);
    expect(resolveUp('/inventory', {}, {}).opener).toBe(false);
  });

  it('refuses a parent the route cannot fill', () => {
    expect(() => resolveUp('/s/:id', {}, {})).toThrow(/no parameter :id/);
  });
});

describe('declaredUp', () => {
  it('is the route\'s up, and none for a top screen', () => {
    expect(declaredUp({ up: '/' })).toBe('/');
    expect(declaredUp({ top: true })).toBeUndefined();
  });

  it('refuses a route that declares both', () => {
    expect(() => declaredUp({ up: '/', top: true })).toThrow(/both up and top/);
  });
});
