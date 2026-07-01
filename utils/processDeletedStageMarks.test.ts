import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetProcessDeletedStageMarksForTests,
  fetchDeletedProcessRunStageMarkMap,
  filterDeletedProcessRunStageMarks,
} from './processDeletedStageMarks';

const createSupabaseMock = (deletedIds: string[] = []) => {
  const inMock = vi.fn(async (_column: string, ids: string[]) => ({
    data: ids
      .filter((id) => deletedIds.includes(id))
      .map((id) => ({ process_run_stage_id: id })),
    error: null,
  }));
  const selectMock = vi.fn(() => ({ in: inMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    client: {
      from: fromMock,
    },
    fromMock,
    selectMock,
    inMock,
  };
};

describe('processDeletedStageMarks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetProcessDeletedStageMarksForTests();
  });

  afterEach(() => {
    __resetProcessDeletedStageMarksForTests();
    vi.useRealTimers();
  });

  it('batches concurrent deleted-stage lookups into one query', async () => {
    const { client, fromMock, inMock } = createSupabaseMock([
      '22222222-2222-4222-8222-222222222222',
    ]);

    const firstPromise = fetchDeletedProcessRunStageMarkMap(client, [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    const secondPromise = fetchDeletedProcessRunStageMarkMap(client, [
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);

    await vi.runAllTimersAsync();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledTimes(1);
    expect(first.get('11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(first.get('22222222-2222-4222-8222-222222222222')).toBe(true);
    expect(second.get('22222222-2222-4222-8222-222222222222')).toBe(true);
    expect(second.get('33333333-3333-4333-8333-333333333333')).toBe(false);
  });

  it('reuses cached deleted-stage results during the ttl window', async () => {
    const { client, fromMock } = createSupabaseMock([
      '22222222-2222-4222-8222-222222222222',
    ]);

    const firstPromise = filterDeletedProcessRunStageMarks(client, [
      { id: '11111111-1111-4111-8111-111111111111' },
      { id: '22222222-2222-4222-8222-222222222222' },
    ]);

    await vi.runAllTimersAsync();
    const firstRows = await firstPromise;

    expect(firstRows).toEqual([
      { id: '11111111-1111-4111-8111-111111111111' },
    ]);
    expect(fromMock).toHaveBeenCalledTimes(1);

    const secondRows = await filterDeletedProcessRunStageMarks(client, [
      { id: '11111111-1111-4111-8111-111111111111' },
      { id: '22222222-2222-4222-8222-222222222222' },
    ]);

    expect(secondRows).toEqual([
      { id: '11111111-1111-4111-8111-111111111111' },
    ]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});
