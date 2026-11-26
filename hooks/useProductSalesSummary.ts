import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { subscribeOperationalFinancialRefresh } from '../utils/operationalFinancialRefresh';
import { fetchSessionBootstrap } from '../utils/sessionCache';

export type ProductSalesSummary = {
  invoice_count: number | null;
  total_sold_quantity: number | null;
  total_sold_amount: number | null;
  invoice_revision: string;
};

export function useProductSalesSummary(orgId: string, productId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const [access, setAccess] = useState<{ orgId: string; userId: string } | null>(null);
  const userId = access?.orgId === orgId ? access.userId : undefined;
  useEffect(() => {
    if (!enabled || !orgId) return;
    let active = true;
    void fetchSessionBootstrap(supabase).then((session) => {
      if (active) setAccess(session.user?.id && session.orgId === orgId ? { orgId, userId: session.user.id } : null);
    }).catch(() => { if (active) setAccess(null); });
    return () => { active = false; };
  }, [enabled, orgId]);
  useEffect(() => {
    if (!enabled || !userId || !productId) return;
    return subscribeOperationalFinancialRefresh(() => {
      void queryClient.invalidateQueries({ queryKey: ['product-sales-summary', orgId, userId, productId] });
    });
  }, [enabled, orgId, userId, productId, queryClient]);

  return useQuery({
    queryKey: ['product-sales-summary', orgId, userId, productId],
    enabled: enabled && Boolean(orgId && userId && productId),
    cacheTime: 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ProductSalesSummary | null> => {
      const { data, error } = await supabase.rpc('get_product_sales_summary', {
        p_org_id: orgId, p_product_id: productId,
      }).maybeSingle();
      if (error) throw error;
      return data as ProductSalesSummary | null;
    },
  });
}
