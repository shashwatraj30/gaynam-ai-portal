#!/bin/bash
# Legacy launcher (old name). Delegates to start_gyanam.sh.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/start_gyanam.sh"
