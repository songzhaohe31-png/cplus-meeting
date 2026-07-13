FROM python:3.12-slim

WORKDIR /app

# 仅复制预约系统，不含你电脑上的任何私人文件
COPY server.py .
COPY static ./static
RUN mkdir -p /data

ENV PORT=10000
ENV DATA_DIR=/data
# 部署后在平台环境变量里设置 ACCESS_PIN（推荐）
# ENV ACCESS_PIN=你的访问码

EXPOSE 10000
CMD ["python", "server.py"]
