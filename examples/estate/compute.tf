# --- instances ----------------------------------------------------------------

resource "aws_instance" "app" {
  count                  = length(var.azs)
  ami                    = "ami-0c101f26f147fa7fd"
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.app_private[count.index].id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name
  tags                   = { Name = "estate-app-${var.azs[count.index]}" }
}

resource "aws_ebs_volume" "app" {
  count             = length(var.azs)
  availability_zone = var.azs[count.index]
  size              = 20
  encrypted         = true
  kms_key_id        = aws_kms_key.data.arn
  tags              = { Name = "estate-app-${var.azs[count.index]}" }
}

resource "aws_volume_attachment" "app" {
  count       = length(var.azs)
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.app[count.index].id
  instance_id = aws_instance.app[count.index].id
}

resource "aws_launch_template" "worker" {
  name          = "estate-worker"
  image_id      = "ami-0c101f26f147fa7fd"
  instance_type = "t3.small"

  vpc_security_group_ids = [aws_security_group.app.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.app.name
  }

  tags = { Name = "estate-worker" }
}

resource "aws_autoscaling_group" "worker" {
  name                = "estate-worker"
  min_size            = 2
  max_size            = 6
  desired_capacity    = 2
  vpc_zone_identifier = aws_subnet.app_private[*].id
  target_group_arns   = [aws_lb_target_group.worker.arn]

  launch_template {
    id      = aws_launch_template.worker.id
    version = "$Latest"
  }
}

# --- shared files -------------------------------------------------------------

resource "aws_efs_file_system" "shared" {
  encrypted  = true
  kms_key_id = aws_kms_key.data.arn
  tags       = { Name = "estate-shared" }
}

resource "aws_efs_mount_target" "shared" {
  count           = length(var.azs)
  file_system_id  = aws_efs_file_system.shared.id
  subnet_id       = aws_subnet.app_private[count.index].id
  security_groups = [aws_security_group.files.id]
}

# --- containers ---------------------------------------------------------------

resource "aws_ecr_repository" "api" {
  name = "estate-api"
  tags = { Name = "estate-api" }
}

resource "aws_ecs_cluster" "main" {
  name = "estate"
  tags = { Name = "estate" }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "estate-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.task.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${aws_ecr_repository.api.repository_url}:latest"
    essential = true
    portMappings = [{ containerPort = 8080, protocol = "tcp" }]
  }])

  tags = { Name = "estate-api" }
}

resource "aws_ecs_service" "api" {
  name            = "estate-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.app_private[*].id
    security_groups = [aws_security_group.app.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }

  tags = { Name = "estate-api" }
}

# --- functions ----------------------------------------------------------------

resource "aws_lambda_function" "thumbnailer" {
  function_name = "estate-thumbnailer"
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:thumbnailer"
  kms_key_arn   = aws_kms_key.data.arn

  vpc_config {
    subnet_ids         = aws_subnet.app_private[*].id
    security_group_ids = [aws_security_group.app.id]
  }

  tags = { Name = "estate-thumbnailer" }
}
