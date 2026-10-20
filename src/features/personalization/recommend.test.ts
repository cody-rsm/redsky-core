import { describe, expect, it } from 'vitest';
import { orderLayout, pack, recommend } from './recommend';
import type { LayoutItem } from './catalog';

const describeLayout = (layout: LayoutItem[]) => layout.map((item) => `${item.id}:${item.size}`).join(' ');

describe('recommend (SPEC §5.3)', () => {
  it('reproduces the Government Affairs & BD default layout', () => {
    const { layout } = recommend(['ga', 'bd'], ['relationships', 'meetings', 'industry'], 'balanced');
    expect(describeLayout(layout)).toBe(
      'brief:12 attention:8 meetings:4 relationships:6 govaffairs:6 intel:6 projects:6 airecs:4 pipeline:8',
    );
  });

  it('reproduces the Investments default layout', () => {
    const { layout } = recommend(['vc', 'research'], ['investments', 'portfolio', 'docs', 'meetings'], 'balanced');
    expect(describeLayout(layout)).toBe(
      'brief:12 attention:8 meetings:4 pipeline:6 portfolio:6 documents:4 intel:8 airecs:4 relationships:8',
    );
  });

  it('reproduces the Executive default layout', () => {
    const { layout } = recommend(['exec'], ['leadership', 'relationships', 'investments', 'industry'], 'balanced');
    expect(describeLayout(layout)).toBe(
      'brief:12 attention:8 meetings:4 approvals:6 relationships:6 pipeline:6 intel:6 team:4 projects:8',
    );
  });

  it('keeps 4, 8 or 12 widgets by density and always leads with Needs Your Attention', () => {
    expect(recommend(['ga'], [], 'focused').ids).toHaveLength(4);
    expect(recommend(['ga'], [], 'balanced').ids).toHaveLength(8);
    expect(recommend(['ga'], [], 'comprehensive').ids).toHaveLength(12);
    expect(recommend([], [], 'focused').ids[0]).toBe('attention');
  });

  it('always places the Daily Brief first at full width', () => {
    expect(recommend(['finance'], [], 'focused').layout[0]).toEqual({ id: 'brief', size: 12 });
  });
});

describe('pack', () => {
  it('pairs wide with narrow as 8 + 4 in either order, other pairs as 6 + 6, a leftover as 12', () => {
    expect(describeLayout(pack(['attention', 'meetings']))).toBe('attention:8 meetings:4');
    expect(describeLayout(pack(['meetings', 'attention']))).toBe('meetings:4 attention:8');
    expect(describeLayout(pack(['relationships', 'govaffairs']))).toBe('relationships:6 govaffairs:6');
    expect(describeLayout(pack(['portfolio']))).toBe('portfolio:12');
  });
});

describe('orderLayout', () => {
  const base: LayoutItem[] = [
    { id: 'brief', size: 12 },
    { id: 'relationships', size: 6 },
    { id: 'intel', size: 6 },
    { id: 'attention', size: 8 },
    { id: 'meetings', size: 4 },
  ];

  it('puts attention, approvals and meetings first and background reading last for "action"', () => {
    expect(orderLayout(base, 'action').map((item) => item.id)).toEqual(['brief', 'attention', 'meetings', 'relationships', 'intel']);
  });

  it('puts relationships and meetings first for "people"', () => {
    expect(orderLayout(base, 'people').map((item) => item.id)).toEqual(['brief', 'relationships', 'meetings', 'attention', 'intel']);
  });

  it('leaves the layout untouched for "keep"', () => {
    expect(orderLayout(base, 'keep')).toEqual(base);
  });
});
