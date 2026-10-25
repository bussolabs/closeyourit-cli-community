/**
 * Event types accepted by alert rules — mirror of the backend enum (Alerting::Rule).
 *
 * CYRA-519: the list had stopped at the first fifteen, so `--event-type` rejected every type added
 * since (containers, replication, inodes, automation, vulnerabilities…) — the flag looked broken
 * while the backend accepted them. Keep this in the same order as the backend enum: appending there
 * means appending here.
 */
export const ALERT_EVENT_TYPES = [
  'error_new',
  'error_regression',
  'uptime_down',
  'uptime_up',
  'metric_threshold',
  'uptime_ssl_expiring',
  'cron_missed',
  'server_down',
  'server_up',
  'server_cpu',
  'server_mem',
  'server_disk',
  'server_temp',
  'server_service_failed',
  'server_smart_failing',
  'error_spike',
  'log_alert',
  'server_db_down',
  'server_db_connections',
  'server_replication_lag',
  'agents_stalled',
  'server_container_down',
  'agents_host_failing',
  'uptime_slow',
  'analytics_traffic_drop',
  'analytics_traffic_spike',
  'idea_created',
  'idea_commented',
  'workload_due_soon',
  'dataset_training_completed',
  'dataset_training_failed',
  'agents_host_stale',
  'vulnerability_new',
  'runtime_eol',
  'embedding_down',
  'server_container_up',
  'server_db_connection_usage',
  'server_data_volume_disk',
  'server_inode',
  'server_replication_down',
  'server_replication_up',
  'server_container_restart_loop',
  'server_container_stable',
  'seo_issue_new',
]
