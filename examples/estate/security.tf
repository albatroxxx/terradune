# --- keys and secrets ---------------------------------------------------------

resource "aws_kms_key" "data" {
  description             = "estate data at rest"
  deletion_window_in_days = 10
  enable_key_rotation     = true
  tags                    = { Name = "estate-data" }
}

resource "aws_kms_alias" "data" {
  name          = "alias/estate-data"
  target_key_id = aws_kms_key.data.key_id
}

resource "aws_kms_key" "logs" {
  description             = "estate logs at rest"
  deletion_window_in_days = 10
  tags                    = { Name = "estate-logs" }
}

resource "aws_kms_alias" "logs" {
  name          = "alias/estate-logs"
  target_key_id = aws_kms_key.logs.key_id
}

resource "aws_secretsmanager_secret" "api" {
  name       = "estate/api-token"
  kms_key_id = aws_kms_key.data.id
  tags       = { Name = "estate-api" }
}

resource "aws_ssm_parameter" "endpoint" {
  name  = "/estate/api/endpoint"
  type  = "String"
  value = "https://${local.domain}"
  tags  = { Name = "estate-endpoint" }
}

resource "aws_acm_certificate" "public" {
  domain_name       = local.domain
  validation_method = "DNS"
  tags              = { Name = "estate" }
}

# --- who may do what ----------------------------------------------------------

resource "aws_iam_role" "app" {
  name = "estate-app"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" } }]
  })
  tags = { Name = "estate-app" }
}

resource "aws_iam_instance_profile" "app" {
  name = "estate-app"
  role = aws_iam_role.app.name
}

resource "aws_iam_role" "task" {
  name = "estate-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
  tags = { Name = "estate-task" }
}

resource "aws_iam_role" "lambda" {
  name = "estate-lambda"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }]
  })
  tags = { Name = "estate-lambda" }
}

resource "aws_iam_policy" "app_read" {
  name = "estate-app-read"
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Action = ["s3:GetObject"], Effect = "Allow", Resource = "${aws_s3_bucket.assets.arn}/*" }]
  })
}

resource "aws_iam_role_policy_attachment" "app_read" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app_read.arn
}

# --- who may reach what -------------------------------------------------------

resource "aws_security_group" "edge" {
  name        = "estate-edge"
  description = "Public ingress"
  vpc_id      = aws_vpc.app.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "estate-edge" }
}

resource "aws_security_group" "app" {
  name        = "estate-app"
  description = "Application tier"
  vpc_id      = aws_vpc.app.id

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.edge.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "estate-app" }
}

resource "aws_security_group" "cache" {
  name        = "estate-cache"
  description = "Redis"
  vpc_id      = aws_vpc.app.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  tags = { Name = "estate-cache" }
}

resource "aws_security_group" "files" {
  name        = "estate-files"
  description = "EFS"
  vpc_id      = aws_vpc.app.id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  tags = { Name = "estate-files" }
}

resource "aws_security_group" "db" {
  name        = "estate-db"
  description = "Databases"
  vpc_id      = aws_vpc.data.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.app.cidr_block]
  }
  tags = { Name = "estate-db" }
}
