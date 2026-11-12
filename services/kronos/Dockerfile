FROM python@sha256:464bee9ac10a34b0c86031f12d94d7ccc4643725773b23eff4076305fafab420
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOME=/data HF_HOME=/data/weights HF_HUB_DISABLE_XET=1 HF_HUB_DISABLE_PROGRESS_BARS=1 HF_HUB_ETAG_TIMEOUT=20 HF_HUB_DOWNLOAD_TIMEOUT=90 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --disable-pip-version-check --no-cache-dir --only-binary=:all: -r requirements.txt
COPY forecast.py market.py server.py ./
COPY model ./model
COPY LICENSE ./KRONOS-LICENSE
USER 1000:1000
CMD ["python", "server.py"]
