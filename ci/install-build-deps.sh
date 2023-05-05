#!/usr/bin/env bash

set -ex

echo "deb http://security.ubuntu.com/ubuntu focal-security main" | sudo tee /etc/apt/sources.list.d/focal-security.list
sudo apt update
sudo apt install -y build-essential libudev-dev binutils-dev libunwind-dev clang make pkg-config libssl-dev llvm libssl1.1