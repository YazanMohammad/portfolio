import type { ReactNode } from "react";

/**
 * The one admin page header: optional kicker, h1, one-line intro, optional actions.
 * Usage: <PageHeader kicker="Content" title="Projects" intro="What visitors see first." actions={<Button/>} />
 */
export function PageHeader({
  kicker,
  title,
  intro,
  actions,
}: {
  kicker?: string;
  title: string;
  intro?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__text">
        {kicker && <p className="admin-kicker">{kicker}</p>}
        <h1>{title}</h1>
        {intro && <p className="admin-page-intro">{intro}</p>}
      </div>
      {actions && <div className="admin-page-header__actions">{actions}</div>}
    </header>
  );
}
