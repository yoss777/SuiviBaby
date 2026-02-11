#!/bin/sh

# Install Node.js
brew install node

# Install dependencies
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install

# Install CocoaPods
cd "$CI_PRIMARY_REPOSITORY_PATH/ios"
pod install
