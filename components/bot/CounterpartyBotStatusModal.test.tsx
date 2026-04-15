import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CounterpartyBotStatusModal from './CounterpartyBotStatusModal';

describe('CounterpartyBotStatusModal', () => {
  it('renders dropdowns inside the modal and applies multi-select choices', async () => {
    const onChangeAllowedUserIds = vi.fn();
    const onChangeAllowedRoleIds = vi.fn();
    render(
      <CounterpartyBotStatusModal
        open
        loading={false}
        saving={false}
        watching={false}
        countdown={0}
        channel="rubika"
        joinLink=""
        groupTitle=""
        currentStatus="pending_join_link"
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
        onChangeJoinLink={vi.fn()}
        onChangeGroupTitle={vi.fn()}
        onChangeAllowedUserIds={onChangeAllowedUserIds}
        onChangeAllowedRoleIds={onChangeAllowedRoleIds}
      />
    );

    expect(await screen.findByText('وضعیت گروه بات طرف‌حساب')).toBeInTheDocument();

    const selects = Array.from(document.body.querySelectorAll('.ant-select'));
    expect(selects).toHaveLength(3);

    fireEvent.mouseDown((selects[1] as HTMLElement).querySelector('.ant-select-selector') as Element);
    const userOption = await screen.findByText('کاربر اول');
    const userDropdown = userOption.closest('.ant-select-dropdown');
    expect(userDropdown?.closest('.ant-modal-root')).toBeTruthy();
    fireEvent.click(userOption);

    await waitFor(() => expect(onChangeAllowedUserIds).toHaveBeenCalledWith(['user-1']));

    fireEvent.mouseDown((selects[2] as HTMLElement).querySelector('.ant-select-selector') as Element);
    const roleOption = await screen.findByText('مدیر');
    const roleDropdown = roleOption.closest('.ant-select-dropdown');
    expect(roleDropdown?.closest('.ant-modal-root')).toBeTruthy();
    fireEvent.click(roleOption);

    await waitFor(() => expect(onChangeAllowedRoleIds).toHaveBeenCalledWith(['role-1']));
  });
});
