import React, { useEffect, useState } from 'react';
import { Alert, Spin, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import { supabasePublic } from '../supabaseClient';
import { renderSiteBlocks, type SiteBlock } from '../utils/tenantSiteBuilder';
const TenantPublishedSitePage: React.FC = () => {
  const { orgSlug = '', pageSlug = '' } = useParams<{ orgSlug: string; pageSlug: string }>();
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void Promise.resolve(supabasePublic.rpc('get_published_site_page', { p_org_slug: orgSlug, p_page_slug: pageSlug }))
      .then(({ data, error }) => { if (active) setPayload(!error && data?.[0] ? data[0] : null); })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [orgSlug, pageSlug]);
  if (loading) return <Spin />;
  if (!payload) return <Alert type="error" message="صفحه پیدا نشد یا منتشر نشده است." />;
  let blocks: SiteBlock[] = [];
  try { blocks = Array.isArray(payload.blocks) ? payload.blocks : []; } catch { /* fail closed */ }
  return <main dir="rtl" style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}><Typography.Title>{payload.title}</Typography.Title>{renderSiteBlocks(blocks)}</main>;
};
export default TenantPublishedSitePage;
