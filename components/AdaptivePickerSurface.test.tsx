import React from 'react';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import AdaptivePickerSurface from './AdaptivePickerSurface';
vi.mock('./OverlayEventBoundary',()=>({default:({children}:any)=><>{children}</>}));
afterEach(cleanup);
describe('nested picker surfaces',()=>{
  it('opens above a raised parent modal rather than using a lower fixed layer',async()=>{
    render(<div className="ant-modal-root"><div className="ant-modal-wrap" style={{zIndex:50000}}><AdaptivePickerSurface open title="انتخاب عضو" onClose={()=>{}}><button>همکار آزمایشی</button></AdaptivePickerSurface></div></div>);
    const option=await screen.findByRole('button',{name:'همکار آزمایشی'});
    await waitFor(()=>expect(Number(window.getComputedStyle(option.closest('.ant-modal-wrap')!).zIndex)).toBeGreaterThan(50000));
  });
  it('preserves the configured base when there is no enclosing modal',async()=>{
    render(<AdaptivePickerSurface open title="انتخاب عضو" zIndex={1800} onClose={()=>{}}><button>همکار آزمایشی</button></AdaptivePickerSurface>);
    const option=await screen.findByRole('button',{name:'همکار آزمایشی'});
    expect(Number(window.getComputedStyle(option.closest('.ant-modal-wrap')!).zIndex)).toBe(1801);
  });
});
