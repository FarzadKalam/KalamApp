import React from 'react';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CounterpartyBotStatusModal, { DEFAULT_PLATFORM_STATE } from './CounterpartyBotStatusModal';

describe('CounterpartyBotStatusModal', () => {
  const renderModal = (onChangePlatform: ReturnType<typeof vi.fn>) =>
    render(
      <App>
        <CounterpartyBotStatusModal
          open
          loading={false}
          saving={false}
          watchingChannel={null}
          countdown={0}
          activeTab="rubika"
          defaultChannel="rubika"
          fallbackToActive={false}
          counterpartyType="customer"
          platforms={{
            rubika: {
              ...DEFAULT_PLATFORM_STATE,
              currentStatus: 'pending_join',
              activationCode: 'KALAM-123',
            },
            telegram: { ...DEFAULT_PLATFORM_STATE },
            bale: { ...DEFAULT_PLATFORM_STATE },
          }}
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
          onChangeTab={vi.fn()}
          onChangeDefaultChannel={vi.fn()}
          onChangeFallbackToActive={vi.fn()}
          onChangePlatform={onChangePlatform}
        />
      </App>
    );

  it('renders dropdowns inside the modal and applies multi-select choices', async () => {
    const onChangePlatform = vi.fn();
    renderModal(onChangePlatform);

    expect(await screen.findByText('تنظیمات بات مشتری')).toBeInTheDocument();
    expect(screen.getByText('انتظار برای پیام در گروه روبیکا')).toBeInTheDocument();

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

    await waitFor(() => expect(onChangePlatform).toHaveBeenCalledWith('rubika', 'allowedUserIds', ['user-1']));

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

    await waitFor(() => expect(onChangePlatform).toHaveBeenCalledWith('rubika', 'allowedRoleIds', ['role-1']));
    cleanup();
  }, 15000);
});
