FROM python:3.12-slim

WORKDIR /app

# 只包含预约系统，不含你电脑私人文件
COPY server.py .
COPY static ./static
RUN mkdir -p /data

# Render 会注入 PORT；本地默认 10000
ENV PORT=10000
ENV DATA_DIR=/data
# 可在 Render 后台 Environment 覆盖
ENV ACCESS_PIN=2580

EXPOSE 10000
CMD ["python", "server.py"]
