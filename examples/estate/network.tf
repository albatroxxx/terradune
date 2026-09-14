# --- the application VPC ------------------------------------------------------

resource "aws_vpc" "app" {
  cidr_block           = "10.10.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "estate-app" }
}

resource "aws_internet_gateway" "app" {
  vpc_id = aws_vpc.app.id
  tags   = { Name = "estate-app" }
}

resource "aws_subnet" "app_public" {
  count                   = length(var.azs)
  vpc_id                  = aws_vpc.app.id
  availability_zone       = var.azs[count.index]
  cidr_block              = cidrsubnet(aws_vpc.app.cidr_block, 8, count.index)
  map_public_ip_on_launch = true
  tags                    = { Name = "estate-app-public-${var.azs[count.index]}" }
}

resource "aws_subnet" "app_private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.app.id
  availability_zone = var.azs[count.index]
  cidr_block        = cidrsubnet(aws_vpc.app.cidr_block, 8, count.index + 10)
  tags              = { Name = "estate-app-private-${var.azs[count.index]}" }
}

resource "aws_eip" "app_nat" {
  count      = length(var.azs)
  domain     = "vpc"
  depends_on = [aws_internet_gateway.app]
  tags       = { Name = "estate-app-nat-${var.azs[count.index]}" }
}

resource "aws_nat_gateway" "app" {
  count         = length(var.azs)
  allocation_id = aws_eip.app_nat[count.index].id
  subnet_id     = aws_subnet.app_public[count.index].id
  tags          = { Name = "estate-app-${var.azs[count.index]}" }
}

resource "aws_route_table" "app_public" {
  vpc_id = aws_vpc.app.id
  tags   = { Name = "estate-app-public" }
}

resource "aws_route" "app_internet" {
  route_table_id         = aws_route_table.app_public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.app.id
}

resource "aws_route_table_association" "app_public" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.app_public[count.index].id
  route_table_id = aws_route_table.app_public.id
}

resource "aws_route_table" "app_private" {
  count  = length(var.azs)
  vpc_id = aws_vpc.app.id
  tags   = { Name = "estate-app-private-${var.azs[count.index]}" }
}

resource "aws_route" "app_egress" {
  count                  = length(var.azs)
  route_table_id         = aws_route_table.app_private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.app[count.index].id
}

resource "aws_route_table_association" "app_private" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.app_private[count.index].id
  route_table_id = aws_route_table.app_private[count.index].id
}

resource "aws_network_acl" "app_private" {
  vpc_id     = aws_vpc.app.id
  subnet_ids = aws_subnet.app_private[*].id
  tags       = { Name = "estate-app-private" }
}

# --- the data VPC -------------------------------------------------------------

resource "aws_vpc" "data" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "estate-data" }
}

resource "aws_subnet" "data_private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.data.id
  availability_zone = var.azs[count.index]
  cidr_block        = cidrsubnet(aws_vpc.data.cidr_block, 8, count.index)
  tags              = { Name = "estate-data-${var.azs[count.index]}" }
}

resource "aws_route_table" "data" {
  vpc_id = aws_vpc.data.id
  tags   = { Name = "estate-data" }
}

resource "aws_route_table_association" "data" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.data_private[count.index].id
  route_table_id = aws_route_table.data.id
}

# --- joining the two ----------------------------------------------------------

resource "aws_ec2_transit_gateway" "main" {
  description = "estate"
  tags        = { Name = "estate" }
}

resource "aws_ec2_transit_gateway_vpc_attachment" "app" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
  vpc_id             = aws_vpc.app.id
  subnet_ids         = aws_subnet.app_private[*].id
  tags               = { Name = "estate-app" }
}

resource "aws_ec2_transit_gateway_vpc_attachment" "data" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
  vpc_id             = aws_vpc.data.id
  subnet_ids         = aws_subnet.data_private[*].id
  tags               = { Name = "estate-data" }
}

resource "aws_route" "app_to_data" {
  count                  = length(var.azs)
  route_table_id         = aws_route_table.app_private[count.index].id
  destination_cidr_block = aws_vpc.data.cidr_block
  transit_gateway_id     = aws_ec2_transit_gateway.main.id
  depends_on             = [aws_ec2_transit_gateway_vpc_attachment.app]
}

resource "aws_route" "data_to_app" {
  route_table_id         = aws_route_table.data.id
  destination_cidr_block = aws_vpc.app.cidr_block
  transit_gateway_id     = aws_ec2_transit_gateway.main.id
  depends_on             = [aws_ec2_transit_gateway_vpc_attachment.data]
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.app.id
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.app_private[*].id
  tags              = { Name = "estate-s3" }
}
