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

  const latestByProductId = new Map<string, { sellPrice: number; buyPrice: number | null }>();
  priceList.items.forEach((item: any) => {
    if (!normalizeBooleanLike(item?.is_default_sell_price)) return;
    const productId = String(item?.product_id || '').trim();
    const sellPrice = toNumber(item?.price);
    if (!productId || sellPrice === null) return;
    latestByProductId.set(productId, {
      sellPrice,
      buyPrice: toNumber(item?.buy_price),
    });
  });

  let updatedCount = 0;
  for (const [productId, prices] of latestByProductId.entries()) {
    const updatePayload: Record<string, number> = { sell_price: prices.sellPrice };
    if (prices.buyPrice !== null) updatePayload.buy_price = prices.buyPrice;
    const { error } = await supabaseClient
      .from('products')
      .update(updatePayload)
      .eq('id', productId);
    if (error) throw error;
    updatedCount += 1;
  }

  return updatedCount;
};
