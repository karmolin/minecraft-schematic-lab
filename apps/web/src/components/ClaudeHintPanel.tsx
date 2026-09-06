import { useI18n } from '../i18n/I18nContext';

export function ClaudeHintPanel() {
  const { t } = useI18n();
  return (
    <section className="panel claude-hint">
      <h2 className="panel-title">{t.claudeHint.title}</h2>
      <p>{t.claudeHint.intro}</p>
      <p className="example-prompt">{t.claudeHint.example}</p>
      <p className="muted">{t.claudeHint.description}</p>
    </section>
  );
}
