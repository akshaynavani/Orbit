import { compareVersions, decideMerge } from '../sync/lww';

describe('LWW merge', () => {
  it('orders by timestamp then device id', () => {
    expect(compareVersions({ updated_at: 1, device_id: 'z' }, { updated_at: 2, device_id: 'a' })).toBe(-1);
    expect(compareVersions({ updated_at: 2, device_id: 'b' }, { updated_at: 2, device_id: 'a' })).toBe(1);
    expect(compareVersions({ updated_at: 2, device_id: 'a' }, { updated_at: 2, device_id: 'a' })).toBe(0);
  });

  it('inserts unknown rows and overwrites clean ones', () => {
    expect(decideMerge(null, { updated_at: 1, device_id: 'x' })).toBe('insert');
    expect(decideMerge({ updated_at: 99, device_id: 'me', dirty: false }, { updated_at: 1, device_id: 'x' })).toBe('overwrite');
  });

  it('keeps newer unpushed local edits', () => {
    expect(decideMerge({ updated_at: 10, device_id: 'me', dirty: true }, { updated_at: 5, device_id: 'x' })).toBe('keep-local');
  });

  it('lets newer remote edits beat dirty local ones', () => {
    expect(decideMerge({ updated_at: 10, device_id: 'me', dirty: true }, { updated_at: 11, device_id: 'x' })).toBe('overwrite');
  });

  it('acknowledges the echo of our own push', () => {
    expect(decideMerge({ updated_at: 10, device_id: 'me', dirty: true }, { updated_at: 10, device_id: 'me' })).toBe('ack');
  });
});
