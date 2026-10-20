# redsky-ocr: Docling + Tesseract document extraction, CPU only.
#
# Railway builds the last stage. Build arguments (Railway passes service
# variables of the same name):
#   WITH_DOCLING_MODELS=true      bake Docling's layout and TableFormer models
#   WITH_GRANITE_DOCLING=false    also bake ibm-granite/granite-docling-258M
#                                 (only for REDSKY_OCR_GRANITE_DOCLING_MODE=local)
# Models are fetched here, at build time, and never by the running service.

ARG UBUNTU_IMAGE=ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac

FROM ${UBUNTU_IMAGE} AS base
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
# Tesseract 5 and its English model come from Ubuntu's archive (Apache-2.0,
# models trained and published by Google). Add tesseract-ocr-<lang> packages
# here for more languages, and list them in REDSKY_OCR_OCR_LANGUAGES.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3.12 python3.12-venv ca-certificates tesseract-ocr tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*


FROM base AS build
ARG WITH_DOCLING_MODELS=true
ARG WITH_GRANITE_DOCLING=false
ARG TORCH_VERSION=2.14.1
ARG TORCHVISION_VERSION=0.29.1
WORKDIR /build
RUN python3.12 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY requirements.lock requirements-models.lock ./
# Every package is pinned with a hash. torch is the one exception: its CPU
# builds exist only on PyTorch's own index, and PyPI's Linux wheels pull in
# several GB of CUDA libraries this service has no use for.
RUN if [ "$WITH_DOCLING_MODELS" = "true" ] || [ "$WITH_GRANITE_DOCLING" = "true" ]; then \
      pip install --no-cache-dir --no-deps --index-url https://download.pytorch.org/whl/cpu \
        "torch==${TORCH_VERSION}+cpu" "torchvision==${TORCHVISION_VERSION}+cpu" \
      && pip install --no-cache-dir --no-deps --require-hashes -r requirements-models.lock; \
    else \
      pip install --no-cache-dir --no-deps --require-hashes -r requirements.lock; \
    fi
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir --no-deps . && pip check
COPY scripts/download_models.py ./scripts/
RUN mkdir -p /opt/models \
 && if [ "$WITH_DOCLING_MODELS" = "true" ] || [ "$WITH_GRANITE_DOCLING" = "true" ]; then \
      python scripts/download_models.py /opt/models \
        $( [ "$WITH_GRANITE_DOCLING" = "true" ] && echo --granite-docling ); \
    fi


FROM base AS runtime
COPY --from=build /opt/venv /opt/venv
COPY --from=build /opt/models /opt/models
RUN useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin redsky \
 && mkdir -p /tmp/redsky-ocr && chown redsky /tmp/redsky-ocr && chmod 700 /tmp/redsky-ocr
ENV PATH=/opt/venv/bin:$PATH \
    REDSKY_OCR_DOCLING_ARTIFACTS_PATH=/opt/models \
    REDSKY_OCR_WORK_DIR=/tmp/redsky-ocr \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    DO_NOT_TRACK=1 \
    PORT=8080
USER 10001
EXPOSE 8080
CMD ["redsky-ocr", "serve"]
