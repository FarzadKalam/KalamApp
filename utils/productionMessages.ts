export const PRODUCTION_MESSAGES = {
  startTitle: 'شروع تولید',
  startNotice: (qty: number | string) =>
    `با شروع تولید از مقدار مواد اولیه ای که وارد کرده اید ${qty} از موجودی محصولات در قفسه ها کسر خواهد شد.\nموجودی مواد اولیه تا تکمیل تولید، کجا ذخیره شود؟`,
  stopTitle: 'توقف تولید',
  stopNotice: 'آیا میخواهید تولید را متوقف کنید؟',
  completeTitle: 'تکمیل تولید',
  completeNotice: 'محصول تولید شده به موجودی کدام محصول اضافه شود؟',
  requireProductionShelf: 'لطفا قفسه تولید را انتخاب کنید.',
  requireSourceShelf: 'برای همه اقلام، قفسه برداشت انتخاب نشده است.',
  requireSelectedProduct: 'برای همه اقلام، محصول انتخاب نشده است.',
  requireQuantity: 'تعداد تولید معتبر نیست.',
  requireOutputProduct: 'لطفا محصول مقصد را انتخاب کنید.',
  requireOutputShelf: 'لطفا قفسه مقصد را انتخاب کنید.',
  requireInventoryShelf: 'لطفا در تب "موجودی"، قفسه نگهداری محصول را انتخاب کنید.'
};

