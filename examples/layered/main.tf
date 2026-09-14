# The shape most real Terraform is in: a network module, an application
# module, and the wiring between them passed through a local.
#
# That last detail is the whole point of this example. Plan JSON contains no
# locals at all, so every reference that passes through one is invisible to
# terradune's reference resolution, and Terraform's own dependency graph is
# transitively reduced, so it cannot always be recovered from there either.
#
# What is left is the infrastructure itself: once applied, the instances carry
# the subnet ids they are actually in. That is what terradune reads here.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

module "network" {
  source = "./modules/network"
  cidr   = "10.40.0.0/16"
  azs    = ["us-east-1a", "us-east-1b"]
}

# Laundering the module's outputs through locals is what hides them: nothing
# below this point can be traced back to the network module from plan JSON.
locals {
  vpc_id     = module.network.vpc_id
  app_subnet = module.network.private_subnet_ids
  app_ports  = { http = 8080 }
}

module "app" {
  source     = "./modules/app"
  vpc_id     = local.vpc_id
  subnet_ids = local.app_subnet
  port       = local.app_ports.http
}
