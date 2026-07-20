import { describe, expect, it } from 'vitest';
import {
  resolveProcessRuntimeSurfaceMode,
  shouldApplyProcessTemplateStagePreview,
  shouldLoadProcessRuntime,
} from './processRuntimePresentation';

describe('process runtime presentation contract', () => {
  it('always loads the full ModuleShow runtime even when a snapshot is used for immediate rendering', () => {
    expect(shouldLoadProcessRuntime({
      enabled: true,
      moduleId: 'suppliers',
      recordId: 'record-1',
      variant: 'full',
      snapshotOnly: false,
    })).toBe(true);
  });

  it('never hides a valid full runtime block before its first response', () => {
    expect(resolveProcessRuntimeSurfaceMode({
      variant: 'full',
      hasValidRecord: true,
      hasLoadedRuntime: false,
      loading: false,
      waitingForContext: false,
      hasError: false,
      cardCount: 0,
    })).toBe('loading');
  });

  it('shows create-process after a successful empty response and recovery after an error', () => {
    const base = {
      variant: 'full' as const,
      hasValidRecord: true,
      hasLoadedRuntime: true,
      loading: false,
      waitingForContext: false,
      cardCount: 0,
    };
    expect(resolveProcessRuntimeSurfaceMode({ ...base, hasError: false })).toBe('empty');
    expect(resolveProcessRuntimeSurfaceMode({ ...base, hasError: true })).toBe('error');
  });

  it('does not let an omitted template preview clear loaded template stages in a column', () => {
    expect(shouldApplyProcessTemplateStagePreview({
      isProcessTemplate: true,
      currentStages: [{ id: 'stage-1' }],
      previewStages: [],
    })).toBe(false);
    expect(shouldApplyProcessTemplateStagePreview({
      isProcessTemplate: true,
      currentStages: [],
      previewStages: [{ id: 'stage-1' }],
    })).toBe(true);
  });
});
