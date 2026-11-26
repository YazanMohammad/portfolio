import type { ReactNode, Ref } from "react";

/**
 * The one admin page header: optional kicker, h1, one-line intro, optional actions.
 * Usage: <PageHeader kicker="Content" title="Projects" intro="What visitors see first." actions={<Button/>} />
 * Optional: titleId/titleRef make the h1 a focus target; count shows a small pill beside the title.
 */
export function PageHeader({
  kicker,
  title,
  intro,
  actions,
  titleId,
  titleRef,
  count,
}: {
  kicker?: string;
  title: string;
  intro?: string;
  actions?: ReactNode;
  titleId?: string;
  titleRef?: Ref<HTMLHeadingElement>;
  count?: number;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__text">
        {kicker && <p className="admin-kicker">{kicker}</p>}
        <h1 id={titleId} ref={titleRef} tabIndex={titleId ? -1 : undefined} style={titleId ? { outline: "none" } : undefined}>
          {title}
          {count !== undefined && <span className="admin-page-header__count">{count}</span>}
        </h1>
        {intro && <p className="admin-page-intro">{intro}</p>}
      </div>
      {actions && <div className="admin-page-header__actions">{actions}</div>}
    </header>
  );
}
