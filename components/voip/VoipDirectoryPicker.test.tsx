import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import VoipDirectoryPicker from './VoipDirectoryPicker';
import {searchVoipOperatorDirectory} from '../../utils/voipDirectory';
import {readVoipContactContext} from '../../utils/voipContactContext';
vi.mock('../AdaptivePickerSurface',()=>({default:({open,children}:any)=>open?<div>{children}</div>:null}));
vi.mock('../../utils/voipDirectory',()=>({searchVoipOperatorDirectory:vi.fn()}));
vi.mock('../../utils/voipContactContext',()=>({readVoipContactContext:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('lists phone accounts first with their dial numbers and chooses without starting a call',async()=>{
 vi.mocked(searchVoipOperatorDirectory).mockResolvedValue({items:[{id:'one',title:'همکار آزمون',phone:'101',avatarUrl:'/avatar.png'},{id:'two',title:'بدون داخلی',phone:'',avatarUrl:null}],hasMore:false,nextOffset:20});
 const choose=vi.fn();const close=vi.fn();render(<VoipDirectoryPicker open onClose={close} onChoose={choose} />);
 const colleague=await screen.findByRole('button',{name:/همکار آزمون/});expect(colleague.textContent).toContain('101');
 expect(screen.getByRole('button',{name:/بدون داخلی/})).toBeDisabled();expect(readVoipContactContext).not.toHaveBeenCalled();
 expect(choose).not.toHaveBeenCalled();fireEvent.click(colleague);expect(choose).toHaveBeenCalledWith('101',expect.objectContaining({title:'همکار آزمون'}));expect(close).toHaveBeenCalledOnce();
});
it('does not append a previous query page after a new name is entered',async()=>{
 let finish:(value:any)=>void=()=>{};
 vi.mocked(searchVoipOperatorDirectory).mockImplementation(async(query,offset)=>offset?new Promise(resolve=>{finish=resolve;}):{items:[],hasMore:!query,nextOffset:20});
 vi.mocked(readVoipContactContext).mockResolvedValue({candidates:[]});
 render(<VoipDirectoryPicker open onClose={()=>{}} onChoose={()=>{}} />);
 fireEvent.click(await screen.findByRole('button',{name:'داخلی‌های بیشتر'}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'جدید'}});
 await waitFor(()=>expect(readVoipContactContext).toHaveBeenCalledWith(expect.objectContaining({query:'جدید'}),expect.anything()));
 finish({items:[{id:'old',title:'نتیجهٔ قبلی',phone:'101'}],hasMore:false,nextOffset:40});
 await waitFor(()=>expect(screen.queryByText('نتیجهٔ قبلی')).not.toBeInTheDocument());
});
