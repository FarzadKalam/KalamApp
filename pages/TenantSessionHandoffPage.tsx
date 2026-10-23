import { useEffect } from 'react';
import { receiveTenantSessionHandoff } from '../utils/tenantSessionHandoff';

const TenantSessionHandoffPage = () => {
  useEffect(() => receiveTenantSessionHandoff(), []);
  return null;
};

export default TenantSessionHandoffPage;
