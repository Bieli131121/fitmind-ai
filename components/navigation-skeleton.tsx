import styles from "./navigation-skeleton.module.css";

type PageKind = "dashboard" | "financeiro" | "admin";

const titles: Record<PageKind, string> = {
  dashboard: "Seu painel",
  financeiro: "Meu financeiro",
  admin: "Painel administrativo",
};

export default function NavigationSkeleton({ page }: { page: PageKind }) {
  return (
    <main className={styles.page} role="status" aria-label={`Carregando ${titles[page]}`} aria-busy="true">
      <div className={styles.content}>
        <div className={styles.topbar}>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>FITMIND AI</span>
            <h1>{titles[page]}</h1>
            <div className={`${styles.shimmer} ${styles.line}`} />
          </div>
          <div className={`${styles.shimmer} ${styles.action}`} />
        </div>
        <div className={`${styles.shimmer} ${styles.feature}`} />
        <div className={styles.grid}>
          <div className={styles.card}><div className={`${styles.shimmer} ${styles.label}`} /><div className={`${styles.shimmer} ${styles.metric}`} /><div className={`${styles.shimmer} ${styles.line}`} /></div>
          <div className={styles.card}><div className={`${styles.shimmer} ${styles.label}`} /><div className={`${styles.shimmer} ${styles.metric}`} /><div className={`${styles.shimmer} ${styles.line}`} /></div>
          <div className={styles.card}><div className={`${styles.shimmer} ${styles.label}`} /><div className={`${styles.shimmer} ${styles.metric}`} /><div className={`${styles.shimmer} ${styles.line}`} /></div>
        </div>
        <p className={styles.footnote}>Carregando suas informações...</p>
      </div>
    </main>
  );
}
