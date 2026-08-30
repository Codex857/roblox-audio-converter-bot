#!/bin/sh
set -eu

# Railway mounts the volume after image build, so ownership must be fixed at
# container startup. The bot itself still runs as the unprivileged node user.
mkdir -p "${DATA_DIR:-/app/data}"
chown -R node:node "${DATA_DIR:-/app/data}"
exec gosu node "$@"
