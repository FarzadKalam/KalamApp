export const downloadCampaignAudienceSample = async () => {
  const xlsx = await import('xlsx');
  const rows = [{
    'نام': 'مخاطب نمونه',
    'موبایل': '09121234567',
    'ایمیل': 'sample@example.com',
    'کد خارجی': 'sample-1',
  }];
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows), 'مخاطبان');
  xlsx.writeFile(workbook, 'campaign-audience-sample.xlsx');
};
