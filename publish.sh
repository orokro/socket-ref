#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status

# Ensure clean state
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working directory is not clean. Commit or stash changes first."
  exit 1
fi

# Bump version (updates package.json)
npm version patch --no-git-tag-version

# Get new version
VERSION=$(node -p "require('./package.json').version")
echo "Bumping to version $VERSION..."

# Build project
echo "Building..."
npm run build

# Commit changes
git add .
git commit -m "v$VERSION"

# Tag
git tag "v$VERSION"

# Publish
echo "Publishing to NPM..."
echo "Enter 2FA OTP code (if required), or press Enter to try without:"
read OTP

if [ -n "$OTP" ]; then
  npm publish --otp=$OTP
else
  npm publish
fi

# Push
echo "Pushing to git..."
git push
git push origin "v$VERSION"

echo "Done! v$VERSION published."