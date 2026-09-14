# A whole small AWS estate, across more than thirty services.
#
# The other examples each make one point. This one exists to be big and
# ordinary: two VPCs joined by a transit gateway, load balancers in front of
# instances and containers, databases and caches in private subnets, and the
# account-wide services — DNS, certificates, keys, queues, alarms — that every
# real codebase carries and no small example ever has.
#
# It ships applied, so every id in it is a real value. See the README.
#
# A few prominent services are missing on purpose. CloudFront, Step Functions
# and DynamoDB all call AWS while planning a resource that already exists — to
# validate a state machine definition, to describe a table — so they cannot be
# planned against a state that was never really applied. Everything here can.

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

variable "azs" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

locals {
  name   = "estate"
  domain = "estate.example.com"
}
