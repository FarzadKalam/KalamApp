import React from 'react';
import { Alert, Skeleton } from 'antd';
import { useOrgPlanFeature } from '../../hooks/useOrgPlanFeature';
import { SAAS_FEATURE_LABELS } from '../../utils/saasOfferingCatalog';

export default function PlanFeatureBoundary({ feature, children }: { feature: string; children: React.ReactNode }) {
  const allowed = useOrgPlanFeature(feature, undefined, true);
  if (allowed === null) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (!allowed) return <Alert type="info" showIcon message={`${SAAS_FEATURE_LABELS[feature] || 'این قابلیت'} در پلن سازمان فعال نیست.`} />;
  return <>{children}</>;
}
