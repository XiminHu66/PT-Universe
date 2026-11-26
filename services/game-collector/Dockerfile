FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PT_CHROMIUM_EXECUTABLE=/usr/bin/chromium HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir requests==2.32.5 beautifulsoup4==4.13.4 lxml==6.0.0 playwright==1.54.0
WORKDIR /source
COPY --chown=1000:1000 apps/tsugi-checker/scraper/games.py apps/tsugi-checker/scraper/run_games.py apps/tsugi-checker/scraper/steam_pc.py apps/tsugi-checker/scraper/game_enrich.py ./apps/tsugi-checker/scraper/
COPY --chown=1000:1000 apps/tsugi-checker/config/content.json ./apps/tsugi-checker/config/content.json
COPY --chown=1000:1000 apps/tsugi-checker/data/game-releases.json apps/tsugi-checker/data/game-state.json ./apps/tsugi-checker/data/
COPY --chown=1000:1000 scripts/tsugi/refresh_policy.py ./scripts/tsugi/refresh_policy.py
COPY --chown=1000:1000 services/game-collector/run.py ./services/game-collector/run.py
USER 1000:1000
CMD ["python", "services/game-collector/run.py"]
