export const printStyles = `
  .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  
  .print-modal { display: grid; grid-template-columns: 200px 1fr; gap: 16px; }
  .print-template-list { display: flex; flex-direction: column; gap: 8px; }
  .print-template-item { 
    border: 1px solid #e5e7eb; 
    border-radius: 10px; 
    padding: 10px 12px; 
    text-align: right; 
    background: #fff; 
    transition: border-color 0.2s ease, box-shadow 0.2s ease; 
    cursor: pointer;
  }
  .print-template-item:hover { border-color: #c58f60; box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
  .print-template-item.active { border-color: #c58f60; box-shadow: 0 6px 16px rgba(197,143,96,0.25); }
  .print-template-title { font-weight: 700; color: #111827; font-size: 13px; }
  .print-template-desc { color: #6b7280; font-size: 11px; margin-top: 4px; }
  
  .print-preview { background: #f9fafb; border: 1px dashed #e5e7eb; border-radius: 12px; padding: 12px; overflow: auto; }
  .print-preview-inner { display: flex; justify-content: center; align-items: flex-start; transform: scale(0.9); transform-origin: top center; }
  
  .print-card { width: 105mm; height: 148mm; background: #fff; color: #111827; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8mm; box-sizing: border-box; display: flex; flex-direction: column; }
  .print-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .print-head-text { flex: 1; }
  .print-title { font-size: 14px; font-weight: 800; }
  .print-subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .print-qr { display: flex; align-items: center; }
  
  .print-table-wrap { margin-top: 8px; overflow: hidden; flex: 1; }
  .print-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .print-table td { border: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: top; }
  .print-label { width: 36%; background: #f8fafc; font-weight: 700; color: #374151; }
  .print-value { color: #111827; word-break: break-word; }
  
  #print-root { display: none; }
  @media print {
    @page { size: A6; margin: 6mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body * { visibility: hidden; }
    #print-root, #print-root * { visibility: visible; }
    #print-root { display: block; position: fixed; left: 0; top: 0; width: 105mm; height: 148mm; }
    .print-card { border: none; box-shadow: none; border-radius: 0; }
  }
`;
