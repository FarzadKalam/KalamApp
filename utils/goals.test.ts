import { describe, expect, it } from 'vitest';
import { buildSurveyTemplateFieldKey } from './surveyTemplates';
import { buildGoalSelectColumns } from './goals';
import { createWorkflowRelatedFieldKey, WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';

describe('buildGoalSelectColumns', () => {
  it('includes only the columns needed for tasks goal evaluation', () => {
    const columns = buildGoalSelectColumns({
      id: 'goal-1',
      module_id: 'tasks',
      name: 'هدف فعالیت',
      goal_scope: 'personal',
      period_unit: 'month',
      subperiod_unit: 'week',
      metric_type: 'sum',
      metric_field_key: 'wage',
      date_field_key: 'completed_at',
      conditions_all: [
        { field: 'status', operator: 'eq', value: 'done' },
        { field: WORKFLOW_ASSIGNEE_FIELD_KEY, operator: 'contains', value: 'user_1' },
        { field: createWorkflowRelatedFieldKey('project_id', 'projects', 'status'), operator: 'eq', value: 'active' },
      ],
      conditions_any: [],
      config: {},
    } as any);

    expect(columns).not.toBe('*');
    expect(columns).toContain('id');
    expect(columns).toContain('completed_at');
    expect(columns).toContain('wage');
    expect(columns).toContain('status');
    expect(columns).toContain('project_id');
    expect(columns).toContain('assignee_id');
    expect(columns).toContain('assignee_type');
    expect(columns).toContain('assignee_role_id');
    expect(columns).not.toContain('description');
  });

  it('includes template field payload only when survey template conditions need it', () => {
    const columns = buildGoalSelectColumns({
      id: 'goal-2',
      module_id: 'surveys',
      name: 'هدف نظرسنجی',
      goal_scope: 'team',
      period_unit: 'month',
      subperiod_unit: 'week',
      metric_type: 'count',
      date_field_key: 'created_at',
      conditions_all: [
        { field: buildSurveyTemplateFieldKey('branch_score'), operator: 'gte', value: 4 },
      ],
      conditions_any: [],
      config: {},
    } as any);

    expect(columns).toContain('template_field_values');
    expect(columns).not.toContain('survey_template_id');
  });
});
