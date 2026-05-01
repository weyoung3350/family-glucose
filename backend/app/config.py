from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "家有糖人"
    APP_ENV: str = "development"
    JWT_SECRET: str = ""
    JWT_TTL_DAYS: int = 30

    WX_APPID: str = ""
    WX_SECRET: str = ""
    WX_MOCK_OPENID: str = ""

    LLM_PROVIDER: str = "deepseek"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    LLM_TIMEOUT_SEC: int = 5

    # 阿里 DashScope（语音识别用 qwen-omni-turbo，OpenAI 兼容模式）
    DASHSCOPE_API_KEY: str = ""
    DASHSCOPE_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ASR_MODEL: str = "qwen-omni-turbo"
    ASR_TIMEOUT_SEC: int = 25
    ASR_MAX_BYTES: int = 5 * 1024 * 1024  # 5MB

    DATABASE_URL: str = "sqlite:///./data/glucose.db"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS_RAW: str = Field(
        default="https://servicewechat.com",
        validation_alias="CORS_ORIGINS",
    )

    @property
    def CORS_ORIGINS(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS_RAW.split(",")
            if origin.strip()
        ]


settings = Settings()
