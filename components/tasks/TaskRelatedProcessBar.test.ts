import { describe, expect, it } from 'vitest';
import { resolveTaskRelatedProcessTarget } from './TaskRelatedProcessBar';

describe('resolveTaskRelatedProcessTarget', () => {
  it('شناسه مدرن رکورد مرتبط را برای فرآیند پروژه برمی گرداند', () => {
    expect(resolveTaskRelatedProcessTarget({
      source_module_id: 'projects',
      source_record_id: 'project-1',
    })).toEqual({ moduleId: 'projects', recordId: 'project-1' });
  });

  it('از فیلد قدیمی رکورد مرتبط نیز پشتیبانی می کند', () => {
    expect(resolveTaskRelatedProcessTarget({
      related_to_module: 'customers',
      related_customer: 'customer-1',
    })).toEqual({ moduleId: 'customers', recordId: 'customer-1' });
  });

  it('برای نمایش کامل، اجرای جاری همان فرآیند را هدف می گیرد', () => {
    expect(resolveTaskRelatedProcessTarget({
      process_run_id: 'run-1',
      source_module_id: 'projects',
      source_record_id: 'project-1',
    }, { preferProcessRun: true })).toEqual({ moduleId: 'process_runs', recordId: 'run-1' });
  });

  it('برای فعالیت مستقل یا رکوردی که فرآیند عمومی ندارد نوار نمی سازد', () => {
    expect(resolveTaskRelatedProcessTarget({ id: 'task-1' })).toBeNull();
    expect(resolveTaskRelatedProcessTarget({
      source_module_id: 'production_orders',
      source_record_id: 'production-1',
    })).toBeNull();
  });
});
