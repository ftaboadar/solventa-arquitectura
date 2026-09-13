FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

ENV UNDER_PORT=6000
EXPOSE 6000

CMD ["python", "src/server.py"]
