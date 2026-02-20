import React from 'react';
import { QRCode } from 'antd';

interface ProductionPassportProps {
  title: string;
  subtitle: string;
  qrValue: string;
  fields: any[];
  formatPrintValue: (field: any, value: any) => string;
}

export const ProductionPassport: React.FC<ProductionPassportProps> = ({
  title,
  subtitle,
  qrValue,
  fields,
  formatPrintValue,
}) => {
  return (
    <div className="print-card">
      <div className="print-header">
        <div className="print-head-text">
          <div className="print-title">{title}</div>
          <div className="print-subtitle">{subtitle}</div>
        </div>
        <div className="print-qr">
          <QRCode value={qrValue} bordered={false} size={92} />
        </div>
      </div>
      <div className="print-table-wrap">
        <table className="print-table">
          <tbody>
            {fields.map(field => (
              <tr key={field.key}>
                <td className="print-label">{field.labels.fa}</td>
                <td className="print-value">{formatPrintValue(field, field.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
