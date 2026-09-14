# --- the public load balancer -------------------------------------------------

resource "aws_lb" "public" {
  name               = "estate-public"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.edge.id]
  subnets            = aws_subnet.app_public[*].id
  tags               = { Name = "estate-public" }
}

resource "aws_lb_target_group" "worker" {
  name        = "estate-worker"
  port        = 8080
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = aws_vpc.app.id

  health_check { path = "/healthz" }
  tags = { Name = "estate-worker" }
}

resource "aws_lb_target_group" "api" {
  name        = "estate-api"
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.app.id

  health_check { path = "/api/healthz" }
  tags = { Name = "estate-api" }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.public.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate.public.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.worker.arn
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern { values = ["/api/*"] }
  }
}

resource "aws_lb_listener" "redirect" {
  load_balancer_arn = aws_lb.public.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# --- the internal load balancer -----------------------------------------------

resource "aws_lb" "internal" {
  name               = "estate-internal"
  internal           = true
  load_balancer_type = "network"
  subnets            = aws_subnet.app_private[*].id
  tags               = { Name = "estate-internal" }
}

resource "aws_lb_target_group" "internal" {
  name        = "estate-internal"
  port        = 5432
  protocol    = "TCP"
  target_type = "ip"
  vpc_id      = aws_vpc.app.id
  tags        = { Name = "estate-internal" }
}

resource "aws_lb_listener" "internal" {
  load_balancer_arn = aws_lb.internal.arn
  port              = 5432
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.internal.arn
  }
}

# --- names --------------------------------------------------------------------

resource "aws_route53_zone" "public" {
  name = local.domain
  tags = { Name = "estate-public" }
}

resource "aws_route53_zone" "internal" {
  name = "internal.${local.domain}"

  vpc {
    vpc_id = aws_vpc.app.id
  }

  tags = { Name = "estate-internal" }
}

resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.public.zone_id
  name    = local.domain
  type    = "A"

  alias {
    name                   = aws_lb.public.dns_name
    zone_id                = aws_lb.public.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "db" {
  zone_id = aws_route53_zone.internal.zone_id
  name    = "db.internal.${local.domain}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_rds_cluster.core.endpoint]
}

# --- the API front door -------------------------------------------------------

resource "aws_apigatewayv2_api" "public" {
  name          = "estate-public"
  protocol_type = "HTTP"
  tags          = { Name = "estate-public" }
}

resource "aws_apigatewayv2_integration" "thumbnailer" {
  api_id                 = aws_apigatewayv2_api.public.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.thumbnailer.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "thumbnailer" {
  api_id    = aws_apigatewayv2_api.public.id
  route_key = "POST /thumbnails"
  target    = "integrations/${aws_apigatewayv2_integration.thumbnailer.id}"
}

resource "aws_apigatewayv2_stage" "live" {
  api_id      = aws_apigatewayv2_api.public.id
  name        = "live"
  auto_deploy = true
  tags        = { Name = "estate-live" }
}
