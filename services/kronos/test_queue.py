import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import pandas as pd
from market import HistoryError, completed_session, exchange_calendar, prepare_history
from server import JobStore


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.now = datetime(2026, 11, 12, 20, tzinfo=timezone.utc)
        self.room = False
        self.store = self.make_store()

    def make_store(self):
        return JobStore(self.folder.name, clock=lambda: self.now.timestamp(), room=lambda: self.room, autostart=False)

    def test_queue_persists_and_deduplicates_under_low_memory(self):
        self.assertEqual(self.store.request('TSLA', True)['state'], 'queued')
        self.assertEqual(self.store.request('TSLA', True)['queuePosition'], 1)
        self.assertEqual(self.store.request('MSFT', True)['queuePosition'], 2)
        restored = self.make_store()
        self.assertIsNone(restored.next_job())
        self.room = True
        symbol, session, attempt = restored.next_job()
        self.assertEqual((symbol, session, attempt['count']), ('TSLA', '2026-11-11', 1))
        self.assertEqual(restored.request('TSLA', False)['state'], 'running')
        self.assertEqual(restored.request('MSFT', False)['state'], 'queued')

    def test_global_budget_and_cached_result(self):
        with patch('server.MAX_DAILY', 1):
            self.assertEqual(self.store.request('MSFT', True)['state'], 'queued')
            self.assertEqual(self.store.request('TSLA', True)['state'], 'limited')
            self.store.write('TSLA', {'asOf': '2026-11-11'})
            self.assertEqual(self.store.request('TSLA', True)['state'], 'fresh')

    def test_calendar_and_recent_listing(self):
        sunday = datetime(2026, 11, 15, 12, tzinfo=timezone.utc)
        self.assertEqual(str(completed_session('MSFT', sunday)), '2026-11-13')
        self.assertEqual(str(completed_session('BTC-USD', sunday)), '2026-11-14')
        calendar = exchange_calendar('TSLA')
        end = pd.Timestamp('2026-11-11')
        days = calendar.sessions_window(end, -61)
        frame = pd.DataFrame({'open': 100., 'high': 104., 'low': 99., 'close': 103., 'adjclose': 103., 'volume': 0.}, index=days)
        self.assertEqual(len(prepare_history(frame, calendar, end)), 61)
        with self.assertRaises(HistoryError):
            prepare_history(frame.iloc[-10:], calendar, end)
        with self.assertRaises(HistoryError):
            prepare_history(frame.iloc[:-1], calendar, end)


if __name__ == '__main__':
    unittest.main()
