const normalizeBooleanLike = (value: any) => {
  if (value === true) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'active'].includes(normalized);
};

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const isActivePriceListStatus = (status: any) => normalizeBooleanLike(status);

export const syncDefaultPriceListItemsToProducts = async (
  supabaseClient: any,
  priceList: { status?: any; active?: any; items?: any[] | null | undefined },
) => {
  const isActive = isActivePriceListStatus(priceList?.status ?? priceList?.active);
  if (!isActive || !Array.isArray(priceList?.items)) return 0;

  const latestByProductId = new Map<string, number>();
  priceList.items.forEach((item: any) => {
    if (!normalizeBooleanLike(item?.is_default_sell_price)) return;
    const productId = String(item?.product_id || '').trim();
    const price = toNumber(item?.price);
    if (!productId || price === null) return;
    latestByProductId.set(productId, price);
  });

  let updatedCount = 0;
  for (const [productId, sellPrice] of latestByProductId.entries()) {
    const { error } = await supabaseClient
      .from('products')
      .update({ sell_price: sellPrice })
      .eq('id', productId);
    if (error) throw error;
    updatedCount += 1;
  }

  return updatedCount;
};
