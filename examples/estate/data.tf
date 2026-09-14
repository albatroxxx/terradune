# --- object storage -----------------------------------------------------------

resource "aws_s3_bucket" "assets" {
  bucket = "estate-assets-example"
  tags   = { Name = "estate-assets" }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.data.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "audit" {
  bucket = "estate-audit-example"
  tags   = { Name = "estate-audit" }
}

# --- relational ---------------------------------------------------------------

resource "aws_db_subnet_group" "main" {
  name       = "estate"
  subnet_ids = aws_subnet.data_private[*].id
  tags       = { Name = "estate" }
}

resource "aws_db_instance" "reporting" {
  identifier                  = "estate-reporting"
  engine                      = "postgres"
  instance_class              = "db.t4g.micro"
  allocated_storage           = 20
  db_subnet_group_name        = aws_db_subnet_group.main.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  username                    = "estate"
  manage_master_user_password = true
  storage_encrypted           = true
  kms_key_id                  = aws_kms_key.data.arn
  skip_final_snapshot         = true
  tags                        = { Name = "estate-reporting" }
}

resource "aws_rds_cluster" "core" {
  cluster_identifier          = "estate-core"
  engine                      = "aurora-postgresql"
  database_name               = "estate"
  master_username             = "estate"
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.main.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  storage_encrypted           = true
  kms_key_id                  = aws_kms_key.data.arn
  skip_final_snapshot         = true
  tags                        = { Name = "estate-core" }
}

resource "aws_rds_cluster_instance" "core" {
  count               = length(var.azs)
  identifier          = "estate-core-${count.index}"
  cluster_identifier  = aws_rds_cluster.core.id
  instance_class      = "db.t4g.medium"
  engine              = aws_rds_cluster.core.engine
  db_subnet_group_name = aws_db_subnet_group.main.name
  tags                = { Name = "estate-core-${count.index}" }
}

# --- cache, streams and analytics ---------------------------------------------

resource "aws_elasticache_subnet_group" "main" {
  name       = "estate"
  subnet_ids = aws_subnet.app_private[*].id
}

resource "aws_elasticache_cluster" "sessions" {
  cluster_id           = "estate-sessions"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.cache.id]
  tags                 = { Name = "estate-sessions" }
}

resource "aws_kinesis_stream" "events" {
  name             = "estate-events"
  shard_count      = 1
  encryption_type  = "KMS"
  kms_key_id       = aws_kms_key.data.arn
  retention_period = 24
  tags             = { Name = "estate-events" }
}

resource "aws_glue_catalog_database" "events" {
  name = "estate_events"
}

resource "aws_glue_catalog_table" "events" {
  name          = "events"
  database_name = aws_glue_catalog_database.events.name
  table_type    = "EXTERNAL_TABLE"

  storage_descriptor {
    location = "s3://${aws_s3_bucket.assets.bucket}/events/"

    columns {
      name = "id"
      type = "string"
    }
  }
}

resource "aws_athena_workgroup" "analysts" {
  name = "estate-analysts"

  configuration {
    result_configuration {
      output_location = "s3://${aws_s3_bucket.audit.bucket}/athena/"

      encryption_configuration {
        encryption_option = "SSE_KMS"
        kms_key_arn       = aws_kms_key.data.arn
      }
    }
  }

  tags = { Name = "estate-analysts" }
}

resource "aws_service_discovery_private_dns_namespace" "internal" {
  name = "estate.internal"
  vpc  = aws_vpc.app.id
  tags = { Name = "estate-internal" }
}

resource "aws_service_discovery_service" "api" {
  name = "api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id

    dns_records {
      ttl  = 60
      type = "A"
    }
  }

  tags = { Name = "estate-api" }
}
