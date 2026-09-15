FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 go build -o /out/worker .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /out/worker /usr/local/bin/worker
ENV PORT=8080
EXPOSE 8080
CMD ["worker"]
