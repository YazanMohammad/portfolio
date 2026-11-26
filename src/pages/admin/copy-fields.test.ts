import {it,expect} from 'vitest';
import {siteCopy} from '@/content/copy';
import {copyFields} from './copy-fields';
import {flatten} from './SettingsEditor';
it('all 86 copy fields have a human label and a location hint',()=>{const keys=Object.keys(flatten(siteCopy));expect(keys).toHaveLength(86);expect(Object.keys(copyFields).sort()).toEqual(keys.sort());for(const [label,hint] of Object.values(copyFields)){expect(label).not.toContain('.');expect(hint.length).toBeGreaterThan(20);}});
it('flatten ignores malformed copy branches',()=>{expect(flatten({work:null,hero:{primary:'Work'},junk:42})).toEqual({'hero.primary':'Work'});});
