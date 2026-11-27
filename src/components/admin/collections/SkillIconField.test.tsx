import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi, afterEach } from 'vitest';
import { SkillIconField } from './SkillIconField';
import type { AnyForm } from '../form/FormField';
const iconSvg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
afterEach(()=>vi.unstubAllGlobals());
it('searches through same-origin proxy, picks and removes an icon',async()=>{
 const setValue=vi.fn();
 const form={watch:()=>iconSvg,setValue} as unknown as AnyForm;
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify([{title:'React',slug:'react',variants:['dark','mono','default'],variant:'dark',iconSvg,preview:'data:image/svg+xml,'+encodeURIComponent(iconSvg)}]))));
 render(<SkillIconField form={form}/>); const user=userEvent.setup();
 await user.type(screen.getByRole('textbox',{name:'Find on theSVG'}),'react');
 await user.click(screen.getByRole('button',{name:'Search icons'}));
 await user.click(await screen.findByRole('button',{name:'Choose React'}));
 expect(setValue).toHaveBeenCalledWith('iconSvg',iconSvg,{shouldDirty:true,shouldValidate:true});
 await user.click(screen.getByRole('button',{name:'Remove icon'}));
 expect(setValue).toHaveBeenCalledWith('iconSvg',null,{shouldDirty:true,shouldValidate:true});
 expect(setValue).toHaveBeenCalledWith('iconSlug',null,{shouldDirty:true});
});
it('warns that styles and classes are removed from uploads',()=>{
 const form={watch:()=>null,setValue:vi.fn()} as unknown as AnyForm;
 render(<SkillIconField form={form}/>);
 expect(screen.getByText(/styles and classes are removed/i)).toBeInTheDocument();
});
it('lets an admin request a mono/default variant through the same-origin icon proxy',async()=>{
 const setValue=vi.fn();const form={watch:()=>null,setValue} as unknown as AnyForm;
 const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify([{title:'React',slug:'react',variants:['dark','mono','default'],variant:'mono',iconSvg,preview:'data:image/svg+xml,'+encodeURIComponent(iconSvg)}]))));
 vi.stubGlobal('fetch',fetcher);render(<SkillIconField form={form}/>);const user=userEvent.setup();
 await user.type(screen.getByRole('textbox',{name:'Find on theSVG'}),'react');
 await user.selectOptions(screen.getByLabelText('Icon variant'),'mono');
 await user.click(screen.getByRole('button',{name:'Search icons'}));
 await screen.findByRole('button',{name:'Choose React'});
 expect(fetcher.mock.calls[0][0]).toBe('/api/admin/icons?search=react&variant=mono');
 await user.selectOptions(screen.getByLabelText('Icon variant'),'default');
 await waitFor(()=>expect(fetcher.mock.calls.at(-1)?.[0]).toBe('/api/admin/icons?search=react&variant=default'));
});
it('reads an uploaded SVG into the field for sanitisation on save',async()=>{
 const setValue=vi.fn(); const form={watch:()=>null,setValue} as unknown as AnyForm;
 render(<SkillIconField form={form}/>);
 await userEvent.upload(screen.getByLabelText('Upload SVG'),new File([iconSvg],'icon.svg',{type:'image/svg+xml'}));
 await waitFor(()=>expect(setValue).toHaveBeenCalledWith('iconSvg',iconSvg,{shouldDirty:true,shouldValidate:true}));
});
