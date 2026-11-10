#!/usr/bin/env bash
# Submits every URL in the live sitemap to IndexNow (Bing, Yandex and others).
# Run after a deploy: ./scripts/indexnow.sh
set -euo pipefail

HOST="mattrutherfordcoaching.com"
KEY="89a411cd05bf50322c873e9644d04a81"
KEY_LOCATION="https://${HOST}/${KEY}.txt"
SITEMAP="https://${HOST}/sitemap.xml"

urls=$(curl -fsS "$SITEMAP" | grep -o '<loc>[^<]*</loc>' | sed -e 's#<loc>##' -e 's#</loc>##')
if [ -z "$urls" ]; then
    echo "No <loc> entries found in $SITEMAP" >&2
    exit 1
fi

url_list=$(printf '%s\n' "$urls" | sed 's/.*/"&"/' | paste -sd, -)
payload="{\"host\":\"${HOST}\",\"key\":\"${KEY}\",\"keyLocation\":\"${KEY_LOCATION}\",\"urlList\":[${url_list}]}"

status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "https://api.indexnow.org/indexnow" \
    -H "Content-Type: application/json; charset=utf-8" \
    --data "$payload")
echo "HTTP $status"
