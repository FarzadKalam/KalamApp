import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ConfigProvider,App,Button,theme} from 'antd';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import ContactCenterPage from '../../pages/ContactCenterPage';
import WebPhoneWidget from '../../components/voip/WebPhoneWidget';
import MessagesPage from '../../pages/MessagesPage';
import {resolveOverlayPopupContainer} from '../../utils/popupContainer';
// Use the production styles linked by the browser harness, including Persian fonts.
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Preview(){
 const [dark,setDark]=useState(false);
 const [messages,setMessages]=useState(false);
 return <QueryClientProvider client={client}><ConfigProvider direction="rtl" getPopupContainer={resolveOverlayPopupContainer} theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,token:{zIndexPopupBase:13000}}}><App><MemoryRouter><div className={dark?'dark':''}><div className="min-h-screen bg-slate-100 text-slate-800 dark:bg-[#101113] dark:text-slate-100"><Button onClick={()=>setDark(value=>!value)}>تغییر پوستهٔ آزمون</Button><Button onClick={()=>setMessages(value=>!value)}>نمای آزمون پیام‌رسانی</Button>{messages?<div style={{height:'85dvh'}}><MessagesPage /></div>:<ContactCenterPage />}<WebPhoneWidget voipEnabled planFeatureEnabled /></div></div></MemoryRouter></App></ConfigProvider></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
