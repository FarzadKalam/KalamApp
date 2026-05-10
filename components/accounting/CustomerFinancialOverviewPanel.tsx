import React from 'react';
import OperationalFinancialOverviewPanel from './OperationalFinancialOverviewPanel';

type CustomerFinancialOverviewPanelProps = {
  customerId: string;
  customerData?: Record<string, any> | null;
};

const CustomerFinancialOverviewPanel: React.FC<CustomerFinancialOverviewPanelProps> = ({ customerId, customerData }) => (
  <OperationalFinancialOverviewPanel
    entityType="customer"
    entityId={customerId}
    entityData={customerData}
  />
);

export default CustomerFinancialOverviewPanel;
