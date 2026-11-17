import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ConfigProvider,App,Button,theme} from 'antd';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import ContactCenterPage from '../../pages/ContactCenterPage';
import WebPhoneWidget from '../../components/voip/WebPhoneWidget';
// Use the production styles linked by the browser harness, including Persian fonts.
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Preview(){
 const [dark,setDark]=useState(false);
 return <QueryClientProvider client={client}><ConfigProvider direction="rtl" theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm}}><App><MemoryRouter><div className={dark?'dark':''}><div className="min-h-screen bg-slate-100 text-slate-800 dark:bg-[#101113] dark:text-slate-100"><Button onClick={()=>setDark(value=>!value)}>تغییر پوستهٔ آزمون</Button><ContactCenterPage /><WebPhoneWidget voipEnabled planFeatureEnabled /></div></div></MemoryRouter></App></ConfigProvider></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
