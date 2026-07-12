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
  .print-template-item:hover { border-color: rgb(var(--brand-500-rgb)); box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
  .print-template-item.active { border-color: rgb(var(--brand-500-rgb)); box-shadow: 0 6px 16px rgba(var(--brand-500-rgb),0.25); }
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

  .invoice-custom-print-shell .print-template-page,
  .invoice-custom-print-shell .print-template-page * {
    font-family: inherit;
  }
  .invoice-custom-print-shell .print-template-page,
  .invoice-custom-print-shell .print-template-body-inner,
  .invoice-custom-print-shell .print-template-header-inner,
  .invoice-custom-print-shell .print-template-footer-inner {
    line-height: 1.9;
    font-size: 14px;
    direction: rtl;
    text-align: right;
  }
  .invoice-custom-print-shell .print-template-page {
    direction: rtl;
    text-align: right;
  }
  .invoice-custom-print-shell .print-template-page p {
    margin: 0 0 8px 0;
  }
  .invoice-custom-print-shell .print-template-page td p,
  .invoice-custom-print-shell .print-template-page th p {
    margin: 0 !important;
    font-size: inherit !important;
    line-height: 1.6 !important;
  }
  .invoice-custom-print-shell .print-template-page h2 {
    margin: 0 0 10px 0;
    font-size: 20px;
    line-height: 1.8;
  }
  .invoice-custom-print-shell .print-template-body-measure {
    width: 100%;
    box-sizing: border-box;
    line-height: 1.9;
    font-size: 14px;
    direction: rtl;
    text-align: right;
    font-family: inherit;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .invoice-custom-print-shell .print-template-body-measure *,
  .invoice-custom-print-shell .print-template-body-inner * {
    box-sizing: border-box;
  }
  .invoice-custom-print-shell [data-print-flow-role="manual-keep"],
  .invoice-custom-print-shell [data-print-flow-role="semantic-block"],
  .invoice-custom-print-shell [data-print-flow-role="media-block"] {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .invoice-custom-print-shell [data-print-flow-role="table-container"] {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  .invoice-custom-print-shell [data-print-flow-role="table-row"] {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  .invoice-custom-print-shell table {
    --table-border-color: #d1d5db;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    width: 100%;
    max-width: 100%;
  }
  .invoice-custom-print-shell table,
  .invoice-custom-print-shell th,
  .invoice-custom-print-shell td {
    border-color: var(--table-border-color, #d1d5db);
    box-sizing: border-box !important;
  }
  .invoice-custom-print-shell th,
  .invoice-custom-print-shell td {
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .invoice-custom-print-shell img {
    display: block;
    object-fit: contain;
  }
  
  #print-root { display: none; }
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body.print-mode #root {
      display: none !important;
    }
    body.print-mode > *:not(#print-root) {
      display: none !important;
    }
    body.print-mode #print-root {
      display: block !important;
      position: static !important;
      width: auto !important;
      height: auto !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    body.print-mode #print-root .invoice-custom-print-shell {
      width: fit-content !important;
      min-height: auto !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
    }
    body.print-mode #print-root .print-template-page {
      break-after: page !important;
      page-break-after: always !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      margin: 0 !important;
    }
    body.print-mode #print-root .print-template-page:last-child {
      break-after: auto !important;
      page-break-after: auto !important;
    }
    body.print-mode #print-root * {
      visibility: visible !important;
    }
    .invoice-custom-print-shell,
    .invoice-custom-print-shell * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-custom-print-shell .print-template-page-counter { color: #334155 !important; }
    .invoice-custom-print-shell .print-template-body-measure { display: none !important; }
    /* System invoice rows may have different font metrics. Keep each row whole
       when a long items table flows onto the next printed page. */
    .invoice-print-card {
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
    .invoice-print-card tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-card { border: none; box-shadow: none; border-radius: 0; }
  }
`;
