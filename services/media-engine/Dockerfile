FROM dart:stable AS novel
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone https://github.com/Montaro2017/bili_novel_packer.git . && git checkout 9774efe8221a03341f677a03aceb4929c1559220
COPY novel_adapter.dart bin/pt_adapter.dart
RUN dart pub get && dart compile exe bin/pt_adapter.dart -o /novel-adapter

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends aria2 ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=novel /novel-adapter /usr/local/bin/novel-adapter
COPY --from=novel /src/LICENSE /app/BILI-NOVEL-PACKER-LICENSE
COPY engine.py .
RUN useradd -m -u 10001 media && mkdir /data && chown media:media /data
USER media
ENV MEDIA_DATA=/data MEDIA_BIND=0.0.0.0
EXPOSE 8789
CMD ["python", "-u", "engine.py"]
