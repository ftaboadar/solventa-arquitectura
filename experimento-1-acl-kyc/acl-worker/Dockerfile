FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

ENV ACL_WORKER_PORT=5000
EXPOSE 5000

CMD ["python", "-m", "src.http.server"]
