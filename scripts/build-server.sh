#!/bin/sh
set -eu
repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
# One compiler process at a time reduces peak memory on small VPS instances.
# A release build can still exceed 1 GB: building on another Linux host is preferred.
CARGO_PROFILE_RELEASE_DEBUG=0 cargo build \
  --manifest-path "$repo_dir/backend/Cargo.toml" \
  --release --locked --jobs 1 --bin contraption-room-server
printf '\nServer binary: %s/backend/target/release/contraption-room-server\n' "$repo_dir"
