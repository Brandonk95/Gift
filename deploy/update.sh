#!/bin/sh
# Update the app on your server to the newest version. Run it from the folder with
# docker-compose.yml and .env:  ./update.sh
#
# - In a folder with only docker-compose.yml + .env (the GitHub-built image):
#   downloads the newest image and restarts.
# - In a full git checkout of the project (building on the server): pulls the
#   newest code and rebuilds.
# Your data lives in the giftlist_data volume and is kept either way. PocketBase
# applies any database changes (migrations) by itself when it starts.
set -e
cd "$(dirname "$0")"

if [ -f Dockerfile ] && [ -d .git ]; then
  echo "Pulling the newest code…"
  git pull --ff-only
  docker compose up -d --build
else
  echo "Downloading the newest image…"
  docker compose pull
  docker compose up -d
fi

docker image prune -f >/dev/null
echo "Waiting for the app to come back…"
i=0
until docker compose exec -T giftlist wget -qO- http://127.0.0.1:8090/api/health >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "The app didn't answer after 60 seconds. Check the logs: docker compose logs --tail=50 giftlist"
    exit 1
  fi
  sleep 2
done
echo "Updated and running."
