import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiMessageComposer from './AiMessageComposer';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('shared AI composer submission', () => {
  it('sends intentional desktop Enter and preserves Shift, IME and mobile input', () => {
    const submit=vi.fn();
    const props={value:'پیام',onChange:vi.fn(),onSubmit:submit,tools:null,model:null};
    render(<AiMessageComposer {...props} />);
    const input=screen.getByRole('textbox');
    vi.spyOn(window,'matchMedia').mockReturnValue({matches:false} as MediaQueryList);
    fireEvent.keyDown(input,{key:'Enter',code:'Enter',charCode:13,keyCode:13,shiftKey:true});
    fireEvent.keyDown(input,{key:'Enter',code:'Enter',charCode:13,keyCode:13,isComposing:true});
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input,{key:'Enter',code:'Enter',charCode:13,keyCode:13});
    expect(submit).toHaveBeenCalledTimes(1);
    vi.mocked(window.matchMedia).mockReturnValue({matches:true} as MediaQueryList);
    fireEvent.keyDown(input,{key:'Enter',code:'Enter',charCode:13,keyCode:13});
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'ارسال پیام'}));
    expect(submit).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
  it('blocks empty, disabled and busy submits including attachment-only sends', () => {
    const submit=vi.fn();
    const props={value:'',onChange:vi.fn(),onSubmit:submit,tools:null,model:null};
    const {rerender}=render(<AiMessageComposer {...props} />);
    expect(screen.getByRole('button',{name:'ارسال پیام'})).toBeDisabled();
    rerender(<AiMessageComposer {...props} canSubmit busy />);
    fireEvent.click(screen.getByRole('button',{name:'ارسال پیام'}));
    expect(submit).not.toHaveBeenCalled();
    rerender(<AiMessageComposer {...props} canSubmit disabled />);
    expect(screen.getByRole('button',{name:'ارسال پیام'})).toBeDisabled();
    rerender(<AiMessageComposer {...props} canSubmit />);
    fireEvent.click(screen.getByRole('button',{name:'ارسال پیام'}));
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('supports slash suggestions without breaking normal typing', () => {
    const onChange = vi.fn();
    const onSelectSuggestion = vi.fn();
    const { rerender } = render(
      <AiMessageComposer
        value=""
        onChange={onChange}
        onSubmit={vi.fn()}
        tools={null}
        model={null}
        suggestions={[
          { label: 'جستجو در اینترنت', value: 'cap:web_search', trigger: '/', keywords: 'web' },
          { label: 'تحلیلگر فروش', value: 'agent:sales_leads', trigger: '@', keywords: 'sales' },
        ]}
        onSelectSuggestion={onSelectSuggestion}
      />,
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/' } });
    expect(onChange).toHaveBeenCalledWith('/');
    rerender(
      <AiMessageComposer
        value="/"
        onChange={onChange}
        onSubmit={vi.fn()}
        tools={null}
        model={null}
        suggestions={[
          { label: 'جستجو در اینترنت', value: 'cap:web_search', trigger: '/', keywords: 'web' },
          { label: 'تحلیلگر فروش', value: 'agent:sales_leads', trigger: '@', keywords: 'sales' },
        ]}
        onSelectSuggestion={onSelectSuggestion}
      />,
    );
    expect(screen.getByText('جستجو در اینترنت')).toBeInTheDocument();
    expect(screen.queryByText('تحلیلگر فروش')).not.toBeInTheDocument();
  });
});
