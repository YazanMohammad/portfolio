import type { Context } from '@netlify/functions';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),reserve:vi.fn(),search:vi.fn()}));
vi.mock('../../server/sessions',()=>({requireAdmin:m.auth}));
vi.mock('../../server/rate-limit',()=>({reserveSvglSearch:m.reserve}));
vi.mock('../../server/svgl',()=>({searchSvgl:m.search}));
import handler from '../../netlify/functions/admin-svgl';
import {fail} from '../../server/http';
const ctx={ip:'127.0.0.1'} as Context;
const request=()=>new Request('https://site.test/api/admin/svgl?search=react');
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('SITE_ORIGIN','https://site.test');vi.stubEnv('SESSION_SECRET',Buffer.alloc(32,3).toString('base64'));
 m.auth.mockResolvedValue({renewedCookie:null,session:{id:'admin',accountVersion:1}});
 m.reserve.mockResolvedValue({allowed:true});m.search.mockResolvedValue([]);
});
afterEach(()=>vi.unstubAllEnvs());
it('reserves a search before upstream work',async()=>{
 const response=await handler(request(),ctx);expect(response.status).toBe(200);
 expect(m.reserve).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));expect(m.search).toHaveBeenCalledWith('react');
 expect(m.reserve.mock.invocationCallOrder[0]).toBeLessThan(m.search.mock.invocationCallOrder[0]);
});
it('returns 429 with Retry-After and never fans out when limited',async()=>{
 m.reserve.mockResolvedValue({allowed:false,retryAfter:42});
 const response=await handler(request(),ctx);expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('42');
 expect((await response.json()).error.code).toBe('rate_limited');expect(m.search).not.toHaveBeenCalled();
});
it('requires authentication before reserving or fetching',async()=>{
 m.auth.mockRejectedValue(fail('unauthorized','Please log in.'));
 expect((await handler(request(),ctx)).status).toBe(401);expect(m.reserve).not.toHaveBeenCalled();expect(m.search).not.toHaveBeenCalled();
});
