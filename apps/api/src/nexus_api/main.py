from fastapi import FastAPI


app = FastAPI(
    title="NEXUS API",
    version="0.1.0",
    description="Backend placeholder for the NEXUS network survival analyzer.",
)


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}

