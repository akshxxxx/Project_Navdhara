import os
from pathlib import Path
import pytest

# Tests get their own SQLite file. They delete subscriptions and reports, so sharing
# data/landslide_nh7.db with a running demo server wiped live data (log.md L-021).
# Must be set before `app` is imported: config/database read DB_PATH at import time.
os.environ["DB_PATH"] = str(Path(__file__).resolve().parent.parent / "data" / "test_landslide_nh7.db")
# Same for the daily sensor log files (app/node_log.py): never write into logs/node_readings.
os.environ["NODE_LOG_DIR"] = str(Path(__file__).resolve().parent.parent / "data" / "test_node_logs")
# And for the rain snapshot: weather tests save mocked Open-Meteo answers (36 mm everywhere) as the
# snapshot. Written into data/rain_snapshot.json, the running server served that fake rain whenever
# live weather failed and the whole map turned High (log.md L-051). Tests start from a copy.
_DATA = Path(__file__).resolve().parent.parent / "data"
_TEST_SNAPSHOT = _DATA / "test_rain_snapshot.json"
if not _TEST_SNAPSHOT.exists() and (_DATA / "rain_snapshot.json").exists():
    _TEST_SNAPSHOT.write_bytes((_DATA / "rain_snapshot.json").read_bytes())
os.environ["SNAPSHOT_PATH"] = str(_TEST_SNAPSHOT)

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
