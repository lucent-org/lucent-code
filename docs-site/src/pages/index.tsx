import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Docs" description="Lucent Code documentation">
      <main className={styles.heroBanner}>
        <img src="img/icon.svg" alt="Lucent Code" className={styles.logo} />
        <h1 className={`${styles.title} gradient-text`}>{siteConfig.title}</h1>
        <p className={styles.tagline}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/user-guide/getting-started"
          >
            Get Started →
          </Link>
          <Link
            className="button button--secondary button--lg"
            href="https://lucentcode.dev"
          >
            ← lucentcode.dev
          </Link>
        </div>
      </main>
    </Layout>
  );
}
