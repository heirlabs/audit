#!/bin/bash

echo "=== Removing Old VRF Code ==="
echo "This script will remove old VRF while preserving new randomness_v2"

# 1. Backup current state
echo "1. Creating backup..."
cp defai_swap/src/lib.rs defai_swap/src/lib.rs.backup
cp defai_swap/src/randomness.rs defai_swap/src/randomness.rs.backup
cp defai_swap/src/vrf.rs defai_swap/src/vrf.rs.backup

echo "2. Files to modify:"
echo "   - lib.rs: Remove old VRF functions, keep randomness usage"
echo "   - Move generate_vrf_random to randomness_v2.rs"
echo "   - Delete vrf.rs and randomness.rs after moving needed functions"

echo "Backup created. Ready to proceed with manual changes."