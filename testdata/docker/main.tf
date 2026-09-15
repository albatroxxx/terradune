terraform {
  required_version = ">= 1.4.0"
  backend "local" {}
}

resource "terraform_data" "network" {
  input = "synthetic network"
}

resource "terraform_data" "application" {
  input = terraform_data.network.output
}
