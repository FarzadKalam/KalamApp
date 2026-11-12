import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const { feature } = vi.hoisted(() => ({ feature: vi.fn() }));
vi.mock('../../hooks/useOrgPlanFeature', () => ({ useOrgPlanFeature: feature }));
import PlanFeatureBoundary from './PlanFeatureBoundary';
afterEach(cleanup);
it('does not mount a feature until permission is resolved or when it is disabled', () => {
  const mounted = vi.fn(); const Child = () => { mounted(); return <div>محتوای مجاز</div>; };
  feature.mockReturnValue(null);
  const view = render(<PlanFeatureBoundary feature="goals"><Child /></PlanFeatureBoundary>);
  expect(mounted).not.toHaveBeenCalled();
  feature.mockReturnValue(false); view.rerender(<PlanFeatureBoundary feature="goals"><Child /></PlanFeatureBoundary>);
  expect(screen.getByText(/در پلن سازمان فعال نیست/)).toBeInTheDocument();
  expect(mounted).not.toHaveBeenCalled();
  feature.mockReturnValue(true); view.rerender(<PlanFeatureBoundary feature="goals"><Child /></PlanFeatureBoundary>);
  expect(screen.getByText('محتوای مجاز')).toBeInTheDocument();
});
