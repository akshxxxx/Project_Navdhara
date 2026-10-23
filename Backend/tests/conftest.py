import os
from pathlib import Path
import pytest

# Tests get their own SQLite file. They delete subscriptions and reports, so sharing
# data/landslide_nh7.db with a running demo server wiped live data (log.md L-021).
# Must be set before `app` is imported: config/database read DB_PATH at import time.
os.environ["DB_PATH"] = str(Path(__file__).resolve().parent.parent / "data" / "test_landslide_nh7.db")

from app import config
config.ENABLE_SCHEDULER = False
os.environ["ENABLE_SCHEDULER"] = "false"
from app.limiter import limiter
from app.database import init_db, get_db

# Module-level TestClient(app) instances never run the lifespan, so on a fresh checkout
# (no test database yet) the contract tests hit "no such table". Create it up front.
init_db()

@pytest.fixture(autouse=True)
def reset_limiter_and_db_state():
    """
    Ensure every test gets a clean rate limit quota and clean testclient records,
    preventing cross-test rate limit starvation and 10-minute duplicate report conflicts.
    """
    limiter.reset()
    try:
        with get_db() as conn:
            conn.execute("DELETE FROM field_reports WHERE reporter_ip = 'testclient'")
    except Exception:
        pass
    yield
    limiter.reset()
    try:
        with get_db() as conn:
            conn.execute("DELETE FROM field_reports WHERE reporter_ip = 'testclient'")
    except Exception:
        pass
