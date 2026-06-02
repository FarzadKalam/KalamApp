import { useState } from 'react';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { wouldCreateCycle } from './orgChartHelpers';

export const ROOT_DROP_ZONE_ID = '__root_drop_zone__';

interface UseRoleDragDropParams {
  roles: any[];
  supportsRoleTreeSchema: boolean | null;
  updateRoleTreeLocally: (id: string, updates: { parent_id?: string | null; sort_order?: number }) => void;
  getSortedSiblings: (parentId?: string | null, excludeRoleId?: string | null) => any[];
  fetchRoles: () => void;
  messageApi: { error: (msg: string) => void; success: (msg: string) => void };
}

export function useRoleDragDrop({
  roles,
  supportsRoleTreeSchema,
  updateRoleTreeLocally,
  getSortedSiblings,
  fetchRoles,
  messageApi,
}: UseRoleDragDropParams) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);

    const draggedId = String(event.active.id);
    const targetId = event.over ? String(event.over.id) : null;

    if (!targetId || draggedId === targetId) return;

    if (supportsRoleTreeSchema === false) {
      messageApi.error('برای فعال شدن ساختار درختی، migration مربوطه باید اجرا شود.');
      return;
    }

    const newParentId = targetId === ROOT_DROP_ZONE_ID ? null : targetId;

    if (wouldCreateCycle(draggedId, newParentId, roles)) {
      messageApi.error('این جابه‌جایی چرخه سلسله‌مراتبی ایجاد می‌کند');
      return;
    }

    const draggedRole = roles.find((r) => String(r?.id) === draggedId);
    const currentParent = String(draggedRole?.parent_id || '');
    const nextParent = String(newParentId || '');
    if (currentParent === nextParent) return;

    const siblings = getSortedSiblings(newParentId, draggedId);
    const nextSortOrder =
      siblings.length > 0 ? Math.max(...siblings.map((r) => Number(r?.sort_order || 0))) + 1 : 0;

    updateRoleTreeLocally(draggedId, { parent_id: newParentId, sort_order: nextSortOrder });

    const { error } = await supabase
      .from('org_roles')
      .update({ parent_id: newParentId, sort_order: nextSortOrder })
      .eq('id', draggedId);

    if (error) {
      messageApi.error(toFaErrorMessage(error, 'جابه‌جایی جایگاه ناموفق بود'));
      fetchRoles();
    } else {
      messageApi.success('جایگاه با موفقیت جابه‌جا شد');
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  return { activeId, overId, handleDragStart, handleDragOver, handleDragEnd, handleDragCancel };
}
