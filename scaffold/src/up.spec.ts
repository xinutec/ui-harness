import { describe, expect, it } from 'vitest';

import { resolveUp } from './up';

describe('resolveUp', () => {
  it('is the path as declared when it names no parameter', () => {
    expect(resolveUp('/', {}, {})).toEqual({ path: '/', query: {}, label: 'back' });
  });

  it("fills a :name from the route's parameters, escaped", () => {
    expect(resolveUp('/s/:id', { id: 'a b', run: 'r1' }, {}).path).toBe('/s/a%20b');
  });

  it('carries only the query parameters it keeps, and only when present', () => {
    const up = resolveUp({ path: '/s/:id/w/:run', keep: ['task', 'absent'] }, { id: 'x', run: 'r' }, {
      task: 't1',
      scroll: '40',
    });
    expect(up).toEqual({ path: '/s/x/w/r', query: { task: 't1' }, label: 'back' });
  });

  it('says what the declaration names it', () => {
    expect(resolveUp({ path: '/', label: 'all sessions' }, {}, {}).label).toBe('all sessions');
  });

  it('refuses a parent the route cannot fill', () => {
    expect(() => resolveUp('/s/:id', {}, {})).toThrow(/no parameter :id/);
  });
});
