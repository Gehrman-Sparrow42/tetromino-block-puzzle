#!/usr/bin/env bash
set -euo pipefail
mkdir -p android-smoke
APK=$(find apk -name app-debug.apk -print -quit)
adb install -r "$APK"
adb logcat -c
adb shell svc wifi disable
adb shell svc data disable
adb shell am start -W -n com.berkay.afterblock/.MainActivity
sleep 12
adb shell pidof com.berkay.afterblock > android-smoke/pid.txt
adb exec-out screencap -p > android-smoke/home.png
adb shell uiautomator dump /sdcard/afterblock.xml
adb pull /sdcard/afterblock.xml android-smoke/home.xml
adb logcat -d > android-smoke/logcat.txt
if grep -q 'FATAL EXCEPTION' android-smoke/logcat.txt; then
  echo 'Android runtime crashed'; exit 1
fi
node scripts/android-smoke.cjs
