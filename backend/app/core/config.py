from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Valeurs lues dans l'environnement : docker compose les injecte depuis .env.dev,
    # .env.preprod ou .env.prod.
    model_config = SettingsConfigDict(env_prefix="DATAHUB_")

    env: str = "dev"
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "datahub"
    mongo_timeout_ms: int = 5000


settings = Settings()
