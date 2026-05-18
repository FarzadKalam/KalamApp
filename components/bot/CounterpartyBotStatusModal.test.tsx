import React from 'react';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CounterpartyBotStatusModal from './CounterpartyBotStatusModal';

describe('CounterpartyBotStatusModal', () => {
  const renderModal = (onChangeAllowedUserIds: ReturnType<typeof vi.fn>, onChangeAllowedRoleIds: ReturnType<typeof vi.fn>) =>
    render(
      <App>
        <CounterpartyBotStatusModal
          open
          loading={false}
          saving={false}
          watching={false}
          countdown={0}
          channel="rubika"
          groupTitle=""
          currentStatus="pending_join"
          activationCode="KALAM-123"
          lastInboundAt=""
          lastInboundText=""
          allowedUserIds={[]}
          allowedRoleIds={[]}
          userOptions={[
            { label: 'کاربر اول', value: 'user-1' },
            { label: 'کاربر دوم', value: 'user-2' },
          ]}
          roleOptions={[
            { label: 'مدیر', value: 'role-1' },
            { label: 'اپراتور', value: 'role-2' },
          ]}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onStartBindWatch={vi.fn()}
          onCopyActivationCode={vi.fn()}
          onChangeChannel={vi.fn()}
          onChangeAllowedUserIds={onChangeAllowedUserIds}
          onChangeAllowedRoleIds={onChangeAllowedRoleIds}
        />
      </App>
    );

  it('renders dropdowns inside the modal and applies multi-select choices', async () => {
    const onChangeAllowedUserIds = vi.fn();
    const onChangeAllowedRoleIds = vi.fn();
    renderModal(onChangeAllowedUserIds, onChangeAllowedRoleIds);

    expect(await screen.findByText('وضعیت گروه بات طرف‌حساب')).toBeInTheDocument();

    const selects = await waitFor(() => {
      const nodes = Array.from(document.body.querySelectorAll('.ant-select'));
      expect(nodes).toHaveLength(3);
      return nodes;
    });
    expect(selects).toHaveLength(3);

    fireEvent.mouseDown((selects[1] as HTMLElement).querySelector('.ant-select-selector') as Element);
    const userOption = await waitFor(() => {
      const options = Array.from(document.body.querySelectorAll('.ant-select-item-option'));
      const matched = options.find((node) => node.textContent?.trim() === 'کاربر اول');
      expect(matched).toBeTruthy();
      return matched as HTMLElement;
    });
    const userDropdown = userOption.closest('.ant-select-dropdown');
    expect(userDropdown?.closest('.ant-modal-root')).toBeFalsy();
    fireEvent.click(userOption);

    await waitFor(() => expect(onChangeAllowedUserIds).toHaveBeenCalledWith(['user-1']));
    await waitFor(() => expect(screen.getByText('کاربر اول')).toBeInTheDocument());

    fireEvent.mouseDown((selects[2] as HTMLElement).querySelector('.ant-select-selector') as Element);
    const roleOption = await waitFor(() => {
      const options = Array.from(document.body.querySelectorAll('.ant-select-item-option'));
      const matched = options.find((node) => node.textContent?.trim() === 'مدیر');
      expect(matched).toBeTruthy();
      return matched as HTMLElement;
    });
    const roleDropdown = roleOption.closest('.ant-select-dropdown');
    expect(roleDropdown?.closest('.ant-modal-root')).toBeFalsy();
    fireEvent.click(roleOption);

    await waitFor(() => expect(onChangeAllowedRoleIds).toHaveBeenCalledWith(['role-1']));
    await waitFor(() => expect(screen.getByText('مدیر')).toBeInTheDocument());
    cleanup();
  }, 15000);
});
