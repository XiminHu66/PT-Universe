FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOME=/tmp OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /source
COPY services/on-demand-data/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY services/on-demand-data services/on-demand-data
COPY apps/3c-scout/scripts/fetch_products.py apps/3c-scout/scripts/fetch_products.py
COPY scripts/investment/refresh.py scripts/investment/refresh.py
COPY apps/stock-alert/scripts/fetch_market.py apps/stock-alert/scripts/fetch_market.py
COPY apps/3c-scout/data/products.json apps/3c-scout/data/products.json
COPY apps/investment-desk/data/public-trades.json apps/investment-desk/data/public-trades.json
COPY apps/stock-alert/data/market.json apps/stock-alert/data/market.json
RUN chmod -R a+rX /source
USER 1000:1000
CMD ["python","services/on-demand-data/server.py"]
