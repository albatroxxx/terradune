variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "port" { type = number }

resource "aws_security_group" "this" {
  name        = "modular-app"
  description = "Application tier"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = var.port
    to_port     = var.port
    protocol    = "tcp"
    cidr_blocks = ["10.40.0.0/16"]
  }

  tags = { Name = "modular-app" }
}

resource "aws_instance" "this" {
  count                  = length(var.subnet_ids)
  ami                    = "ami-0c101f26f147fa7fd"
  instance_type          = "t3.micro"
  subnet_id              = var.subnet_ids[count.index]
  vpc_security_group_ids = [aws_security_group.this.id]
  tags                   = { Name = "modular-app-${count.index}" }
}
