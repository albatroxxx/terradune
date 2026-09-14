# --- messaging ----------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name              = "estate-alerts"
  kms_master_key_id = aws_kms_key.logs.id
  tags              = { Name = "estate-alerts" }
}

resource "aws_sqs_queue" "jobs_dead" {
  name                      = "estate-jobs-dead"
  kms_master_key_id         = aws_kms_key.data.id
  message_retention_seconds = 1209600
  tags                      = { Name = "estate-jobs-dead" }
}

resource "aws_sqs_queue" "jobs" {
  name              = "estate-jobs"
  kms_master_key_id = aws_kms_key.data.id

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dead.arn
    maxReceiveCount     = 5
  })

  tags = { Name = "estate-jobs" }
}

resource "aws_sns_topic_subscription" "jobs" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.jobs.arn
}

# --- logs and alarms ----------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/estate/api"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.logs.arn
  tags              = { Name = "estate-api" }
}

resource "aws_cloudwatch_log_group" "thumbnailer" {
  name              = "/aws/lambda/${aws_lambda_function.thumbnailer.function_name}"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.logs.arn
  tags              = { Name = "estate-thumbnailer" }
}

resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "estate-unhealthy-hosts"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 60
  statistic           = "Average"
  threshold           = 0
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    TargetGroup  = aws_lb_target_group.worker.arn_suffix
    LoadBalancer = aws_lb.public.arn_suffix
  }

  tags = { Name = "estate-unhealthy-hosts" }
}

resource "aws_cloudwatch_metric_alarm" "queue_depth" {
  alarm_name          = "estate-queue-depth"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 300
  statistic           = "Average"
  threshold           = 1000
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = { QueueName = aws_sqs_queue.jobs.name }

  tags = { Name = "estate-queue-depth" }
}

# --- events and orchestration -------------------------------------------------

resource "aws_cloudwatch_event_rule" "nightly" {
  name                = "estate-nightly"
  schedule_expression = "cron(0 3 * * ? *)"
  tags                = { Name = "estate-nightly" }
}

resource "aws_cloudwatch_event_target" "nightly" {
  rule = aws_cloudwatch_event_rule.nightly.name
  arn  = aws_sqs_queue.jobs.arn
}

# --- backup and audit ---------------------------------------------------------

resource "aws_backup_vault" "main" {
  name        = "estate"
  kms_key_arn = aws_kms_key.data.arn
  tags        = { Name = "estate" }
}

resource "aws_backup_plan" "nightly" {
  name = "estate-nightly"

  rule {
    rule_name         = "nightly"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 * * ? *)"

    lifecycle { delete_after = 30 }
  }

  tags = { Name = "estate-nightly" }
}

resource "aws_cloudtrail" "main" {
  name                          = "estate"
  s3_bucket_name                = aws_s3_bucket.audit.id
  kms_key_id                    = aws_kms_key.logs.arn
  include_global_service_events = true
  is_multi_region_trail         = true
  tags                          = { Name = "estate" }
}
