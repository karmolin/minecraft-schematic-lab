import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';

export function Layout({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  right?: ReactNode;
}) {
  const { t, toggleLang } = useI18n();

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">minecraft-schematic-lab</h1>
        <div className="app-header-right">
          <span className="app-tag">{t.header.tag}</span>
          <button className="lang-btn" onClick={toggleLang} aria-label="Switch language">
            {t.header.switchLang}
          </button>
        </div>
      </header>
      <div className={right ? 'app-body' : 'app-body no-right'}>
        <aside className="app-col app-col-left">{left}</aside>
        <main className="app-col app-col-center">{center}</main>
        {right ? <aside className="app-col app-col-right">{right}</aside> : null}
      </div>
    </div>
  );
}
