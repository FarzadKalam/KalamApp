import { describe, expect, it } from 'vitest';
import {
  getWorkflowStaticValueLabel,
  parseWorkflowIdentityReference,
} from '../supabase/functions/_shared/workflow-value-labels';

describe('server workflow value labels', () => {
  it('translates attendance values to their Persian labels', () => {
    expect(getWorkflowStaticValueLabel('log_type', 'check_in')).toBe('ورود');
    expect(getWorkflowStaticValueLabel('log_type', 'check_out')).toBe('خروج');
    expect(getWorkflowStaticValueLabel('attendance.log_type', 'check_out')).toBe('خروج');
  });

  it('extracts user and role references without exposing their raw identifiers', () => {
    const userId = '9ef7b957-d2b8-4852-bd61-1b0cdd252f9c';
    const roleId = '55555555-5555-4555-8555-555555555555';
    expect(parseWorkflowIdentityReference(`user_${userId}`)).toEqual({ type: 'user', id: userId });
    expect(parseWorkflowIdentityReference(`role:${roleId}`)).toEqual({ type: 'role', id: roleId });
    expect(parseWorkflowIdentityReference('check_out')).toBeNull();
  });
});
