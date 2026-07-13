import { describe, expect, it } from 'vitest';
import { collectProcessAuditRefs } from './processAudit';

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('collectProcessAuditRefs', () => {
  it('تغییرات همه ردیف‌ها و مراحل واقعی فرآیند را جمع‌آوری می‌کند', () => {
    const refs = collectProcessAuditRefs({
      mode: 'run',
      id: uuid('1'),
      lanes: [
        {
          title: 'ردیف فروش',
          stages: [{ source: { process_run_stage_id: uuid('2'), task_id: uuid('3') } }],
        },
        {
          title: 'ردیف مالی',
          stages: [{ source: { process_run_stage_id: uuid('4'), task_id: uuid('5') } }],
        },
      ],
    }, { moduleId: 'customers', recordId: uuid('6') });

    expect(refs).toEqual(expect.arrayContaining([
      { moduleId: 'customers', recordId: uuid('6') },
      { moduleId: 'process_runs', recordId: uuid('1') },
      { moduleId: 'process_run_stages', recordId: uuid('2') },
      { moduleId: 'process_run_stages', recordId: uuid('4') },
      { moduleId: 'tasks', recordId: uuid('3') },
      { moduleId: 'tasks', recordId: uuid('5') },
    ]));
  });

  it('شناسه‌های موقت رابط کاربری را وارد درخواست تاریخچه نمی‌کند', () => {
    const refs = collectProcessAuditRefs({
      mode: 'template',
      id: 'template:temporary',
      lanes: [{ title: 'ردیف اصلی', stages: [{ source: { id: 'stage:temporary' } }] }],
    });

    expect(refs).toEqual([]);
  });
});
