FROM python:3.12-slim

WORKDIR /app

# 只包含预约系统，不含你电脑上的私人文件
COPY server.py .
COPY static ./static
RUN mkdir -p /data

# Hugging Face Spaces 默认用 7860；其它平台可覆盖 PORT
ENV PORT=7860
ENV DATA_DIR=/data
# 访问码可在平台「Variables」里设置 ACCESS_PIN
ENV ACCESS_PIN=2580

EXPOSE 7860
CMD ["python", "server.py"]
