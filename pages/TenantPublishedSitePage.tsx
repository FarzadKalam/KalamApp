import React, { useEffect, useState } from 'react';
import { Alert, Spin, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import { supabasePublic } from '../supabaseClient';
import { renderSiteBlocks, validateSiteBlocks } from '../utils/tenantSiteBuilder';
const TenantPublishedSitePage: React.FC = () => {
  const { orgSlug = '', pageSlug = '' } = useParams<{ orgSlug: string; pageSlug: string }>();
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabasePublic.rpc('get_published_site_page', { p_org_slug: orgSlug, p_page_slug: pageSlug });
        const candidate = !error && data?.[0] ? data[0] : null;
        if (active) setPayload(candidate && validateSiteBlocks(candidate.blocks) === null ? candidate : null);
      } catch {
        if (active) setPayload(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [orgSlug, pageSlug]);
  if (loading) return <Spin />;
  if (!payload) return <Alert type="error" message="صفحه پیدا نشد یا منتشر نشده است." />;
  return <main dir="rtl" style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}><Typography.Title>{payload.title}</Typography.Title>{renderSiteBlocks(payload.blocks)}</main>;
};
export default TenantPublishedSitePage;
