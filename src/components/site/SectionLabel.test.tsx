import {it,expect} from 'vitest';import {render,screen} from '@testing-library/react';
import {SectionLabel} from './SectionLabel';
it('hides only the numbered prefix from screen readers',()=>{const {container}=render(<SectionLabel text="[01] Work"/>);expect(container.querySelector('[aria-hidden=true]')).toHaveTextContent('[01]');expect(screen.getByText('Work')).toBeInTheDocument();});
it('keeps custom labels without a number intact',()=>{render(<SectionLabel text="Recent work"/>);expect(screen.getByText('Recent work')).toBeInTheDocument();});
