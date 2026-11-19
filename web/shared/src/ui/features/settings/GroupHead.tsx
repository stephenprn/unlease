/** A group's name inside a long panel, under its hairline (`.groupHead`): S3's connection, schedule and backups. */
import styles from './settings.module.css';

export function GroupHead({ title }: { title: string }) {
  return <h3 className={`${styles.groupHead} t-section`}>{title}</h3>;
}
