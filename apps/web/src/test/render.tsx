import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../i18n/I18nContext';

export function renderWithI18n(ui: ReactElement) {
  localStorage.setItem('msl-lang', 'en');
  return render(ui, { wrapper: I18nProvider });
}
