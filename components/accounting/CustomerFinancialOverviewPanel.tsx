import React from 'react';
import OperationalFinancialOverviewPanel from './OperationalFinancialOverviewPanel';

type CustomerFinancialOverviewPanelProps = {
  customerId: string;
};

const CustomerFinancialOverviewPanel: React.FC<CustomerFinancialOverviewPanelProps> = ({ customerId }) => (
  <OperationalFinancialOverviewPanel
    entityType="customer"
    entityId={customerId}
  />
);

export default CustomerFinancialOverviewPanel;
