# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY internal/ internal/
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -buildvcs=false \
    -ldflags="-s -w -X main.version=${VERSION}" -o /out/terradune .

FROM hashicorp/terraform:1.16.2@sha256:c3308fcbb530627c102c4c4b993e226b202429084328c3cc505cc2a69342e883
RUN addgroup -g 10001 terradune && adduser -D -u 10001 -G terradune terradune
COPY --from=build /out/terradune /usr/local/bin/terradune
COPY LICENSE /usr/share/licenses/terradune/LICENSE
ARG VERSION=dev
LABEL org.opencontainers.image.title="Terradune" \
      org.opencontainers.image.description="Local Terraform plan review with Resource Map, Plan, and Graph" \
      org.opencontainers.image.source="https://github.com/albatroxxx/terradune" \
      org.opencontainers.image.url="https://albatroxxx.github.io/terradune/" \
      org.opencontainers.image.version=$VERSION
ENV HOME=/home/terradune \
    TERRADUNE_HOST=0.0.0.0 \
    TF_DATA_DIR=.terradune \
    TF_IN_AUTOMATION=1 \
    TF_INPUT=0 \
    CHECKPOINT_DISABLE=1
WORKDIR /workspace
USER 10001:10001
EXPOSE 8383
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8383/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/terradune"]
CMD ["/workspace"]
