import { describe, expect, it } from 'vitest';
import {
  buildMaterializedProcessIdentityIndex,
  collectProcessInstanceIdentityKeys,
  isDraftProcessInstanceMaterialized,
} from './processInstanceIdentity';

describe('process instance identity', () => {
  it('does not use template id as process instance identity', () => {
    expect(collectProcessInstanceIdentityKeys({
      process_group_id: 'group-a',
      process_run_id: 'run-a',
      source_template_id: 'template-1',
    })).toEqual(['group-a', 'run-a']);
  });

  it('keeps a repeated template draft visible when it has a new group id', () => {
    const runtimeIndex = buildMaterializedProcessIdentityIndex([{
      id: 'run-a',
      process_group_id: 'group-a',
      template_id: 'template-1',
    }]);

    expect(isDraftProcessInstanceMaterialized({
      process_group_id: 'group-a',
      source_template_id: 'template-1',
    }, runtimeIndex)).toBe(true);
    expect(isDraftProcessInstanceMaterialized({
      process_group_id: 'group-b',
      source_template_id: 'template-1',
    }, runtimeIndex)).toBe(false);
    expect(isDraftProcessInstanceMaterialized({
      process_group_id: 'group-c',
      source_template_id: 'template-1',
    }, runtimeIndex)).toBe(false);
  });

  it('reads group identity from task recurrence metadata', () => {
    const runtimeIndex = buildMaterializedProcessIdentityIndex([{
      source_template_id: 'template-1',
      recurrence_info: JSON.stringify({
        process_group: { id: 'group-a', template_id: 'template-1' },
      }),
    }]);

    expect(isDraftProcessInstanceMaterialized({
      process_group_id: 'group-a',
      source_template_id: 'template-1',
    }, runtimeIndex)).toBe(true);
  });

  it('uses template matching only for legacy drafts without a group id', () => {
    const runtimeIndex = buildMaterializedProcessIdentityIndex([{
      process_group_id: 'group-a',
      template_id: 'template-1',
    }]);

    expect(isDraftProcessInstanceMaterialized({
      source_template_id: 'template-1',
    }, runtimeIndex)).toBe(true);
    expect(isDraftProcessInstanceMaterialized({
      source_template_id: 'template-2',
    }, runtimeIndex)).toBe(false);
  });
});
