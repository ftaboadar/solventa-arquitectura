FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

ENV CONSOLIDADOR_PORT=7000
EXPOSE 7000

CMD ["python", "src/worker.py"]
