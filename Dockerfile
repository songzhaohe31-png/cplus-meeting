FROM python:3.12-slim

WORKDIR /app

# 只包含预约系统，不含你电脑私人文件
COPY server.py .
COPY static ./static
RUN mkdir -p /data

# Render 会注入 PORT；本地默认 10000
ENV PORT=10000
ENV DATA_DIR=/data
# 默认无访问码：扫码直接预约。若以后要密码，在 Render 环境变量加 ACCESS_PIN 即可
ENV ACCESS_PIN=

EXPOSE 10000
CMD ["python", "server.py"]
