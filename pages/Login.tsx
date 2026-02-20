import { useEffect, useState } from 'react';
import { Button, Card, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setRecoveryMode(true);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
    });

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      message.success('خوش آمدید! در حال ورود...');
      navigate('/');
    } catch (error: any) {
      message.error('خطا در ورود: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      message.error('لطفا ایمیل را وارد کنید');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      message.error('خطا در ارسال ایمیل: ' + error.message);
    } else {
      message.success('لینک بازیابی رمز عبور ارسال شد');
    }
  };

  const handleSetNewPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      message.error('رمز عبور جدید باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      message.error('رمز عبور و تکرار آن یکسان نیست');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      message.success('رمز عبور با موفقیت تغییر کرد');
      setRecoveryMode(false);
      setNewPassword('');
      setConfirmNewPassword('');
      window.history.replaceState({}, document.title, '/login');
      navigate('/');
    } catch (error: any) {
      message.error('خطا در تغییر رمز: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-4">
            <div className="text-lg font-black text-leather-600">تولیدی چرم مهربانو</div>
            <div className="text-xs text-gray-400 mt-1">Mehrbanoo Leather ERP</div>
          </div>
        </div>

        <Card title="ورود به سیستم" className="w-full shadow-xl rounded-2xl">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">ایمیل</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
            </div>

            {!recoveryMode && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">رمز عبور</label>
                  <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور" />
                </div>
                <Button type="primary" onClick={handleLogin} loading={loading} className="w-full bg-leather-600 h-10 text-lg">
                  ورود
                </Button>
                <Button type="link" onClick={handleResetPassword} className="text-xs">
                  فراموشی رمز عبور
                </Button>
              </>
            )}

            {recoveryMode && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">رمز عبور جدید</label>
                  <Input.Password
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="حداقل ۶ کاراکتر"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">تکرار رمز عبور جدید</label>
                  <Input.Password
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="تکرار رمز عبور"
                  />
                </div>
                <Button
                  type="primary"
                  onClick={handleSetNewPassword}
                  loading={loading}
                  className="w-full bg-leather-600 h-10 text-lg"
                >
                  ثبت رمز جدید
                </Button>
                <Button
                  type="link"
                  onClick={() => {
                    setRecoveryMode(false);
                    window.history.replaceState({}, document.title, '/login');
                  }}
                  className="text-xs"
                >
                  بازگشت به ورود
                </Button>
              </>
            )}
          </div>
        </Card>

        <div className="mt-4 text-center text-[11px] text-gray-400">نسخه {import.meta.env.VITE_APP_VERSION || '1.0.2'}</div>
      </div>
    </div>
  );
};

export default Login;
