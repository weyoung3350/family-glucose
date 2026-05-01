"""一键建表。已存在的表不会重建。"""
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import init_db


init_db()
print("ok")
