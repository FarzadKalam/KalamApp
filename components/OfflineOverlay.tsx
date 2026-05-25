import React from 'react';
import Button from 'antd/es/button';
import Result from 'antd/es/result';
import theme from 'antd/es/theme';
import Typography from 'antd/es/typography';
import DisconnectOutlined from '@ant-design/icons/DisconnectOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const { Text } = Typography;

const OfflineOverlay: React.FC = () => {
  const { isOnline, isChecking, retry } = useOnlineStatus();
  const { token } = theme.useToken();

  if (isOnline) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: token.colorBgLayout,
        direction: 'rtl',
      }}
    >
      <Result
        icon={
          <DisconnectOutlined
            style={{ fontSize: 72, color: token.colorWarning }}
          />
        }
        title={
          <span style={{ fontFamily: 'Vazirmatn, sans-serif', fontSize: 20, fontWeight: 600 }}>
            ارتباط با سرور قطع شده
          </span>
        }
        subTitle={
          <Text
            style={{
              fontFamily: 'Vazirmatn, sans-serif',
              color: token.colorTextSecondary,
              display: 'block',
              marginTop: 8,
              lineHeight: 2,
            }}
          >
            {isChecking
              ? 'در حال بررسی اتصال...'
              : 'اتصال اینترنت خود را بررسی کنید.\nپس از اتصال مجدد، صفحه به‌صورت خودکار بازمی‌گردد.'}
          </Text>
        }
        extra={
          <Button
            type="primary"
            size="large"
            icon={<ReloadOutlined />}
            onClick={retry}
            loading={isChecking}
            style={{ fontFamily: 'Vazirmatn, sans-serif' }}
          >
            تلاش مجدد
          </Button>
        }
        style={{ direction: 'rtl' }}
      />
    </div>
  );
};

export default OfflineOverlay;
