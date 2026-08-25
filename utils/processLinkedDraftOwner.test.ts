import { describe, expect, it } from 'vitest';
import { resolveProcessDraftExecutionOwner } from './processLinkedDraftOwner';

describe('resolveProcessDraftExecutionOwner', () => {
  it('uses the owner record when a project draft is displayed through a related customer', () => {
    expect(resolveProcessDraftExecutionOwner({
      currentModuleId: 'customers',
      currentRecordId: '11111111-1111-4111-8111-111111111111',
      stage: {
        source: {
          __process_v2_linked_owner_module_id: 'projects',
          __process_v2_linked_owner_record_id: '22222222-2222-4222-8222-222222222222',
        },
      },
    })).toEqual({
      moduleId: 'projects',
      recordId: '22222222-2222-4222-8222-222222222222',
      isLinkedOwner: true,
    });
  });

  it('keeps the current record for a direct draft', () => {
    expect(resolveProcessDraftExecutionOwner({
      currentModuleId: 'projects',
      currentRecordId: '22222222-2222-4222-8222-222222222222',
      stage: { id: 'draft-stage' },
    })).toEqual({
      moduleId: 'projects',
      recordId: '22222222-2222-4222-8222-222222222222',
      isLinkedOwner: false,
    });
  });

  it('uses the runtime run owner when its draft stage is displayed on a related record', () => {
    expect(resolveProcessDraftExecutionOwner({
      currentModuleId: 'customers',
      currentRecordId: '11111111-1111-4111-8111-111111111111',
      stage: { id: 'run-stage' },
      runtimeRun: {
        module_id: 'projects',
        record_id: '22222222-2222-4222-8222-222222222222',
      },
    })).toEqual({
      moduleId: 'projects',
      recordId: '22222222-2222-4222-8222-222222222222',
      isLinkedOwner: true,
    });
  });
});
